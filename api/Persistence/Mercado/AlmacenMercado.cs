using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.Entities.UsuarioE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Infrastructure;

namespace PicoCriollo.Persistence.Mercado
{
    /// <summary>
    /// Todo lo que las órdenes y consultas del mercado comparten: las colecciones, la hora, la transacción, la auditoría y los
    /// eventos de salida. Un almacén vive lo que dura una petición (comparte el contexto de base de datos).
    /// </summary>
    public class AlmacenMercado
    {
        private readonly TimeProvider _tiempo;

        public AlmacenMercado(DBContext contexto, TimeProvider tiempo)
        {
            Contexto = contexto;
            _tiempo = tiempo;
            Publicaciones = new(contexto, TablasMercado.Publicaciones, p => p.Id);
            Bloqueos = new(contexto, TablasMercado.Bloqueos, b => b.Id);
            Intereses = new(contexto, TablasMercado.Intereses, i => i.Id);
            Ofertas = new(contexto, TablasMercado.Ofertas, o => o.Id);
            Operaciones = new(contexto, TablasMercado.Operaciones, o => o.Id);
            Conversaciones = new(contexto, TablasMercado.Conversaciones, c => c.Id);
            Mensajes = new(contexto, TablasMercado.Mensajes, m => m.Id);
            Pasaportes = new(contexto, TablasMercado.Pasaportes, p => p.Id);
            Comprobantes = new(contexto, TablasMercado.Comprobantes, c => c.Id);
            Valoraciones = new(contexto, TablasMercado.Valoraciones, v => v.Id);
            Facturas = new(contexto, TablasMercado.Facturas, f => f.Id);
            Propiedades = new(contexto, TablasMercado.Propiedad, p => p.Id);
            Tramos = new(contexto, TablasMercado.HistorialPropiedad, t => t.Id);
            Registro = new(contexto, TablasMercado.Auditoria, a => a.Id);
            Salida = new(contexto, TablasMercado.Salida, e => e.Id);
            Notificaciones = new(contexto, TablasMercado.Notificaciones, n => n.Id);
            Preferencias = new(contexto, TablasMercado.Preferencias, p => p.Id);
            Seguimientos = new(contexto, TablasMercado.Seguimientos, f => f.Id);
            PublicacionesPerfil = new(contexto, TablasMercado.PublicacionesPerfil, p => p.Id);
            MeGustas = new(contexto, TablasMercado.MeGusta, m => m.Id);
            Comentarios = new(contexto, TablasMercado.ComentariosPerfil, c => c.Id);
            Archivos = new(contexto, TablasMercado.Media, a => a.Id);
            Denuncias = new(contexto, TablasMercado.Denuncias, d => d.Id);
            InteresesReels = new(contexto, TablasMercado.InteresesReels, i => i.Id);
        }

        public DBContext Contexto { get; }
        public Coleccion<Publicacion> Publicaciones { get; }
        public Coleccion<Bloqueo> Bloqueos { get; }
        public Coleccion<Interes> Intereses { get; }
        public Coleccion<Oferta> Ofertas { get; }
        public Coleccion<Operacion> Operaciones { get; }
        public Coleccion<Conversacion> Conversaciones { get; }
        public Coleccion<Mensaje> Mensajes { get; }
        public Coleccion<Pasaporte> Pasaportes { get; }
        public Coleccion<Comprobante> Comprobantes { get; }
        public Coleccion<Valoracion> Valoraciones { get; }
        public Coleccion<Factura> Facturas { get; }
        public Coleccion<Propiedad> Propiedades { get; }
        public Coleccion<TramoDePropiedad> Tramos { get; }
        public Coleccion<Auditoria> Registro { get; }
        public Coleccion<EventoDeSalida> Salida { get; }
        public Coleccion<Notificacion> Notificaciones { get; }
        public Coleccion<Preferencias> Preferencias { get; }
        public Coleccion<Seguimiento> Seguimientos { get; }
        public Coleccion<PublicacionPerfil> PublicacionesPerfil { get; }
        public Coleccion<MeGusta> MeGustas { get; }
        public Coleccion<ComentarioPerfil> Comentarios { get; }
        public Coleccion<ArchivoMedia> Archivos { get; }
        public Coleccion<InteresDeReels> InteresesReels { get; }

        public Coleccion<Denuncia> Denuncias { get; }

        public DateTime Ahora => _tiempo.GetUtcNow().UtcDateTime;

        /// <summary>
        /// Ejecuta una orden de principio a fin: transacción (en PostgreSQL), todos los cambios acumulados y un solo guardado.
        /// Si algo falla, no queda nada a medias. Un choque con otra petición se devuelve como conflicto.
        /// </summary>
        public async Task<T> EjecutarAsync<T>(Func<Task<T>> orden)
        {
            await using var transaccion = Contexto.Database.IsNpgsql() ? await Contexto.Database.BeginTransactionAsync() : null;
            try
            {
                T resultado = await orden();
                await Contexto.SaveChangesAsync();
                if (transaccion is not null) await transaccion.CommitAsync();
                return resultado;
            }
            catch (DbUpdateConcurrencyException)
            {
                Contexto.ChangeTracker.Clear();
                throw ReglaNegocioException.Conflicto("Los datos cambiaron en otra sesión. Actualiza la pantalla y vuelve a intentarlo.");
            }
            catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
            {
                Contexto.ChangeTracker.Clear();
                throw ReglaNegocioException.Conflicto("Otra operación se adelantó y tomó este recurso. Actualiza la pantalla y vuelve a intentarlo.");
            }
            catch
            {
                Contexto.ChangeTracker.Clear();
                throw;
            }
        }

        public Task EjecutarAsync(Func<Task> orden) => EjecutarAsync<object?>(async () => { await orden(); return null; });

        // ---------- personas ----------

        public async Task<UsuarioE?> UsuarioAsync(string id) =>
            Guid.TryParse(id, out Guid guid) ? await Contexto.UsuarioEs.FirstOrDefaultAsync(u => u.IdUsuario == guid) : null;

        public async Task<string> AliasAsync(string id)
        {
            UsuarioE? u = await UsuarioAsync(id);
            return ReglasMercado.Alias(id, u?.NombreUsuario);
        }

        /// <summary>Una cuenta con restricciones no puede publicar, ofertar, solicitar compras ni escribir en el mercado.</summary>
        public async Task AsegurarActivaAsync(string id)
        {
            if ((await UsuarioAsync(id))?.Suspendido == true)
                throw ReglaNegocioException.Prohibido("Tu cuenta tiene restricciones comerciales. Contacta a un moderador.");
        }

        // ---------- auditoría, límites y eventos ----------

        public void Auditar(string actor, string accion, string tipoObjetivo, string idObjetivo, object? detalle = null)
        {
            Registro.Insertar(new Auditoria
            {
                Id = Guid.NewGuid().ToString(), ActorId = actor, Action = accion, TargetType = tipoObjetivo, TargetId = idObjetivo,
                Detail = detalle is null ? new JsonObject() : JsonSerializer.SerializeToNode(detalle, JsonMercado.Opciones)!.AsObject(),
                CreatedAt = JsonMercado.Iso(Ahora),
            });
        }

        /// <summary>Cuántas veces puede hacer algo una persona en una ventana de tiempo (se cuenta sobre la auditoría, como en la app actual).</summary>
        public async Task LimitarUsoAsync(string actor, string accion, int maximo, TimeSpan ventana, string descripcion)
        {
            DateTime desde = Ahora - ventana;
            int usadas = (await Registro.ListarAsync("actorId", actor)).Count(a => a.Action == accion && JsonMercado.Fecha(a.CreatedAt) >= desde);
            if (usadas >= maximo) throw ReglaNegocioException.Conflicto($"Llegaste al límite de {maximo} {descripcion}. Inténtalo más tarde.");
        }

        /// <summary>Deja un evento en la bandeja de salida (la app actual lo convierte en notificaciones). Una clave repetida no crea otro. Devuelve si lo creó.</summary>
        public async Task<bool> EmitirAsync(string tipo, string tipoAgregado, string idAgregado, object carga, string claveUnica)
        {
            if ((await Salida.ListarAsync("dedupeKey", claveUnica)).Count > 0) return false;
            Salida.Insertar(new EventoDeSalida
            {
                Id = Guid.NewGuid().ToString(), Type = tipo, AggregateType = tipoAgregado, AggregateId = idAgregado,
                Payload = JsonSerializer.SerializeToNode(carga, JsonMercado.Opciones)!.AsObject(), DedupeKey = claveUnica, OccurredAt = JsonMercado.Iso(Ahora),
            });
            return true;
        }
    }
}
