using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace PicoCriollo.Domain.Mercado
{
    // Los documentos del mercado son los mismos que guarda la app Next.js en las tablas pc_* (id text + data jsonb), así que
    // conservan su vocabulario (sellerId, closesAt…) y sus valores (borrador, publicada, solicitud_recibida…). Las fechas son
    // cadenas ISO 8601 en UTC, como las escribe esa app. Lo que no tiene valor no se escribe (salvo `ring`, que allá es null).

    public static class JsonMercado
    {
        public static readonly JsonSerializerOptions Opciones = new(JsonSerializerDefaults.Web)
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };

        public static string Iso(DateTime utc) => utc.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
        public static DateTime Fecha(string iso) => DateTime.Parse(iso, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal);
    }

    public static class EstadoPublicacion
    {
        public const string Borrador = "borrador", Publicada = "publicada", Pausada = "pausada", EnOperacion = "en_operacion", Vendida = "vendida",
            Retirada = "retirada", Cancelada = "cancelada", Rechazada = "rechazada", CerradaSinOfertas = "cerrada_sin_ofertas";
        /// <summary>Estados en los que un ave ya está tomada por una publicación (cuentan para «ya tiene una publicación»).</summary>
        public static readonly string[] Activos = [Borrador, Publicada, Pausada, EnOperacion];
        public static readonly string[] Editables = [Borrador, Publicada, Pausada];
    }

    public static class TipoPublicacion
    {
        public const string PrecioFijo = "fixed", Subasta = "auction", Interes = "interest";
        public const string Ave = "ave", LoteAves = "lote_aves", LotePollitos = "lote_pollitos", LoteHuevos = "lote_huevos", Insumo = "insumo";
    }

    public static class EstadoOperacion
    {
        public const string Solicitud = "solicitud_recibida", Aceptada = "aceptada", PagoPendiente = "pago_pendiente", PagoRegistrado = "pago_registrado",
            EntregaPendiente = "entrega_pendiente", EntregaConfirmada = "entrega_confirmada", Completada = "completada", Cancelada = "cancelada", Disputada = "disputada";
        public static readonly string[] Abiertos = [Solicitud, Aceptada, PagoPendiente, PagoRegistrado, EntregaPendiente, EntregaConfirmada, Disputada];
    }

    public class ConsentimientoPublicacion
    {
        public string Description { get; set; } = string.Empty;
        public string DeliveryZone { get; set; } = string.Empty;
        public bool ShowPhoto { get; set; } = true;
        public bool ShowGenealogy { get; set; } = true;
        public bool ShowReproduction { get; set; }
        public bool ShowBreeder { get; set; }
        public string BreederAlias { get; set; } = string.Empty;
        public string HealthNote { get; set; } = string.Empty;
        public bool ShareHistoryReproductive { get; set; }
        public bool ShareHistoryHealth { get; set; }
    }

    public class Ancestro
    {
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string Breed { get; set; } = string.Empty;
        public string Sex { get; set; } = string.Empty;
        public string? Species { get; set; }
        public Ancestro? Mother { get; set; }
        public Ancestro? Father { get; set; }
    }

    public class GenealogiaPublica
    {
        public Ancestro? Mother { get; set; }
        public Ancestro? Father { get; set; }
    }

    public class AveDeLote
    {
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string Sex { get; set; } = string.Empty;
        public string Breed { get; set; } = string.Empty;
        public string AgeLabel { get; set; } = string.Empty;
    }

    /// <summary>Lo único de la ficha que ve el público. Lo declara el vendedor; la plataforma no lo verifica.</summary>
    public class FichaPublica
    {
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        // La app actual guarda `ring: null` cuando no hay anillo: se escribe siempre.
        [JsonIgnore(Condition = JsonIgnoreCondition.Never)] public int? Ring { get; set; }
        public string Breed { get; set; } = string.Empty;
        public string Sex { get; set; } = string.Empty;
        public string? Species { get; set; }
        public string BornAt { get; set; } = string.Empty;
        public string AgeLabel { get; set; } = string.Empty;
        public string? PhotoId { get; set; }
        public List<string>? PhotoIds { get; set; }
        /// <summary>Foto por enlace (la granja guarda enlaces, no archivos). La app actual la ignora.</summary>
        public string? PhotoUrl { get; set; }
        public List<string> PhotoUrls { get; set; } = [];
        public string Description { get; set; } = string.Empty;
        public string DeliveryZone { get; set; } = string.Empty;
        public string? HealthNote { get; set; }
        public string? Breeder { get; set; }
        public GenealogiaPublica? Genealogy { get; set; }
        public int? OffspringCount { get; set; }
        public string? ItemType { get; set; }
        public int? Quantity { get; set; }
        public string? Title { get; set; }
        public string? Fertility { get; set; }
        public List<AveDeLote>? LotBirds { get; set; }
        public bool DeclaredBySeller { get; set; } = true;
    }

    public class ReglasSubasta
    {
        public long StartingPrice { get; set; }
        public long MinIncrement { get; set; }
        public long? ReservePrice { get; set; }
        public AntiSniping? AntiSniping { get; set; }
    }

    public class AntiSniping
    {
        public int WindowSeconds { get; set; }
        public int ExtendSeconds { get; set; }
    }

    public class ElementoPublicado
    {
        public string Type { get; set; } = TipoPublicacion.Ave;
        public string? BirdId { get; set; }
        public string? LotId { get; set; }
        public int? Quantity { get; set; }
    }

    public class Publicacion
    {
        public string Id { get; set; } = string.Empty;
        /// <summary>El id del ave, o `lote:&lt;id de la publicación&gt;` en los lotes: es la clave del recurso.</summary>
        public string BirdId { get; set; } = string.Empty;
        public string? ItemType { get; set; }
        public List<ElementoPublicado>? Items { get; set; }
        public List<string>? PhotoIds { get; set; }
        public string SellerId { get; set; } = string.Empty;
        public string Kind { get; set; } = TipoPublicacion.PrecioFijo;
        public string Status { get; set; } = EstadoPublicacion.Borrador;
        public ConsentimientoPublicacion Consent { get; set; } = new();
        public FichaPublica Snapshot { get; set; } = new();
        public string SourceHash { get; set; } = string.Empty;
        public bool NeedsReview { get; set; }
        public long Price { get; set; }
        public string Currency { get; set; } = "COP";
        public string Terms { get; set; } = string.Empty;
        public ReglasSubasta? Auction { get; set; }
        public string? OpensAt { get; set; }
        public string? ClosesAt { get; set; }
        public string? ClosedReason { get; set; }
        public int? Extensions { get; set; }
        public string? WinningBidId { get; set; }
        public string CreatedAt { get; set; } = string.Empty;
        public string? PublishedAt { get; set; }
        public string UpdatedAt { get; set; } = string.Empty;
        public int Version { get; set; } = 1;

        [JsonIgnore] public string Tipo => ItemType ?? TipoPublicacion.Ave;
        [JsonIgnore] public List<ElementoPublicado> Elementos => Items ?? [new ElementoPublicado { Type = TipoPublicacion.Ave, BirdId = BirdId }];
    }

    public class Bloqueo
    {
        public string Id { get; set; } = string.Empty;
        public string BirdId { get; set; } = string.Empty;
        public string? LotId { get; set; }
        public int? Quantity { get; set; }
        public string? ListingId { get; set; }
        public string? OperationId { get; set; }
        public string Status { get; set; } = "active";
        public string CreatedAt { get; set; } = string.Empty;
        public string? ReleasedAt { get; set; }
    }

    public class Interes
    {
        public string Id { get; set; } = string.Empty;
        public string ListingId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string Status { get; set; } = "activo";
        public string Message { get; set; } = string.Empty;
        public int Revision { get; set; } = 1;
        public string CreatedAt { get; set; } = string.Empty;
        public string UpdatedAt { get; set; } = string.Empty;
    }

    public class Oferta
    {
        public string Id { get; set; } = string.Empty;
        public string ListingId { get; set; } = string.Empty;
        public string BidderId { get; set; } = string.Empty;
        public long Amount { get; set; }
        public int Seq { get; set; }
        public string IdempotencyKey { get; set; } = string.Empty;
        /// <summary>valida, superada, ganadora o no_ganadora.</summary>
        public string Status { get; set; } = "valida";
        public string PlacedAt { get; set; } = string.Empty;
    }

    public class PasoDeOperacion
    {
        public string At { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string ActorId { get; set; } = string.Empty;
        public string? Note { get; set; }
    }

    public class ContactoCompartido
    {
        public bool Seller { get; set; }
        public bool Buyer { get; set; }
    }

    public class Operacion
    {
        public string Id { get; set; } = string.Empty;
        public string ListingId { get; set; } = string.Empty;
        public string BirdId { get; set; } = string.Empty;
        public string SellerId { get; set; } = string.Empty;
        public string BuyerId { get; set; } = string.Empty;
        /// <summary>directa o subasta.</summary>
        public string Origin { get; set; } = "directa";
        public long Price { get; set; }
        public string Status { get; set; } = EstadoOperacion.Solicitud;
        public string? PaymentMethod { get; set; }
        public string? PaymentDeclaredAt { get; set; }
        public string? PaymentConfirmedAt { get; set; }
        public string? SellerDeliveredAt { get; set; }
        public string? BuyerReceivedAt { get; set; }
        public ContactoCompartido ShareContact { get; set; } = new();
        public string? CancelReason { get; set; }
        public string? DisputeReason { get; set; }
        public List<PasoDeOperacion> History { get; set; } = [];
        public string CreatedAt { get; set; } = string.Empty;
        public string UpdatedAt { get; set; } = string.Empty;
        public int Version { get; set; } = 1;
    }

    public class Conversacion
    {
        public string Id { get; set; } = string.Empty;
        public string ListingId { get; set; } = string.Empty;
        public string? OperationId { get; set; }
        public List<string> Participants { get; set; } = [];
        public string CreatedAt { get; set; } = string.Empty;
    }

    public class Mensaje
    {
        public string Id { get; set; } = string.Empty;
        public string ThreadId { get; set; } = string.Empty;
        public string SenderId { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
        public bool? Hidden { get; set; }
    }

    public class Pasaporte
    {
        public string Id { get; set; } = string.Empty;
        public string BirdId { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        [JsonIgnore(Condition = JsonIgnoreCondition.Never)] public int? OriginRing { get; set; }
        public JsonObject Lineage { get; set; } = new();
        public string UpdatedAt { get; set; } = string.Empty;
    }

    public class Comprobante
    {
        public string Id { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string BirdId { get; set; } = string.Empty;
        public string OperationId { get; set; } = string.Empty;
        public string ListingId { get; set; } = string.Empty;
        public string SellerId { get; set; } = string.Empty;
        public string BuyerId { get; set; } = string.Empty;
        public string SellerAlias { get; set; } = string.Empty;
        public string BuyerAlias { get; set; } = string.Empty;
        public string BirdName { get; set; } = string.Empty;
        public string BirdCode { get; set; } = string.Empty;
        [JsonIgnore(Condition = JsonIgnoreCondition.Never)] public int? Ring { get; set; }
        public long Price { get; set; }
        public string TransferredAt { get; set; } = string.Empty;
        public string Hash { get; set; } = string.Empty;
    }

    public class Valoracion
    {
        public string Id { get; set; } = string.Empty;
        public string OperationId { get; set; } = string.Empty;
        public string RaterId { get; set; } = string.Empty;
        public string RateeId { get; set; } = string.Empty;
        public int Stars { get; set; }
        public string Comment { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
    }

    public class LineaDeFactura
    {
        public string Description { get; set; } = string.Empty;
        public List<string> Detail { get; set; } = [];
        public string ItemType { get; set; } = TipoPublicacion.Ave;
        public string Unit { get; set; } = "ave";
        public int Quantity { get; set; } = 1;
        public long UnitPrice { get; set; }
        public long Total { get; set; }
    }

    /// <summary>Factura interna de la venta (no es una factura electrónica de la DIAN).</summary>
    public class Factura
    {
        public string Id { get; set; } = string.Empty;
        public string Number { get; set; } = string.Empty;
        public string OperationId { get; set; } = string.Empty;
        public string ListingId { get; set; } = string.Empty;
        public string ReceiptCode { get; set; } = string.Empty;
        public string SellerId { get; set; } = string.Empty;
        public string BuyerId { get; set; } = string.Empty;
        public string SellerAlias { get; set; } = string.Empty;
        public string BuyerAlias { get; set; } = string.Empty;
        public List<LineaDeFactura> Lines { get; set; } = [];
        public long Subtotal { get; set; }
        public long Total { get; set; }
        public string Currency { get; set; } = "COP";
        public string? PaymentMethod { get; set; }
        public string? PaymentDeclaredAt { get; set; }
        public string PaymentConfirmedAt { get; set; } = string.Empty;
        public string DeliveredAt { get; set; } = string.Empty;
        public string ReceivedAt { get; set; } = string.Empty;
        public string IssuedAt { get; set; } = string.Empty;
        public string Hash { get; set; } = string.Empty;
    }

    public class Propiedad
    {
        public string Id { get; set; } = string.Empty;
        public string OwnerId { get; set; } = string.Empty;
        public string Since { get; set; } = string.Empty;
        public int Version { get; set; } = 1;
    }

    public class TramoDePropiedad
    {
        public string Id { get; set; } = string.Empty;
        public string BirdId { get; set; } = string.Empty;
        public string OwnerId { get; set; } = string.Empty;
        public string From { get; set; } = string.Empty;
        public string? To { get; set; }
        public string? OperationId { get; set; }
    }

    public class Auditoria
    {
        public string Id { get; set; } = string.Empty;
        public string ActorId { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string TargetType { get; set; } = string.Empty;
        public string TargetId { get; set; } = string.Empty;
        public JsonObject Detail { get; set; } = new();
        public string CreatedAt { get; set; } = string.Empty;
    }

    /// <summary>Evento para la bandeja de salida (pc_outbox): la app actual lo convierte en notificaciones.</summary>
    public class EventoDeSalida
    {
        public string Id { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string AggregateType { get; set; } = string.Empty;
        public string AggregateId { get; set; } = string.Empty;
        public JsonObject Payload { get; set; } = new();
        public string DedupeKey { get; set; } = string.Empty;
        public string Status { get; set; } = "pending";
        public int Attempts { get; set; }
        public string? LastError { get; set; }
        public string OccurredAt { get; set; } = string.Empty;
        public string? ProcessedAt { get; set; }
    }
}
