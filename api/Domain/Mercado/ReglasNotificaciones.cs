using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PicoCriollo.Domain.DTOs.NotificacionesD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;

namespace PicoCriollo.Domain.Mercado
{
    public record PlanDeRecordatorio(string Type, string AggregateType, string AggregateId, string DedupeKey, JsonObject Payload);

    /// <summary>
    /// Categorías, canales, preferencias y recordatorios de las notificaciones. Mismas listas, límites y reglas que la app Next.js
    /// (constants, preferences, reminders): los documentos son compartidos.
    /// </summary>
    public static partial class ReglasNotificaciones
    {
        public static readonly Dictionary<string, string> Categorias = new()
        {
            ["incubacion"] = "Incubación y nacimientos", ["salud"] = "Salud y cuidado", ["mantenimiento"] = "Limpieza y mantenimiento", ["inventario"] = "Inventario",
            ["comercial"] = "Mercado y ofertas", ["transferencia"] = "Transferencias y entregas", ["seguridad"] = "Cuenta y seguridad", ["sistema"] = "Sistema",
        };

        public static readonly Dictionary<string, string> Canales = new()
        {
            ["inApp"] = "Dentro de la app", ["browser"] = "Navegador", ["email"] = "Correo electrónico", ["push"] = "Notificaciones push",
        };

        public const string ZonaPorDefecto = "America/Bogota";
        private static readonly string[] Prioridades = ["baja", "normal", "alta", "critica"];
        private static readonly string[] Resumenes = ["nunca", "diario", "semanal"];

        public static Preferencias PreferenciasPorDefecto(string usuario, DateTime ahora) => new()
        {
            Id = usuario,
            Categories = Categorias.Keys.ToDictionary(k => k, _ => true),
            Channels = new Dictionary<string, bool> { ["inApp"] = true, ["browser"] = false, ["email"] = false, ["push"] = false },
            UpdatedAt = JsonMercado.Iso(ahora),
        };

        /// <summary>Lo guardado, completado con los valores por defecto de lo que falte.</summary>
        public static Preferencias Completar(Preferencias? guardadas, string usuario, DateTime ahora)
        {
            Preferencias baseP = PreferenciasPorDefecto(usuario, ahora);
            if (guardadas is null) return baseP;
            foreach (var par in baseP.Categories) if (!guardadas.Categories.ContainsKey(par.Key)) guardadas.Categories[par.Key] = par.Value;
            foreach (var par in baseP.Channels) if (!guardadas.Channels.ContainsKey(par.Key)) guardadas.Channels[par.Key] = par.Value;
            return guardadas;
        }

        [GeneratedRegex(@"^([01]\d|2[0-3]):[0-5]\d$")] private static partial Regex Hora();

        public static bool ZonaValida(string zona)
        {
            try { TimeZoneInfo.FindSystemTimeZoneById(zona); return true; } catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException) { return false; }
        }

        private static TimeZoneInfo Zona(string id)
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException) { return TimeZoneInfo.CreateCustomTimeZone(id, TimeSpan.FromHours(id == ZonaPorDefecto ? -5 : 0), id, id); }
        }

        /// <summary>Valida y fusiona cambios parciales. La bandeja interna no se puede apagar.</summary>
        public static Preferencias Aplicar(Preferencias actual, PreferenciasCambioDto c, DateTime ahora)
        {
            if (c.Categories is not null)
                foreach (var (clave, valor) in c.Categories)
                {
                    if (!Categorias.ContainsKey(clave)) throw ReglaNegocioException.Validacion("Categorías no válidas.");
                    actual.Categories[clave] = valor;
                }
            if (c.Channels is not null)
            {
                foreach (var (clave, valor) in c.Channels)
                {
                    if (!Canales.ContainsKey(clave)) throw ReglaNegocioException.Validacion("Canales no válidos.");
                    actual.Channels[clave] = valor;
                }
                actual.Channels["inApp"] = true;
            }
            if (c.ChannelCategories is not null)
                foreach (var (canal, lista) in c.ChannelCategories)
                {
                    if (!Canales.ContainsKey(canal) || lista.Any(x => !Categorias.ContainsKey(x))) throw ReglaNegocioException.Validacion("Categorías por canal no válidas.");
                    actual.ChannelCategories[canal] = lista.Distinct().ToList();
                }
            if (c.QuietHours is { } q)
            {
                if (!Hora().IsMatch(q.Start ?? "") || !Hora().IsMatch(q.End ?? "")) throw ReglaNegocioException.Validacion("Horario de silencio no válido (HH:MM).");
                actual.QuietHours = new HorarioSilencio { Enabled = q.Enabled, Start = q.Start!, End = q.End! };
            }
            if (c.TimeZone is not null)
            {
                if (!ZonaValida(c.TimeZone)) throw ReglaNegocioException.Validacion("Zona horaria no válida.");
                actual.TimeZone = c.TimeZone;
            }
            actual.IncubationLeadDays = Rango(c.IncubationLeadDays, actual.IncubationLeadDays, 0, 14, "incubationLeadDays");
            actual.TaskLeadDays = Rango(c.TaskLeadDays, actual.TaskLeadDays, 0, 30, "taskLeadDays");
            actual.IncubationMarginDays = Rango(c.IncubationMarginDays, actual.IncubationMarginDays, 0, 7, "incubationMarginDays");
            actual.IncubationStaleDays = Rango(c.IncubationStaleDays, actual.IncubationStaleDays, 1, 30, "incubationStaleDays");
            if (c.Digest is not null)
            {
                if (!Resumenes.Contains(c.Digest)) throw ReglaNegocioException.Validacion("Frecuencia de resumen no válida.");
                actual.Digest = c.Digest;
            }
            if (c.Commercial is { } com)
            {
                actual.Commercial.Offers = com.Offers ?? actual.Commercial.Offers;
                actual.Commercial.Interests = com.Interests ?? actual.Commercial.Interests;
            }
            actual.UpdatedAt = JsonMercado.Iso(ahora);
            return actual;
        }

        private static int Rango(int? valor, int actual, int min, int max, string campo)
        {
            if (valor is null) return actual;
            if (valor < min || valor > max) throw ReglaNegocioException.Validacion($"{campo} debe estar entre {min} y {max}.");
            return valor.Value;
        }

        private static int Minutos(string hhmm) => int.Parse(hhmm[..2], CultureInfo.InvariantCulture) * 60 + int.Parse(hhmm[3..], CultureInfo.InvariantCulture);

        /// <summary>¿Es ahora hora de silencio? (en la zona de la persona; admite cruce de medianoche, como 22:00–06:00)</summary>
        public static bool EsSilencio(Preferencias prefs, DateTime ahora)
        {
            if (!prefs.QuietHours.Enabled) return false;
            DateTime local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(ahora, DateTimeKind.Utc), Zona(prefs.TimeZone));
            int minutos = local.Hour * 60 + local.Minute, inicio = Minutos(prefs.QuietHours.Start), fin = Minutos(prefs.QuietHours.End);
            if (inicio == fin) return false;
            return inicio < fin ? minutos >= inicio && minutos < fin : minutos >= inicio || minutos < fin;
        }

        public static string FechaEnZona(DateTime ahora, string zona) =>
            TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(ahora, DateTimeKind.Utc), Zona(zona)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        // ---------- recordatorios ----------

        public static string SumarDias(string fecha, int dias) =>
            DateOnly.ParseExact(fecha, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(dias).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        public static int DiasEntre(string a, string b) =>
            DateOnly.ParseExact(b, "yyyy-MM-dd", CultureInfo.InvariantCulture).DayNumber - DateOnly.ParseExact(a, "yyyy-MM-dd", CultureInfo.InvariantCulture).DayNumber;

        private static readonly Regex PalabrasDeSalud = new("vacun|desparasit|vitamin|veterin|tratamiento|dosis|sanitar|antibi|control|enfermed|cuarentena", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        public const int HorasDeAtencion = 48;
        public const int DiasDeIncubacion = 21;

        /// <summary>Fecha estimada de eclosión = inicio + 21 días + ajuste. Es una estimación, no un nacimiento.</summary>
        public static string EclosionEstimada(JsonObject incubacion) =>
            SumarDias(DocumentoGranja.Texto(incubacion["startedAt"]) ?? "", DiasDeIncubacion + (int)DocumentoGranja.Numero(incubacion["hatchAdjustmentDays"]));

        private static string T(JsonObject o, string clave) => DocumentoGranja.Texto(o[clave]) ?? string.Empty;

        private static string EtiquetaIncubacion(DocumentoGranja granja, JsonObject inc) =>
            T(inc, "type") == "Artificial" ? (T(inc, "equipment") is { Length: > 0 } e ? e : "Incubadora")
                : $"Clueca {(granja.Buscar("birds", T(inc, "henId")) is { } ave && T(ave, "name") is { Length: > 0 } n ? n : "sin nombre")}";

        /// <summary>Eventos que salen de comparar dos versiones de la granja: un nacimiento, una incubación que cierra con huevos sin eclosionar o se interrumpe, una baja y una variación fuerte de existencias.</summary>
        public static List<PlanDeRecordatorio> CambiosDeGranja(DocumentoGranja antes, DocumentoGranja despues, string usuario, long version)
        {
            var planes = new List<PlanDeRecordatorio>();
            void Agregar(string tipo, string agregado, string id, string clave, JsonObject carga)
            {
                carga["userId"] = usuario;
                planes.Add(new PlanDeRecordatorio(tipo, agregado, id, clave, carga));
            }
            static Dictionary<string, JsonObject> PorId(DocumentoGranja d, string lista) =>
                d.Lista(lista).OfType<JsonObject>().Where(f => T(f, "id").Length > 0).GroupBy(f => T(f, "id")).ToDictionary(g => g.Key, g => g.First());

            var nacimientos = PorId(antes, "births");
            foreach (JsonObject n in despues.Lista("births").OfType<JsonObject>())
            {
                string id = T(n, "id");
                if (nacimientos.ContainsKey(id)) continue;
                string madre = despues.Buscar("birds", T(n, "motherId")) is { } m ? T(m, "name") : string.Empty;
                Agregar("birth.recorded", "birth", id, $"birth:{id}", new JsonObject { ["count"] = (int)DocumentoGranja.Numero(n["count"]), ["mother"] = madre, ["date"] = T(n, "date") });
            }

            var incubaciones = PorId(antes, "incubations");
            foreach (JsonObject inc in despues.Lista("incubations").OfType<JsonObject>())
            {
                string id = T(inc, "id");
                if (!incubaciones.TryGetValue(id, out JsonObject? previa) || T(previa, "status") == T(inc, "status")) continue;
                int huevos = (int)DocumentoGranja.Numero(inc["eggs"]), nacidos = (int)DocumentoGranja.Numero(inc["hatched"]), retirados = (int)DocumentoGranja.Numero(inc["removed"]);
                int sinEclosionar = Math.Max(0, huevos - nacidos - retirados);
                string etiqueta = EtiquetaIncubacion(despues, inc);
                if (T(inc, "status") == "Finalizada" && (sinEclosionar > 0 || retirados > 0))
                    Agregar("incubation.unhatched", "incubation", id, $"inc:{id}:unhatched:{nacidos}:{retirados}", new JsonObject { ["label"] = etiqueta, ["eggs"] = huevos, ["hatched"] = nacidos, ["unhatched"] = sinEclosionar + retirados });
                if (T(inc, "status") == "Interrumpida")
                    Agregar("incubation.interrupted", "incubation", id, $"inc:{id}:interrupted", new JsonObject { ["label"] = etiqueta });
            }

            var aves = PorId(antes, "birds");
            foreach (JsonObject ave in despues.Lista("birds").OfType<JsonObject>())
            {
                string id = T(ave, "id");
                if (aves.TryGetValue(id, out JsonObject? previa) && T(previa, "status") != "Fallecido" && T(ave, "status") == "Fallecido")
                    Agregar("bird.deceased", "bird", id, $"death:{id}", new JsonObject { ["name"] = T(ave, "name"), ["code"] = T(ave, "code") });
            }

            var existencias = PorId(antes, "stock");
            foreach (JsonObject e in despues.Lista("stock").OfType<JsonObject>())
            {
                string id = T(e, "id");
                if (!existencias.TryGetValue(id, out JsonObject? previa)) continue;
                decimal antesCantidad = DocumentoGranja.Numero(previa["quantity"]), ahoraCantidad = DocumentoGranja.Numero(e["quantity"]);
                if (antesCantidad <= 0 || Math.Abs(ahoraCantidad - antesCantidad) / antesCantidad < 0.5m) continue;
                Agregar("stock.variation", "stock", id, $"stockvar:{id}:{version}", new JsonObject { ["product"] = T(e, "product"), ["from"] = antesCantidad, ["to"] = ahoraCantidad, ["unit"] = T(e, "unit") });
            }
            return planes;
        }

        /// <summary>Recordatorios derivados del estado actual de la granja. El mismo estado da el mismo plan; las claves evitan repetir avisos.</summary>
        public static List<PlanDeRecordatorio> Planificar(DocumentoGranja granja, Preferencias prefs, DateTime ahora, string usuario, IEnumerable<Operacion> operaciones)
        {
            string hoy = FechaEnZona(ahora, prefs.TimeZone);
            var planes = new List<PlanDeRecordatorio>();
            void Agregar(string tipo, string agregado, string id, string clave, JsonObject carga)
            {
                carga["userId"] = usuario;
                planes.Add(new PlanDeRecordatorio(tipo, agregado, id, clave, carga));
            }

            foreach (JsonObject inc in granja.Lista("incubations").OfType<JsonObject>())
            {
                if (T(inc, "status") != "En curso" || T(inc, "startedAt").Length == 0) continue;
                string id = T(inc, "id"), estimada = EclosionEstimada(inc), etiqueta = EtiquetaIncubacion(granja, inc);
                int falta = DiasEntre(hoy, estimada);
                bool conNacimiento = granja.Lista("births").OfType<JsonObject>().Any(n => T(n, "incubationId") == id);
                if (falta > 0 && falta <= prefs.IncubationLeadDays) Agregar("incubation.hatch_approaching", "incubation", id, $"inc:{id}:approaching:{estimada}", new JsonObject { ["label"] = etiqueta, ["estimated"] = estimada, ["left"] = falta });
                if (falta == 0) Agregar("incubation.hatch_today", "incubation", id, $"inc:{id}:today:{estimada}", new JsonObject { ["label"] = etiqueta, ["estimated"] = estimada });
                if (falta < -prefs.IncubationMarginDays && !conNacimiento) Agregar("incubation.overdue", "incubation", id, $"inc:{id}:overdue:{estimada}", new JsonObject { ["label"] = etiqueta, ["estimated"] = estimada, ["late"] = -falta });
                string tocada = T(inc, "updatedAt") is { Length: >= 10 } u ? u[..10] : T(inc, "startedAt");
                if (DiasEntre(tocada, hoy) >= prefs.IncubationStaleDays) Agregar("incubation.stale", "incubation", id, $"inc:{id}:stale:{tocada}", new JsonObject { ["label"] = etiqueta, ["days"] = DiasEntre(tocada, hoy) });
            }

            foreach (JsonObject tarea in granja.Lista("maintenance").OfType<JsonObject>())
            {
                if (T(tarea, "status") == "Completada" || T(tarea, "nextDue").Length == 0) continue;
                string id = T(tarea, "id"), titulo = T(tarea, "title"), vence = T(tarea, "nextDue");
                int falta = DiasEntre(hoy, vence);
                bool salud = PalabrasDeSalud.IsMatch(titulo);
                if (falta < 0) Agregar(salud ? "health.overdue" : "maintenance.overdue", "maintenance", id, $"maint:{id}:overdue:{vence}", new JsonObject { ["title"] = titulo, ["due"] = vence, ["late"] = -falta });
                else if (falta <= prefs.TaskLeadDays) Agregar(salud ? "health.due_soon" : "maintenance.due_soon", "maintenance", id, $"maint:{id}:soon:{vence}", new JsonObject { ["title"] = titulo, ["due"] = vence, ["left"] = falta });
            }

            foreach (JsonObject grupo in granja.Lista("breedingGroups").OfType<JsonObject>())
            {
                if (T(grupo, "status") != "Activo" || T(grupo, "endedAt").Length == 0) continue;
                string id = T(grupo, "id"), fin = T(grupo, "endedAt");
                int falta = DiasEntre(hoy, fin);
                if (falta >= 0 && falta <= prefs.TaskLeadDays) Agregar("breeding.review_due", "breeding", id, $"breed:{id}:review:{fin}", new JsonObject { ["name"] = T(grupo, "name"), ["date"] = fin, ["left"] = falta });
            }

            foreach (JsonObject existencia in granja.Lista("stock").OfType<JsonObject>())
            {
                if (DocumentoGranja.Numero(existencia["quantity"]) > DocumentoGranja.Numero(existencia["minimum"])) continue;
                string id = T(existencia, "id");
                // Se vuelve a avisar solo después de una nueva compra (reposición): misma existencia baja = mismo aviso.
                string ultima = granja.Lista("movements").OfType<JsonObject>().Where(m => T(m, "stockId") == id && T(m, "kind") == "Compra").Select(m => T(m, "date")).OrderBy(d => d, StringComparer.Ordinal).LastOrDefault() ?? "sin-compras";
                Agregar("stock.low", "stock", id, $"stock:{id}:low:{ultima}", new JsonObject { ["product"] = T(existencia, "product"), ["quantity"] = DocumentoGranja.Numero(existencia["quantity"]), ["unit"] = T(existencia, "unit"), ["minimum"] = DocumentoGranja.Numero(existencia["minimum"]) });
            }

            foreach (Operacion op in operaciones)
            {
                string? espera = op.Status is EstadoOperacion.Solicitud or EstadoOperacion.PagoRegistrado ? op.SellerId : op.Status == EstadoOperacion.EntregaConfirmada ? op.BuyerId : null;
                if (espera != usuario) continue;
                double horas = (ahora - JsonMercado.Fecha(op.UpdatedAt)).TotalHours;
                if (horas >= HorasDeAtencion) Agregar("operation.needs_attention", "operation", op.Id, $"opattn:{op.Id}:{op.Status}", new JsonObject { ["operationId"] = op.Id, ["status"] = op.Status, ["days"] = (int)Math.Floor(horas / 24) });
            }
            return planes;
        }
    }
}
