using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using PicoCriollo.Domain.Mercado;

namespace PicoCriollo.Domain.DTOs.MercadoD
{
    // El mercado usa el vocabulario de sus documentos (sellerId, closesAt, solicitud_recibida…), igual que «Mi granja»: la app y la
    // API comparten los nombres con la app Next.js mientras convivan.

    // ---------- órdenes ----------

    public class ConsentimientoDto
    {
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("deliveryZone")] public string? DeliveryZone { get; set; }
        [JsonPropertyName("showPhoto")] public bool? ShowPhoto { get; set; }
        [JsonPropertyName("showGenealogy")] public bool? ShowGenealogy { get; set; }
        [JsonPropertyName("showReproduction")] public bool? ShowReproduction { get; set; }
        [JsonPropertyName("showBreeder")] public bool? ShowBreeder { get; set; }
        [JsonPropertyName("breederAlias")] public string? BreederAlias { get; set; }
        [JsonPropertyName("healthNote")] public string? HealthNote { get; set; }
        [JsonPropertyName("shareHistoryReproductive")] public bool? ShareHistoryReproductive { get; set; }
        [JsonPropertyName("shareHistoryHealth")] public bool? ShareHistoryHealth { get; set; }
    }

    public class SubastaDto
    {
        [JsonPropertyName("startingPrice")] public long StartingPrice { get; set; }
        [JsonPropertyName("minIncrement")] public long? MinIncrement { get; set; }
        [JsonPropertyName("reservePrice")] public long? ReservePrice { get; set; }
        [JsonPropertyName("antiSniping")] public bool AntiSniping { get; set; }
        [JsonPropertyName("opensAt")] public DateTime? OpensAt { get; set; }
        [JsonPropertyName("closesAt")] public DateTime? ClosesAt { get; set; }
    }

    public class PublicacionNuevaDto
    {
        [JsonPropertyName("photoIds"), MaxLength(10)] public List<string>? PhotoIds { get; set; }
        /// <summary>ave, lote_aves, lote_pollitos, lote_huevos o insumo.</summary>
        [JsonPropertyName("itemType")] public string? ItemType { get; set; }
        [JsonPropertyName("birdId")] public string? BirdId { get; set; }
        [JsonPropertyName("birdIds")] public List<string>? BirdIds { get; set; }
        [JsonPropertyName("lotId")] public string? LotId { get; set; }
        [JsonPropertyName("quantity")] public int? Quantity { get; set; }
        /// <summary>fixed, auction o interest.</summary>
        [JsonPropertyName("kind"), Required(ErrorMessage = "Elige el tipo de publicación.")] public string Kind { get; set; } = null!;
        [JsonPropertyName("price")] public long? Price { get; set; }
        [JsonPropertyName("terms"), StringLength(1000, ErrorMessage = "Las condiciones superan 1000 caracteres.")] public string? Terms { get; set; }
        [JsonPropertyName("consent")] public ConsentimientoDto? Consent { get; set; }
        [JsonPropertyName("publish")] public bool Publish { get; set; }
        [JsonPropertyName("auction")] public SubastaDto? Auction { get; set; }
    }

    public class PublicacionCambioDto
    {
        [JsonPropertyName("photoIds"), MaxLength(10)] public List<string>? PhotoIds { get; set; }
        [JsonPropertyName("price")] public long? Price { get; set; }
        [JsonPropertyName("terms"), StringLength(1000, ErrorMessage = "Las condiciones superan 1000 caracteres.")] public string? Terms { get; set; }
        [JsonPropertyName("consent")] public ConsentimientoDto? Consent { get; set; }
    }

    public class InteresDto
    {
        [JsonPropertyName("message"), StringLength(500, ErrorMessage = "El mensaje supera 500 caracteres.")] public string? Message { get; set; }
    }

    public class OfertaDto
    {
        [JsonPropertyName("amount")] public long Amount { get; set; }
        /// <summary>La genera la app por cada intento; si se repite, la API devuelve la misma oferta en lugar de crear otra.</summary>
        [JsonPropertyName("idempotencyKey"), Required(ErrorMessage = "Falta la clave de la oferta."), StringLength(80, MinimumLength = 8, ErrorMessage = "Falta la clave de la oferta.")] public string IdempotencyKey { get; set; } = null!;
    }

    public class MotivoDto
    {
        [JsonPropertyName("reason"), StringLength(500, ErrorMessage = "El motivo supera 500 caracteres.")] public string? Reason { get; set; }
    }

    public class PagoDto
    {
        [JsonPropertyName("method"), Required(ErrorMessage = "Indica el medio de pago usado."), StringLength(60, MinimumLength = 2, ErrorMessage = "Indica el medio de pago usado (2 a 60 caracteres).")] public string Method { get; set; } = null!;
    }

    public class MensajeNuevoDto
    {
        [JsonPropertyName("listingId")] public string? ListingId { get; set; }
        [JsonPropertyName("threadId")] public string? ThreadId { get; set; }
        [JsonPropertyName("body"), Required(ErrorMessage = "Escribe un mensaje.")] public string Body { get; set; } = null!;
    }

    public class ValoracionDto
    {
        [JsonPropertyName("stars"), Range(1, 5, ErrorMessage = "La valoración debe ser un número entero de 1 a 5.")] public int Stars { get; set; }
        [JsonPropertyName("comment"), StringLength(500, ErrorMessage = "El comentario supera 500 caracteres.")] public string? Comment { get; set; }
    }

    // ---------- vistas ----------

    public class ReputacionDto
    {
        [JsonPropertyName("count")] public int Count { get; set; }
        [JsonPropertyName("average")] public double Average { get; set; }
        [JsonPropertyName("completed")] public int Completed { get; set; }
    }

    public class SubastaVistaDto
    {
        [JsonPropertyName("phase")] public string Phase { get; set; } = null!;
        [JsonPropertyName("currentPrice")] public long CurrentPrice { get; set; }
        [JsonPropertyName("startingPrice")] public long StartingPrice { get; set; }
        [JsonPropertyName("bidCount")] public int BidCount { get; set; }
        [JsonPropertyName("minNextBid")] public long MinNextBid { get; set; }
        [JsonPropertyName("minIncrement")] public long MinIncrement { get; set; }
        [JsonPropertyName("hasReserve")] public bool HasReserve { get; set; }
        [JsonPropertyName("antiSniping")] public bool AntiSniping { get; set; }
    }

    /// <summary>Única forma en que una publicación sale hacia el público: lista de campos explícita (nada de notas, dueño, huellas ni consentimientos).</summary>
    public class PublicacionVistaDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("sellerId")] public string SellerId { get; set; } = null!;
        [JsonPropertyName("kind")] public string Kind { get; set; } = null!;
        [JsonPropertyName("status")] public string Status { get; set; } = null!;
        [JsonPropertyName("price")] public long Price { get; set; }
        [JsonPropertyName("currency")] public string Currency { get; set; } = "COP";
        [JsonPropertyName("terms")] public string Terms { get; set; } = string.Empty;
        [JsonPropertyName("snapshot")] public FichaPublica Snapshot { get; set; } = null!;
        [JsonPropertyName("sellerAlias")] public string SellerAlias { get; set; } = null!;
        [JsonPropertyName("publishedAt")] public string? PublishedAt { get; set; }
        [JsonPropertyName("opensAt")] public string? OpensAt { get; set; }
        [JsonPropertyName("closesAt")] public string? ClosesAt { get; set; }
        [JsonPropertyName("auction")] public SubastaVistaDto? Auction { get; set; }
        [JsonPropertyName("sellerReputation")] public ReputacionDto? SellerReputation { get; set; }
    }

    public class MiPublicacionDto : PublicacionVistaDto
    {
        [JsonPropertyName("birdId")] public string BirdId { get; set; } = null!;
        [JsonPropertyName("needsReview")] public bool NeedsReview { get; set; }
        [JsonPropertyName("interestCount")] public int InterestCount { get; set; }
        [JsonPropertyName("pendingRequests")] public int PendingRequests { get; set; }
        [JsonPropertyName("version")] public int Version { get; set; }
        [JsonPropertyName("closedReason")] public string? ClosedReason { get; set; }
        [JsonPropertyName("operationStatus")] public string? OperationStatus { get; set; }
        [JsonPropertyName("operationId")] public string? OperationId { get; set; }
    }

    public class ListadoMercadoDto
    {
        [JsonPropertyName("items")] public List<PublicacionVistaDto> Items { get; set; } = [];
        [JsonPropertyName("total")] public int Total { get; set; }
    }

    public class OfertaPublicaDto
    {
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("amount")] public long Amount { get; set; }
        [JsonPropertyName("placedAt")] public string PlacedAt { get; set; } = null!;
        [JsonPropertyName("status")] public string Status { get; set; } = null!;
        [JsonPropertyName("mine")] public bool Mine { get; set; }
    }

    public class QuienMiraDto
    {
        [JsonPropertyName("isOwner")] public bool IsOwner { get; set; }
        [JsonPropertyName("hasInterest")] public bool HasInterest { get; set; }
        [JsonPropertyName("isTopBidder")] public bool IsTopBidder { get; set; }
        [JsonPropertyName("operationId")] public string? OperationId { get; set; }
        [JsonPropertyName("operationStatus")] public string? OperationStatus { get; set; }
        [JsonPropertyName("threadId")] public string? ThreadId { get; set; }
    }

    public class DetallePublicacionDto
    {
        [JsonPropertyName("listing")] public PublicacionVistaDto Listing { get; set; } = null!;
        [JsonPropertyName("bids")] public List<OfertaPublicaDto> Bids { get; set; } = [];
        [JsonPropertyName("viewer")] public QuienMiraDto Viewer { get; set; } = null!;
    }

    public class InteresadoDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("userId")] public string UserId { get; set; } = null!;
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
    }

    public class MiOfertaDto
    {
        [JsonPropertyName("listingId")] public string ListingId { get; set; } = null!;
        [JsonPropertyName("birdName")] public string BirdName { get; set; } = null!;
        [JsonPropertyName("birdCode")] public string BirdCode { get; set; } = null!;
        [JsonPropertyName("sellerAlias")] public string SellerAlias { get; set; } = null!;
        [JsonPropertyName("closesAt")] public string? ClosesAt { get; set; }
        [JsonPropertyName("listingStatus")] public string ListingStatus { get; set; } = null!;
        [JsonPropertyName("myBest")] public long MyBest { get; set; }
        [JsonPropertyName("currentPrice")] public long CurrentPrice { get; set; }
        [JsonPropertyName("phase")] public string Phase { get; set; } = null!;
        /// <summary>liderando, superada, ganadora o no_ganadora.</summary>
        [JsonPropertyName("result")] public string Result { get; set; } = null!;
        [JsonPropertyName("cancelled")] public bool? Cancelled { get; set; }
    }

    public class PasoVistaDto
    {
        [JsonPropertyName("at")] public string At { get; set; } = null!;
        [JsonPropertyName("status")] public string Status { get; set; } = null!;
        [JsonPropertyName("note")] public string? Note { get; set; }
    }

    public class ValoracionVistaDto
    {
        [JsonPropertyName("stars")] public int Stars { get; set; }
        [JsonPropertyName("comment")] public string Comment { get; set; } = string.Empty;
    }

    public class EstadoValoracionDto
    {
        [JsonPropertyName("canRate")] public bool CanRate { get; set; }
        [JsonPropertyName("mine")] public ValoracionVistaDto? Mine { get; set; }
        [JsonPropertyName("theirs")] public ValoracionVistaDto? Theirs { get; set; }
    }

    public class OperacionVistaDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("listingId")] public string ListingId { get; set; } = null!;
        [JsonPropertyName("status")] public string Status { get; set; } = null!;
        [JsonPropertyName("origin")] public string Origin { get; set; } = null!;
        [JsonPropertyName("price")] public long Price { get; set; }
        /// <summary>comprador o vendedor: el papel de quien consulta.</summary>
        [JsonPropertyName("role")] public string Role { get; set; } = null!;
        [JsonPropertyName("birdName")] public string BirdName { get; set; } = null!;
        [JsonPropertyName("birdCode")] public string BirdCode { get; set; } = null!;
        [JsonPropertyName("counterpart")] public string Counterpart { get; set; } = null!;
        [JsonPropertyName("counterpartId")] public string CounterpartId { get; set; } = null!;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
        [JsonPropertyName("updatedAt")] public string UpdatedAt { get; set; } = null!;
        [JsonPropertyName("cancelReason")] public string? CancelReason { get; set; }
        [JsonPropertyName("history")] public List<PasoVistaDto> History { get; set; } = [];
        [JsonPropertyName("threadId")] public string? ThreadId { get; set; }
        [JsonPropertyName("receiptCode")] public string? ReceiptCode { get; set; }
        [JsonPropertyName("invoiceNumber")] public string? InvoiceNumber { get; set; }
        [JsonPropertyName("paymentMethod")] public string? PaymentMethod { get; set; }
        [JsonPropertyName("rating")] public EstadoValoracionDto Rating { get; set; } = new();
        [JsonPropertyName("contactShared")] public ContactoCompartidoDto ContactShared { get; set; } = new();
    }

    public class ContactoCompartidoDto
    {
        [JsonPropertyName("mine")] public bool Mine { get; set; }
        [JsonPropertyName("theirs")] public bool Theirs { get; set; }
    }

    public class ContactoDto
    {
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("email")] public string Email { get; set; } = null!;
        [JsonPropertyName("phone")] public string? Phone { get; set; }
    }

    public class OperacionGuardadaDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("status")] public string Status { get; set; } = null!;
        [JsonPropertyName("version")] public int Version { get; set; }
    }

    public class SolicitudCompraDto
    {
        [JsonPropertyName("message"), StringLength(1000, ErrorMessage = "El mensaje supera 1000 caracteres.")] public string? Message { get; set; }
    }

    public class RespuestaSolicitudDto
    {
        /// <summary>accept o reject.</summary>
        [JsonPropertyName("decision"), Required(ErrorMessage = "Indica si aceptas o rechazas la solicitud.")] public string Decision { get; set; } = null!;
    }

    public class RecepcionDto
    {
        [JsonPropertyName("operationId")] public string OperationId { get; set; } = null!;
        [JsonPropertyName("status")] public string Status { get; set; } = null!;
        [JsonPropertyName("receiptCode")] public string ReceiptCode { get; set; } = null!;
    }

    public class ComprobanteDto
    {
        [JsonPropertyName("code")] public string Code { get; set; } = null!;
        [JsonPropertyName("birdName")] public string BirdName { get; set; } = null!;
        [JsonPropertyName("birdCode")] public string BirdCode { get; set; } = null!;
        [JsonPropertyName("ring")] public int? Ring { get; set; }
        [JsonPropertyName("sellerAlias")] public string SellerAlias { get; set; } = null!;
        [JsonPropertyName("buyerAlias")] public string BuyerAlias { get; set; } = null!;
        [JsonPropertyName("price")] public long Price { get; set; }
        [JsonPropertyName("transferredAt")] public string TransferredAt { get; set; } = null!;
        [JsonPropertyName("hash")] public string Hash { get; set; } = null!;
        /// <summary>true si el contenido coincide con su huella: nadie lo alteró después de emitirlo.</summary>
        [JsonPropertyName("integrity")] public bool Integrity { get; set; }
        [JsonPropertyName("role")] public string Role { get; set; } = null!;
    }

    public class ResumenFacturaDto
    {
        [JsonPropertyName("number")] public string Number { get; set; } = null!;
        [JsonPropertyName("issuedAt")] public string IssuedAt { get; set; } = null!;
        [JsonPropertyName("title")] public string Title { get; set; } = null!;
        [JsonPropertyName("total")] public long Total { get; set; }
        [JsonPropertyName("role")] public string Role { get; set; } = null!;
        [JsonPropertyName("counterpart")] public string Counterpart { get; set; } = null!;
        [JsonPropertyName("operationId")] public string OperationId { get; set; } = null!;
    }

    public class FacturaDto
    {
        [JsonPropertyName("number")] public string Number { get; set; } = null!;
        [JsonPropertyName("operationId")] public string OperationId { get; set; } = null!;
        [JsonPropertyName("receiptCode")] public string ReceiptCode { get; set; } = null!;
        [JsonPropertyName("sellerAlias")] public string SellerAlias { get; set; } = null!;
        [JsonPropertyName("buyerAlias")] public string BuyerAlias { get; set; } = null!;
        [JsonPropertyName("lines")] public List<LineaDeFactura> Lines { get; set; } = [];
        [JsonPropertyName("subtotal")] public long Subtotal { get; set; }
        [JsonPropertyName("total")] public long Total { get; set; }
        [JsonPropertyName("currency")] public string Currency { get; set; } = "COP";
        [JsonPropertyName("paymentMethod")] public string? PaymentMethod { get; set; }
        [JsonPropertyName("paymentDeclaredAt")] public string? PaymentDeclaredAt { get; set; }
        [JsonPropertyName("paymentConfirmedAt")] public string PaymentConfirmedAt { get; set; } = null!;
        [JsonPropertyName("deliveredAt")] public string DeliveredAt { get; set; } = null!;
        [JsonPropertyName("receivedAt")] public string ReceivedAt { get; set; } = null!;
        [JsonPropertyName("issuedAt")] public string IssuedAt { get; set; } = null!;
        [JsonPropertyName("hash")] public string Hash { get; set; } = null!;
        [JsonPropertyName("role")] public string Role { get; set; } = null!;
        [JsonPropertyName("integrity")] public bool Integrity { get; set; }
    }

    public class ResumenConversacionDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("listingId")] public string ListingId { get; set; } = null!;
        [JsonPropertyName("listingName")] public string ListingName { get; set; } = null!;
        [JsonPropertyName("counterpart")] public string Counterpart { get; set; } = null!;
        [JsonPropertyName("role")] public string Role { get; set; } = null!;
        [JsonPropertyName("operationId")] public string? OperationId { get; set; }
        [JsonPropertyName("lastMessage")] public string LastMessage { get; set; } = null!;
        [JsonPropertyName("lastAt")] public string LastAt { get; set; } = null!;
    }

    public class MensajeVistaDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("mine")] public bool Mine { get; set; }
        [JsonPropertyName("author")] public string Author { get; set; } = null!;
        [JsonPropertyName("body")] public string Body { get; set; } = null!;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
    }

    public class ConversacionDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("listingId")] public string ListingId { get; set; } = null!;
        [JsonPropertyName("listingName")] public string ListingName { get; set; } = null!;
        [JsonPropertyName("operationId")] public string? OperationId { get; set; }
        [JsonPropertyName("counterpart")] public string Counterpart { get; set; } = null!;
        [JsonPropertyName("messages")] public List<MensajeVistaDto> Messages { get; set; } = [];
    }

    public class MensajeEnviadoDto
    {
        [JsonPropertyName("threadId")] public string ThreadId { get; set; } = null!;
        [JsonPropertyName("messageId")] public string MessageId { get; set; } = null!;
    }

    public class DuenoDto
    {
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("from")] public string From { get; set; } = null!;
        [JsonPropertyName("to")] public string? To { get; set; }
        [JsonPropertyName("mine")] public bool Mine { get; set; }
        [JsonPropertyName("viaOperation")] public bool ViaOperation { get; set; }
    }

    public class ProcedenciaDto
    {
        [JsonPropertyName("birdId")] public string BirdId { get; set; } = null!;
        [JsonPropertyName("owners")] public List<DuenoDto> Owners { get; set; } = [];
        [JsonPropertyName("passportCode")] public string? PassportCode { get; set; }
        [JsonPropertyName("originRing")] public int? OriginRing { get; set; }
    }

    public class ReputacionPublicaDto
    {
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("count")] public int Count { get; set; }
        [JsonPropertyName("average")] public double Average { get; set; }
        [JsonPropertyName("completed")] public int Completed { get; set; }
        [JsonPropertyName("distribution")] public int[] Distribution { get; set; } = new int[5];
    }

    public class CierreDto
    {
        [JsonPropertyName("closed")] public int Closed { get; set; }
        [JsonPropertyName("notified")] public int Notified { get; set; }
    }
}
