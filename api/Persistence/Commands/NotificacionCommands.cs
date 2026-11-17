using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PicoCriollo.Domain.DTOs.NotificacionesD;
using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Entities.NotificacionesE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure.Push;
using PicoCriollo.Persistence.Mercado;
using PicoCriollo.Persistence.Notificaciones;

namespace PicoCriollo.Persistence.Commands
{
    public record ResultadoSalida(int Procesados, int Creadas, int Fallidos);

    public interface INotificacionCommands
    {
        /// <summary>Convierte los eventos pendientes de la bandeja de salida en notificaciones y, si la persona lo activó, en avisos push.</summary>
        Task<ResultadoSalida> ProcesarSalidaAsync(int limite = 50);
        Task<int> LeerAsync(Guid usuario, IReadOnlyList<string> ids);
        Task<int> LeerTodasAsync(Guid usuario);
        Task<int> LeerEnlaceAsync(Guid usuario, string tipo, string enlaceId);
        Task<PreferenciasDto> ActualizarPreferenciasAsync(Guid usuario, PreferenciasCambioDto cambios);
        Task RegistrarDispositivoAsync(Guid usuario, DispositivoDto dto);
        Task QuitarDispositivoAsync(Guid usuario, string token);
        /// <summary>Genera los recordatorios que tocan hoy para una persona (incubación, tareas, existencias, operaciones). Cada aviso se genera una sola vez.</summary>
        Task<int> EscanearRecordatoriosAsync(string usuarioId);
        Task<(int Personas, int Emitidos)> EscanearTodosAsync();
    }

    /// <summary>
    /// Notificaciones: la bandeja de salida (<c>pc_outbox</c>) que llenan las órdenes del mercado y de la granja se convierte aquí en avisos,
    /// respetando las preferencias de cada persona. Es idempotente: la clave (persona, evento) impide duplicados aunque se reprocese.
    /// Los eventos que esta API no conoce (la moderación) se dejan pendientes para la app que sí los procesa.
    /// </summary>
    public class NotificacionCommands : INotificacionCommands
    {
        private const int MaximoIntentos = 5;

        private readonly AlmacenMercado _a;
        private readonly IEnviadorPush _push;
        private readonly ILogger<NotificacionCommands> _logger;

        public NotificacionCommands(AlmacenMercado almacen, IEnviadorPush push, ILogger<NotificacionCommands> logger)
        {
            _a = almacen;
            _push = push;
            _logger = logger;
        }

        public async Task<ResultadoSalida> ProcesarSalidaAsync(int limite = 50)
        {
            List<string> ids = (await _a.Salida.ListarAsync("status", "pending"))
                .Where(e => RegistroDeEventos.Eventos.ContainsKey(e.Type)).OrderBy(e => e.OccurredAt, StringComparer.Ordinal).Take(limite).Select(e => e.Id).ToList();
            int procesados = 0, creadas = 0, fallidos = 0;
            foreach (string id in ids)
            {
                var avisos = new List<Notificacion>();
                try
                {
                    bool hecho = await _a.EjecutarAsync(async () =>
                    {
                        avisos.Clear();
                        EventoDeSalida? evento = await _a.Salida.ObtenerAsync(id, true);
                        if (evento is null || evento.Status != "pending") return false;
                        DefinicionEvento def = RegistroDeEventos.Eventos[evento.Type];
                        foreach (string usuario in (await def.Destinatarios(_a, evento)).Distinct())
                        {
                            Preferencias prefs = await PreferenciasDeAsync(usuario);
                            if (!def.Critico)
                            {
                                if (prefs.Categories.TryGetValue(def.Categoria, out bool activa) && !activa) continue;
                                if (def.Preferencia == "offers" && !prefs.Commercial.Offers) continue;
                                if (def.Preferencia == "interests" && !prefs.Commercial.Interests) continue;
                            }
                            string clave = $"{evento.DedupeKey}:{usuario}";
                            if ((await _a.Notificaciones.ListarAsync(("userId", usuario), ("dedupeKey", clave))).Count > 0) continue;
                            TextoAviso texto = await def.Plantilla(_a, evento, usuario);
                            var aviso = new Notificacion
                            {
                                Id = Guid.NewGuid().ToString(), UserId = usuario, Category = def.Categoria, Priority = def.Prioridad, Critical = def.Critico, Type = evento.Type,
                                Title = texto.Titulo, Body = texto.Cuerpo, Link = new EnlaceNotificacion { View = texto.Vista, Id = texto.Id }, EventId = evento.Id, DedupeKey = clave, CreatedAt = JsonMercado.Iso(_a.Ahora),
                            };
                            _a.Notificaciones.Insertar(aviso);
                            avisos.Add(aviso);
                        }
                        evento.Status = "processed";
                        evento.ProcessedAt = JsonMercado.Iso(_a.Ahora);
                        _a.Salida.Actualizar(evento);
                        return true;
                    });
                    if (!hecho) continue;
                    procesados++;
                    creadas += avisos.Count;
                    await EnviarPushAsync(avisos);
                }
                catch (Exception ex)
                {
                    fallidos++;
                    _logger.LogWarning(ex, "No se pudo procesar el evento {Evento}", id);
                    await _a.EjecutarAsync(async () =>
                    {
                        EventoDeSalida? evento = await _a.Salida.ObtenerAsync(id, true);
                        if (evento is null) return;
                        evento.Attempts += 1;
                        evento.LastError = ex.Message.Length > 300 ? ex.Message[..300] : ex.Message;
                        if (evento.Attempts >= MaximoIntentos) evento.Status = "failed";
                        _a.Salida.Actualizar(evento);
                    });
                }
            }
            return new ResultadoSalida(procesados, creadas, fallidos);
        }

        private async Task<Preferencias> PreferenciasDeAsync(string usuario) => ReglasNotificaciones.Completar(await _a.Preferencias.ObtenerAsync(usuario), usuario, _a.Ahora);

        /// <summary>Avisos push: solo si la persona activó el canal para esa categoría, y los no urgentes esperan al fin del horario de silencio (siguen en la bandeja).</summary>
        private async Task EnviarPushAsync(List<Notificacion> avisos)
        {
            if (avisos.Count == 0) return;
            try
            {
                var mensajes = new List<MensajePush>();
                foreach (Notificacion n in avisos)
                {
                    Preferencias prefs = await PreferenciasDeAsync(n.UserId);
                    if (!prefs.Channels.GetValueOrDefault("push")) continue;
                    if (prefs.ChannelCategories.TryGetValue("push", out List<string>? permitidas) && !permitidas.Contains(n.Category)) continue;
                    if (!(n.Critical || n.Priority == "critica") && ReglasNotificaciones.EsSilencio(prefs, _a.Ahora)) continue;
                    if (!Guid.TryParse(n.UserId, out Guid usuario)) continue;
                    foreach (string token in await _a.Contexto.DispositivoEs.AsNoTracking().Where(d => d.IdUsuario == usuario).Select(d => d.Token).ToListAsync())
                        mensajes.Add(new MensajePush(token, n.Title, n.Body, n.Link.View, n.Link.Id));
                }
                if (mensajes.Count == 0) return;
                IReadOnlyList<string> olvidar = await _push.EnviarAsync(mensajes);
                if (olvidar.Count > 0)
                {
                    _a.Contexto.DispositivoEs.RemoveRange(_a.Contexto.DispositivoEs.Where(d => olvidar.Contains(d.Token)));
                    await _a.Contexto.SaveChangesAsync();
                }
            }
            catch (Exception ex)
            {
                // El aviso en el teléfono nunca rompe el proceso: la notificación ya quedó en la bandeja.
                _logger.LogWarning(ex, "No se pudieron enviar los avisos push");
            }
        }

        // ---------- leer ----------

        public Task<int> LeerAsync(Guid usuario, IReadOnlyList<string> ids) => _a.EjecutarAsync(async () =>
        {
            if (ids.Count is 0 or > 200 || ids.Any(string.IsNullOrWhiteSpace)) throw ReglaNegocioException.Validacion("Indica entre 1 y 200 notificaciones.");
            int cambiadas = 0;
            foreach (string id in ids.Distinct())
            {
                Notificacion n = await _a.Notificaciones.ObtenerAsync(id) ?? throw ReglaNegocioException.NoEncontrado("Notificación no encontrada.");
                if (n.UserId != usuario.ToString()) throw ReglaNegocioException.Prohibido("Esa notificación no te pertenece.");
                if (n.ReadAt is null) { n.ReadAt = JsonMercado.Iso(_a.Ahora); _a.Notificaciones.Actualizar(n); cambiadas++; }
            }
            return cambiadas;
        });

        public Task<int> LeerTodasAsync(Guid usuario) => _a.EjecutarAsync(async () =>
        {
            int cambiadas = 0;
            foreach (Notificacion n in (await _a.Notificaciones.ListarAsync("userId", usuario.ToString())).Where(n => n.ReadAt is null))
            {
                n.ReadAt = JsonMercado.Iso(_a.Ahora);
                _a.Notificaciones.Actualizar(n);
                cambiadas++;
            }
            return cambiadas;
        });

        /// <summary>Marca como leídas las notificaciones sin leer de un tipo cuyo enlace apunta a un id (por ejemplo, los mensajes de una conversación).</summary>
        public Task<int> LeerEnlaceAsync(Guid usuario, string tipo, string enlaceId) => _a.EjecutarAsync(async () =>
        {
            int cambiadas = 0;
            foreach (Notificacion n in (await _a.Notificaciones.ListarAsync("userId", usuario.ToString())).Where(n => n.ReadAt is null && n.Type == tipo && n.Link.Id == enlaceId))
            {
                n.ReadAt = JsonMercado.Iso(_a.Ahora);
                _a.Notificaciones.Actualizar(n);
                cambiadas++;
            }
            return cambiadas;
        });

        // ---------- preferencias y dispositivos ----------

        public Task<PreferenciasDto> ActualizarPreferenciasAsync(Guid usuario, PreferenciasCambioDto cambios) => _a.EjecutarAsync(async () =>
        {
            string id = usuario.ToString();
            Preferencias? guardadas = await _a.Preferencias.ObtenerAsync(id, true);
            Preferencias siguientes = ReglasNotificaciones.Aplicar(ReglasNotificaciones.Completar(guardadas, id, _a.Ahora), cambios, _a.Ahora);
            if (guardadas is null) _a.Preferencias.Insertar(siguientes); else _a.Preferencias.Actualizar(siguientes);
            return Vista(siguientes);
        });

        public static PreferenciasDto Vista(Preferencias p) => new()
        {
            Categories = p.Categories, Channels = p.Channels, ChannelCategories = p.ChannelCategories, TimeZone = p.TimeZone, Digest = p.Digest,
            QuietHours = new SilencioVistaDto { Enabled = p.QuietHours.Enabled, Start = p.QuietHours.Start, End = p.QuietHours.End },
            IncubationLeadDays = p.IncubationLeadDays, TaskLeadDays = p.TaskLeadDays, IncubationMarginDays = p.IncubationMarginDays, IncubationStaleDays = p.IncubationStaleDays,
            Commercial = new ComercialVistaDto { Offers = p.Commercial.Offers, Interests = p.Commercial.Interests },
            CategoryLabels = ReglasNotificaciones.Categorias, ChannelLabels = ReglasNotificaciones.Canales,
        };

        public async Task RegistrarDispositivoAsync(Guid usuario, DispositivoDto dto)
        {
            if (!dto.Token.StartsWith("ExponentPushToken[", StringComparison.Ordinal) && !dto.Token.StartsWith("ExpoPushToken[", StringComparison.Ordinal))
                throw ReglaNegocioException.Validacion("El token del dispositivo no es válido.");
            DispositivoE? existente = await _a.Contexto.DispositivoEs.FirstOrDefaultAsync(d => d.Token == dto.Token);
            if (existente is not null)
            {
                // Un teléfono que cambia de cuenta recibe los avisos de la cuenta nueva.
                existente.IdUsuario = usuario;
                existente.Plataforma = dto.Plataforma;
            }
            else _a.Contexto.DispositivoEs.Add(new DispositivoE { IdDispositivo = Guid.NewGuid(), IdUsuario = usuario, Token = dto.Token, Plataforma = dto.Plataforma, CreadoEn = _a.Ahora });
            await _a.Contexto.SaveChangesAsync();
        }

        public async Task QuitarDispositivoAsync(Guid usuario, string token)
        {
            _a.Contexto.DispositivoEs.RemoveRange(_a.Contexto.DispositivoEs.Where(d => d.IdUsuario == usuario && d.Token == token));
            await _a.Contexto.SaveChangesAsync();
        }

        // ---------- recordatorios ----------

        public Task<int> EscanearRecordatoriosAsync(string usuarioId) => _a.EjecutarAsync(async () =>
        {
            if (!Guid.TryParse(usuarioId, out Guid guid)) return 0;
            GranjaE? granja = await _a.Contexto.GranjaEs.AsNoTracking().FirstOrDefaultAsync(g => g.IdUsuario == guid);
            if (granja is null) return 0;
            Preferencias prefs = await PreferenciasDeAsync(usuarioId);
            var mias = (await _a.Operaciones.ListarAsync("sellerId", usuarioId)).Concat(await _a.Operaciones.ListarAsync("buyerId", usuarioId)).DistinctBy(o => o.Id);
            int emitidos = 0;
            foreach (PlanDeRecordatorio plan in ReglasNotificaciones.Planificar(DocumentoGranja.Desde(granja.Datos), prefs, _a.Ahora, usuarioId, mias))
                if (await _a.EmitirAsync(plan.Type, plan.AggregateType, plan.AggregateId, plan.Payload, $"{plan.DedupeKey}:{usuarioId}")) emitidos++;
            return emitidos;
        });

        public async Task<(int Personas, int Emitidos)> EscanearTodosAsync()
        {
            List<Guid> personas = await _a.Contexto.GranjaEs.AsNoTracking().Select(g => g.IdUsuario).ToListAsync();
            int emitidos = 0;
            foreach (Guid persona in personas) emitidos += await EscanearRecordatoriosAsync(persona.ToString());
            return (personas.Count, emitidos);
        }
    }
}
