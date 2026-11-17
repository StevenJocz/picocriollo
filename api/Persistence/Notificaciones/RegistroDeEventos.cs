using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text.Json.Nodes;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Notificaciones
{
    public record TextoAviso(string Titulo, string Cuerpo, string Vista, string? Id = null);

    public class DefinicionEvento
    {
        public string Categoria { get; init; } = string.Empty;
        public string Prioridad { get; init; } = "normal";
        /// <summary>Crítico: ignora las preferencias de categoría (seguridad e integridad comercial).</summary>
        public bool Critico { get; init; }
        /// <summary>Preferencia comercial que puede silenciarlo: offers o interests.</summary>
        public string? Preferencia { get; init; }
        public Func<AlmacenMercado, EventoDeSalida, Task<List<string>>> Destinatarios { get; init; } = null!;
        public Func<AlmacenMercado, EventoDeSalida, string, Task<TextoAviso>> Plantilla { get; init; } = null!;
    }

    /// <summary>
    /// Qué avisa cada evento y a quién. Mismos textos que la app Next.js (market/events, profile/events, reminder-events) y, como allá,
    /// las plantillas solo usan datos que el destinatario puede ver. Incluye los eventos de moderación.
    /// </summary>
    public static class RegistroDeEventos
    {
        private static readonly CultureInfo Co = new("es-CO");

        public static string Pesos(long valor) => "$" + valor.ToString("N0", Co);
        private static string Recortar(string texto, int max = 140) => texto.Length > max ? texto[..(max - 1)] + "…" : texto;
        private static string S(EventoDeSalida e, string clave) => e.Payload[clave]?.ToString() ?? string.Empty;
        private static string S(JsonObject p, string clave) => p[clave] is { } v ? (v is JsonValue jv && jv.TryGetValue(out string? t) ? t ?? "" : v.ToJsonString().Trim('"')) : string.Empty;
        private static int N(JsonObject p, string clave) => (int)DocumentoGranja.Numero(p[clave]);
        private static string Plural(int n, string uno, string varios) => n == 1 ? uno : varios;

        private static string Fecha(string iso)
        {
            if (!DateTime.TryParseExact(iso, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime d)) return iso;
            return $"{d.Day} de {Co.DateTimeFormat.GetMonthName(d.Month)}";
        }

        private static async Task<Publicacion?> Publicacion(AlmacenMercado a, string? id) => string.IsNullOrEmpty(id) ? null : await a.Publicaciones.ObtenerAsync(id);
        private static async Task<Operacion?> Operacion(AlmacenMercado a, EventoDeSalida e) => await a.Operaciones.ObtenerAsync(S(e, "operationId"));
        private static string Nombre(Publicacion? p, string respaldo = "tu ave") => p?.Snapshot.Name ?? respaldo;
        private static async Task<string> Alias(AlmacenMercado a, string? id) =>
            string.IsNullOrEmpty(id) ? "Un usuario" : await a.UsuarioAsync(id) is { } u ? ReglasMercado.Alias(id, u.NombreUsuario) : "Un usuario";

        private static Func<AlmacenMercado, EventoDeSalida, Task<List<string>>> AlVendedor(string clave = "listingId") =>
            async (a, e) => await Publicacion(a, S(e, clave)) is { } p ? [p.SellerId] : [];

        private static Func<AlmacenMercado, EventoDeSalida, Task<List<string>>> Comprador => async (a, e) => await Operacion(a, e) is { } o ? [o.BuyerId] : [];
        private static Func<AlmacenMercado, EventoDeSalida, Task<List<string>>> Vendedor => async (a, e) => await Operacion(a, e) is { } o ? [o.SellerId] : [];
        private static Func<AlmacenMercado, EventoDeSalida, Task<List<string>>> LosDosDeLaOperacion => async (a, e) => await Operacion(a, e) is { } o ? [o.SellerId, o.BuyerId] : [];
        private static Func<AlmacenMercado, EventoDeSalida, Task<List<string>>> LosPostores => (_, e) =>
            Task.FromResult(e.Payload["bidderIds"] is JsonArray ids ? ids.Select(i => i?.ToString() ?? "").Where(i => i.Length > 0).ToList() : []);

        private static DefinicionEvento Propio(string categoria, string prioridad, string vista, Func<JsonObject, (string Titulo, string Cuerpo)> hacer) => new()
        {
            Categoria = categoria, Prioridad = prioridad,
            Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "userId") }),
            Plantilla = (_, e, _) => { var (t, c) = hacer(e.Payload); return Task.FromResult(new TextoAviso(t, c, vista, e.AggregateId)); },
        };

        private const string NotaSalud = " Este aviso se basa en lo que registraste y no sustituye la evaluación de un veterinario.";

        public static readonly Dictionary<string, DefinicionEvento> Eventos = Construir();

        private static Dictionary<string, DefinicionEvento> Construir()
        {
            var r = new Dictionary<string, DefinicionEvento>();

            // Moderación ya se procesa en .NET, sin depender del trabajador de Next.
            r["moderation.report.created"] = new() { Categoria = "sistema", Prioridad = "alta", Critico = true,
                Destinatarios = async (a, e) => (await a.Contexto.UsuarioEs.ToListAsync()).Where(u => !u.Suspendido && u.Rol is "moderator" or "admin").Select(u => u.IdUsuario.ToString()).ToList(),
                Plantilla = (_, e, _) => Task.FromResult(new TextoAviso("Nueva denuncia", "Hay contenido pendiente de revisión.", "moderacion", e.AggregateId)) };
            foreach (string estado in new[] { "paused", "restored", "rejected", "withdrawn" })
                r[$"moderation.listing.{estado}"] = new() { Categoria = "sistema", Prioridad = "alta", Critico = true, Destinatarios = AlVendedor(),
                    Plantilla = (_, e, _) => Task.FromResult(new TextoAviso("Moderación de tu publicación", S(e, "note"), "publicaciones", e.AggregateId)) };
            foreach (string estado in new[] { "warned", "suspended", "restored" })
                r[$"moderation.account.{estado}"] = new() { Categoria = "sistema", Prioridad = "alta", Critico = true,
                    Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "userId") }),
                    Plantilla = (_, e, _) => Task.FromResult(new TextoAviso("Aviso de moderación de tu cuenta", S(e, "note"), "perfil")) };
            r["moderation.dispute.resolved"] = new() { Categoria = "sistema", Prioridad = "alta", Critico = true, Destinatarios = LosDosDeLaOperacion,
                Plantilla = (_, e, _) => Task.FromResult(new TextoAviso("Disputa resuelta", S(e, "note"), "compras-mercado", e.AggregateId)) };

            // ---------- mercado ----------
            r["market.listing.published"] = new() { Categoria = "comercial", Destinatarios = AlVendedor(), Plantilla = async (a, e, _) => new("Publicación creada", $"«{Nombre(await Publicacion(a, S(e, "listingId")), "Tu ave")}» ya está visible en el Mercado Avícola.", "publicaciones", e.AggregateId) };
            r["market.listing.needs_review"] = new() { Categoria = "comercial", Prioridad = "alta", Destinatarios = AlVendedor(), Plantilla = async (a, e, _) => new("Revisa tu publicación", $"Cambiaste la ficha de «{Nombre(await Publicacion(a, S(e, "listingId")))}». La publicación mantiene los datos anteriores hasta que la actualices.", "publicaciones", e.AggregateId) };
            r["market.interest.created"] = new()
            {
                Categoria = "comercial", Preferencia = "interests", Destinatarios = AlVendedor(),
                Plantilla = async (a, e, _) =>
                {
                    Interes? i = await a.Intereses.ObtenerAsync(S(e, "interestId"));
                    string mensaje = i is { Message.Length: > 0 } ? $": «{Recortar(i.Message)}»" : ".";
                    return new($"Nuevo interesado en «{Nombre(await Publicacion(a, S(e, "listingId")))}»", $"{await Alias(a, i?.UserId)} mostró interés{mensaje}", "publicaciones", e.AggregateId);
                },
            };
            r["market.bid.received"] = new()
            {
                Categoria = "comercial", Preferencia = "offers", Destinatarios = AlVendedor(),
                Plantilla = async (a, e, _) => new($"Nueva oferta en «{Nombre(await Publicacion(a, S(e, "listingId")))}»", $"Un postor ofreció {Pesos((await a.Ofertas.ObtenerAsync(S(e, "bidId")))?.Amount ?? 0)}. Es una oferta vinculante, no un pago.", "publicaciones", e.AggregateId),
            };
            r["market.bid.outbid"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Preferencia = "offers",
                Destinatarios = async (a, e) => await a.Ofertas.ObtenerAsync(S(e, "previousBidId")) is { } anterior ? [anterior.BidderId] : [],
                Plantilla = async (a, e, _) => new($"Superaron tu oferta en «{Nombre(await Publicacion(a, S(e, "listingId")), "la subasta")}»", $"La oferta más alta ahora es de {Pesos((await a.Ofertas.ObtenerAsync(S(e, "bidId")))?.Amount ?? 0)}. Puedes ofertar de nuevo hasta el cierre.", "ofertas", e.AggregateId),
            };
            r["market.auction.closing_soon"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Preferencia = "offers",
                Destinatarios = async (a, e) =>
                {
                    if (await Publicacion(a, S(e, "listingId")) is not { } p) return [];
                    var postores = (await a.Ofertas.ListarAsync("listingId", p.Id)).Where(o => o.Status is "valida" or "superada").Select(o => o.BidderId);
                    return [p.SellerId, .. postores];
                },
                Plantilla = async (a, e, quien) =>
                {
                    Publicacion? p = await Publicacion(a, S(e, "listingId"));
                    var prefs = ReglasNotificaciones.Completar(await a.Preferencias.ObtenerAsync(quien), quien, a.Ahora);
                    string cuando = HoraLocal(S(e, "closesAt"), prefs.TimeZone);
                    return new("Subasta próxima a cerrar", $"«{Nombre(p, "La subasta")}» cierra el {cuando}.", p?.SellerId == quien ? "publicaciones" : "ofertas", e.AggregateId);
                },
            };
            r["market.auction.won"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Critico = true, Destinatarios = Comprador,
                Plantilla = async (a, e, _) => new($"Ganaste la subasta de «{Nombre(await Publicacion(a, S(e, "listingId")), "un ave")}»", $"Tu oferta de {Pesos((await Operacion(a, e))?.Price ?? 0)} fue la más alta. Coordina el pago y la entrega con el vendedor.", "compras-mercado", e.AggregateId),
            };
            r["market.auction.ended"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Critico = true, Destinatarios = AlVendedor(),
                Plantilla = async (a, e, _) =>
                {
                    string nombre = Nombre(await Publicacion(a, S(e, "listingId")));
                    string resultado = S(e, "outcome");
                    string cuerpo = resultado == "sold" ? $"La subasta de «{nombre}» terminó con una oferta ganadora de {Pesos(long.TryParse(S(e, "amount"), out long monto) ? monto : 0)}. Gestiona la operación con el comprador."
                        : resultado == "reserve_not_met" ? $"La subasta de «{nombre}» terminó sin alcanzar el precio de reserva. El ave quedó libre y puedes volver a publicarla."
                        : $"La subasta de «{nombre}» terminó sin ofertas válidas. Puedes volver a publicarla.";
                    return new(resultado == "sold" ? "Tu subasta terminó con comprador" : "Tu subasta terminó sin comprador", cuerpo, "publicaciones", e.AggregateId);
                },
            };
            r["market.auction.lost"] = new()
            {
                Categoria = "comercial", Prioridad = "baja", Preferencia = "offers", Destinatarios = LosPostores,
                Plantilla = async (a, e, _) => new("La subasta terminó", $"No ganaste la subasta de «{Nombre(await Publicacion(a, S(e, "listingId")), "un ave")}»{(S(e, "reserveNotMet") == "true" ? ": no se alcanzó el precio de reserva" : "")}. No se realizó ningún cobro.", "ofertas", e.AggregateId),
            };
            r["market.auction.cancelled"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Critico = true, Destinatarios = LosPostores,
                Plantilla = async (a, e, _) => new("Subasta cancelada por el vendedor", $"La subasta de «{Nombre(await Publicacion(a, S(e, "listingId")), "un ave")}» fue cancelada. Motivo: {Recortar(S(e, "reason") is { Length: > 0 } m ? m : "no indicado")}. Tus ofertas quedaron sin efecto.", "ofertas", e.AggregateId),
            };
            r["market.purchase.requested"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Preferencia = "offers", Destinatarios = Vendedor,
                Plantilla = async (a, e, _) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new($"Solicitud de compra por «{Nombre(await Publicacion(a, o?.ListingId))}»", $"{await Alias(a, o?.BuyerId)} quiere comprarla por {Pesos(o?.Price ?? 0)}. Acéptala o recházala; no se completa hasta que lo decidas.", "publicaciones", o?.ListingId);
                },
            };
            r["market.purchase.accepted"] = new()
            {
                Categoria = "comercial", Prioridad = "alta", Critico = true, Destinatarios = Comprador,
                Plantilla = async (a, e, _) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("El vendedor aceptó tu solicitud", $"«{Nombre(await Publicacion(a, o?.ListingId), "El ave")}» quedó reservada para ti por {Pesos(o?.Price ?? 0)}. Sigue con el pago y la entrega.", "compras-mercado", o?.Id);
                },
            };
            r["market.purchase.rejected"] = new()
            {
                Categoria = "comercial", Destinatarios = Comprador,
                Plantilla = async (a, e, _) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("Tu solicitud de compra no prosperó", $"{o?.CancelReason ?? "El vendedor no aceptó la solicitud"} («{Nombre(await Publicacion(a, o?.ListingId), "el ave")}»).", "compras-mercado", o?.Id);
                },
            };
            r["market.operation.payment_declared"] = new()
            {
                Categoria = "transferencia", Prioridad = "alta", Destinatarios = Vendedor,
                Plantilla = async (a, e, _) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("El comprador declaró el pago", $"{await Alias(a, o?.BuyerId)} indicó que pagó {Pesos(o?.Price ?? 0)} por «{Nombre(await Publicacion(a, o?.ListingId))}» ({o?.PaymentMethod ?? "medio no indicado"}). Confírmalo solo cuando lo hayas recibido: Pico Criollo no verifica pagos.", "publicaciones", o?.ListingId);
                },
            };
            r["market.operation.payment_confirmed"] = new()
            {
                Categoria = "transferencia", Prioridad = "alta", Destinatarios = Comprador,
                Plantilla = async (a, e, _) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("El vendedor confirmó tu pago", $"Pago de «{Nombre(await Publicacion(a, o?.ListingId), "el ave")}» confirmado por el vendedor. La entrega está pendiente.", "compras-mercado", o?.Id);
                },
            };
            r["market.operation.delivered"] = new()
            {
                Categoria = "transferencia", Prioridad = "alta", Destinatarios = Comprador,
                Plantilla = async (a, e, _) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("El vendedor confirmó la entrega", $"Confirma la recepción de «{Nombre(await Publicacion(a, o?.ListingId), "el ave")}» cuando la tengas contigo. Al confirmar, la propiedad pasa a tu cuenta.", "compras-mercado", o?.Id);
                },
            };
            r["market.operation.cancelled"] = new()
            {
                Categoria = "transferencia", Prioridad = "alta", Critico = true,
                Destinatarios = async (a, e) => await Operacion(a, e) is { } o ? new[] { o.BuyerId, o.SellerId }.Where(id => id != S(e, "byId")).ToList() : [],
                Plantilla = async (a, e, quien) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("Una operación fue cancelada", $"{await Alias(a, S(e, "byId"))} canceló la operación de «{Nombre(await Publicacion(a, o?.ListingId), "un ave")}». Motivo: {Recortar(o?.CancelReason ?? "no indicado")}", o?.BuyerId == quien ? "compras-mercado" : "publicaciones", o?.Id);
                },
            };
            r["market.operation.disputed"] = new()
            {
                Categoria = "transferencia", Prioridad = "critica", Critico = true,
                Destinatarios = async (a, e) =>
                {
                    if (await Operacion(a, e) is not { } o) return [];
                    return new[] { o.BuyerId, o.SellerId }.Where(id => id != S(e, "byId")).ToList();
                },
                Plantilla = async (a, e, quien) =>
                {
                    Operacion? o = await Operacion(a, e);
                    return new("Se abrió una disputa en tu operación", $"{await Alias(a, S(e, "byId"))} abrió una disputa por «{Nombre(await Publicacion(a, o?.ListingId), "un ave")}»: {Recortar(o?.DisputeReason ?? "")}. El ave sigue reservada hasta que se resuelva.", o?.BuyerId == quien ? "compras-mercado" : "publicaciones", o?.Id);
                },
            };
            r["market.transfer.completed"] = new()
            {
                Categoria = "transferencia", Prioridad = "alta", Critico = true, Destinatarios = LosDosDeLaOperacion,
                Plantilla = async (a, e, quien) =>
                {
                    Operacion? o = await Operacion(a, e);
                    Publicacion? p = await Publicacion(a, o?.ListingId);
                    string codigo = S(e, "receiptCode");
                    return o?.SellerId == quien
                        ? new("Venta completada y propiedad transferida", $"«{Nombre(p, "El ave")}» ya pertenece a {await Alias(a, o?.BuyerId)}. Comprobante {codigo}.", "publicaciones", o?.ListingId)
                        : new("El ave ya es tuya", $"La propiedad de «{Nombre(p, "el ave")}» se transfirió a tu cuenta. Revisa «Mis aves» y asígnale un gallinero. Comprobante {codigo}.", "aves");
                },
            };
            r["market.invoice.issued"] = new()
            {
                Categoria = "comercial",
                Destinatarios = async (a, e) => await a.Facturas.ObtenerAsync(S(e, "invoiceId")) is { } f ? [f.SellerId, f.BuyerId] : [],
                Plantilla = async (a, e, _) =>
                {
                    Factura? f = await a.Facturas.ObtenerAsync(S(e, "invoiceId"));
                    return new($"Factura {f?.Number}".Trim(), $"Se emitió la factura por {Pesos(f?.Total ?? 0)} de «{f?.Lines.FirstOrDefault()?.Description ?? "tu venta"}». Puedes verla desde Mis facturas.", "facturas", f?.Number);
                },
            };
            r["market.rating.received"] = new()
            {
                Categoria = "comercial",
                Destinatarios = async (a, e) => await a.Valoraciones.ObtenerAsync(S(e, "ratingId")) is { } v ? [v.RateeId] : [],
                Plantilla = async (a, e, _) =>
                {
                    Valoracion? v = await a.Valoraciones.ObtenerAsync(S(e, "ratingId"));
                    Operacion? o = await a.Operaciones.ObtenerAsync(S(e, "operationId"));
                    return new("Recibiste una valoración", $"{await Alias(a, v?.RaterId)} valoró tu operación de «{Nombre(await Publicacion(a, o?.ListingId), "un ave")}» con {v?.Stars ?? 0} de 5.", "compras-mercado", o?.Id);
                },
            };
            r["market.message.created"] = new()
            {
                Categoria = "comercial",
                Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "recipientId") }),
                Plantilla = async (a, e, _) =>
                {
                    Mensaje? m = await a.Mensajes.ObtenerAsync(S(e, "messageId"));
                    return new($"Mensaje nuevo sobre «{Nombre(await Publicacion(a, S(e, "listingId")), "una publicación")}»", $"{await Alias(a, m?.SenderId)}: {Recortar(m?.Body ?? "")}", "mensajes", S(e, "threadId"));
                },
            };

            // ---------- perfil ----------
            static string EnlaceDePost(EventoDeSalida e) => $"{S(e, "authorId")}#{S(e, "postId")}";
            static async Task<string> Vista(AlmacenMercado a, string? postId) =>
                await a.PublicacionesPerfil.ObtenerAsync(postId ?? "") is { } post ? (Recortar(post.Text) is { Length: > 0 } t ? t : "Publicación con fotos o videos") : "tu publicación";
            r["profile.post.liked"] = new() { Categoria = "comercial", Prioridad = "baja", Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "authorId") }), Plantilla = async (a, e, _) => new($"{await Alias(a, S(e, "likerId"))} le dio me gusta a tu publicación", await Vista(a, S(e, "postId")), "post", EnlaceDePost(e)) };
            r["profile.post.shared"] = new() { Categoria = "comercial", Prioridad = "normal", Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "authorId") }), Plantilla = async (a, e, _) => new($"{await Alias(a, S(e, "sharerId"))} compartió tu publicación", await Vista(a, S(e, "postId")), "post", EnlaceDePost(e)) };
            r["profile.post.commented"] = new()
            {
                Categoria = "comercial", Prioridad = "normal", Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "authorId") }),
                Plantilla = async (a, e, _) => { ComentarioPerfil? c = await a.Comentarios.ObtenerAsync(S(e, "commentId")); return new($"{await Alias(a, c?.AuthorId)} comentó tu publicación", Recortar(c?.Text ?? ""), "post", EnlaceDePost(e)); },
            };
            r["profile.comment.replied"] = new()
            {
                Categoria = "comercial", Prioridad = "normal", Destinatarios = (_, e) => Task.FromResult(new List<string> { S(e, "toUserId") }),
                Plantilla = async (a, e, _) => { ComentarioPerfil? c = await a.Comentarios.ObtenerAsync(S(e, "commentId")); return new($"{await Alias(a, c?.AuthorId)} respondió tu comentario", Recortar(c?.Text ?? ""), "post", EnlaceDePost(e)); },
            };

            // ---------- recordatorios de la granja ----------
            r["incubation.hatch_approaching"] = Propio("incubacion", "normal", "incubaciones", p => ("Eclosión próxima", $"{S(p, "label")}: la fecha estimada de eclosión es el {Fecha(S(p, "estimated"))} (en {N(p, "left")} {Plural(N(p, "left"), "día", "días")}). Es una estimación; los tiempos reales pueden variar."));
            r["incubation.hatch_today"] = Propio("incubacion", "alta", "incubaciones", p => ("Hoy es la fecha estimada de eclosión", $"{S(p, "label")}. Que llegue la fecha no confirma nacimientos: registra el nacimiento cuando lo veas."));
            r["incubation.overdue"] = Propio("incubacion", "alta", "incubaciones", p => ("La incubación lleva más tiempo del esperado", $"{S(p, "label")} superó en {N(p, "late")} {Plural(N(p, "late"), "día", "días")} la fecha estimada ({Fecha(S(p, "estimated"))}). Revisa los huevos y actualiza el estado de la incubación."));
            r["incubation.stale"] = Propio("incubacion", "normal", "incubaciones", p => ("Incubación sin actualizar", $"{S(p, "label")} lleva {N(p, "days")} días sin cambios en tus registros. Si sigue en curso, confirma su estado."));
            r["birth.recorded"] = Propio("incubacion", "normal", "nacimientos", p => ("Nacimiento confirmado", $"Registraste {N(p, "count")} {Plural(N(p, "count"), "pollito", "pollitos")}{(S(p, "mother").Length > 0 ? $" de {S(p, "mother")}" : "")}."));
            r["incubation.unhatched"] = Propio("incubacion", "normal", "incubaciones", p => ("Huevos que no eclosionaron", $"{S(p, "label")} cerró con {N(p, "hatched")} {Plural(N(p, "hatched"), "pollito nacido", "pollitos nacidos")} de {N(p, "eggs")} huevos; {N(p, "unhatched")} no eclosionaron o se retiraron."));
            r["incubation.interrupted"] = Propio("incubacion", "alta", "incubaciones", p => ("Incubación interrumpida", $"{S(p, "label")} quedó registrada como interrumpida. Revisa si hace falta anotar la causa en las observaciones."));
            r["breeding.review_due"] = Propio("incubacion", "normal", "reproduccion", p => ("Revisión del grupo reproductor", $"El grupo «{S(p, "name")}» llega a su fecha de cierre el {Fecha(S(p, "date"))}. Decide si continúa o se finaliza."));
            r["maintenance.due_soon"] = Propio("mantenimiento", "normal", "mantenimiento", p => ("Tarea próxima", $"«{S(p, "title")}» vence el {Fecha(S(p, "due"))}."));
            r["maintenance.overdue"] = Propio("mantenimiento", "alta", "mantenimiento", p => ("Tarea vencida", $"«{S(p, "title")}» venció el {Fecha(S(p, "due"))} ({N(p, "late")} {Plural(N(p, "late"), "día", "días")})."));
            r["health.due_soon"] = Propio("salud", "normal", "mantenimiento", p => ("Cuidado de salud próximo", $"«{S(p, "title")}» vence el {Fecha(S(p, "due"))}.{NotaSalud}"));
            r["health.overdue"] = Propio("salud", "alta", "mantenimiento", p => ("Cuidado de salud vencido", $"«{S(p, "title")}» venció el {Fecha(S(p, "due"))} ({N(p, "late")} {Plural(N(p, "late"), "día", "días")}).{NotaSalud}"));
            r["stock.low"] = Propio("inventario", "alta", "inventario", p => ($"Existencia baja: {S(p, "product")}", $"Quedan {S(p, "quantity")} {S(p, "unit")} (mínimo {S(p, "minimum")}). Registra una compra para reponer."));
            r["stock.variation"] = Propio("inventario", "normal", "inventario", p => ($"Variación importante: {S(p, "product")}", $"La existencia pasó de {S(p, "from")} a {S(p, "to")} {S(p, "unit")}. Revisa que el movimiento sea correcto."));
            r["bird.deceased"] = Propio("inventario", "alta", "aves", p => ("Mortalidad registrada", $"Se registró la baja de {S(p, "name")}{(S(p, "code").Length > 0 ? $" ({S(p, "code")})" : "")}. Si hay varias bajas seguidas, consulta a un veterinario."));
            r["operation.needs_attention"] = Propio("transferencia", "alta", "compras-mercado", p => ("Una operación espera tu respuesta", $"Una operación del mercado lleva {N(p, "days")}+ {Plural(N(p, "days"), "día", "días")} esperando tu acción ({S(p, "status").Replace('_', ' ')}). Revisa «Mis publicaciones» o «Mis compras»."));
            r["system.sync_conflict"] = Propio("sistema", "normal", "inicio", _ => ("Se evitó sobrescribir tus datos", "Tus cambios no se guardaron porque la granja se modificó en otra sesión. Recarga la página y repite el cambio."));
            return r;
        }

        private static string HoraLocal(string iso, string zona)
        {
            try
            {
                TimeZoneInfo tz = TimeZoneInfo.FindSystemTimeZoneById(zona);
                DateTime local = TimeZoneInfo.ConvertTimeFromUtc(JsonMercado.Fecha(iso), tz);
                return $"{local.Day} de {Co.DateTimeFormat.GetMonthName(local.Month)}, {local:HH:mm}";
            }
            catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException or FormatException)
            {
                return iso;
            }
        }
    }
}
