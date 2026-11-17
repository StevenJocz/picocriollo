using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PicoCriollo.Domain.DTOs.GranjaD
{
    // Mismo vocabulario que el documento de la granja (customers, customProducts, fertileLots, sales).

    public class ClienteDto
    {
        [JsonPropertyName("name"), Required(ErrorMessage = "Escribe el nombre del cliente."), StringLength(80)] public string Name { get; set; } = null!;
        [JsonPropertyName("phone"), StringLength(30)] public string? Phone { get; set; }
        [JsonPropertyName("contact"), StringLength(120)] public string? Contact { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class ProductoDto
    {
        [JsonPropertyName("name"), Required(ErrorMessage = "Escribe el nombre del producto."), StringLength(80)] public string Name { get; set; } = null!;
        [JsonPropertyName("category"), StringLength(60)] public string? Category { get; set; }
        [JsonPropertyName("unit"), Required(ErrorMessage = "Escribe la unidad (kg, bulto, unidad…)."), StringLength(20)] public string Unit { get; set; } = null!;
        [JsonPropertyName("price")] public decimal Price { get; set; }
        [JsonPropertyName("available")] public decimal Available { get; set; }
    }

    public class LoteHuevosNuevoDto
    {
        [JsonPropertyName("collectionId"), Required(ErrorMessage = "Elige la recolección.")] public string CollectionId { get; set; } = null!;
        [JsonPropertyName("quantity")] public int Quantity { get; set; }
        [JsonPropertyName("breedingGroupId")] public string? BreedingGroupId { get; set; }
        [JsonPropertyName("breed"), StringLength(60)] public string? Breed { get; set; }
        /// <summary>Venta, Consumo o Incubación.</summary>
        [JsonPropertyName("destination")] public string? Destination { get; set; }
    }

    public class DividirLoteDto
    {
        [JsonPropertyName("quantity")] public int Quantity { get; set; }
    }

    public class LoteHuevosCambioDto
    {
        /// <summary>Pendiente, Confirmada, No confirmada o No fértil.</summary>
        [JsonPropertyName("fertility"), Required(ErrorMessage = "Elige la fertilidad.")] public string Fertility { get; set; } = null!;
        [JsonPropertyName("storageNotes"), StringLength(300)] public string? StorageNotes { get; set; }
    }

    public class LineaVentaDto
    {
        /// <summary>Huevo fértil, Huevo consumo, Pollito, Ave adulta u Otro.</summary>
        [JsonPropertyName("product"), Required(ErrorMessage = "Elige el producto de la línea.")] public string Product { get; set; } = null!;
        /// <summary>El lote (huevos o pollitos) o el producto del catálogo (Otro) de donde sale lo vendido.</summary>
        [JsonPropertyName("sourceLotId")] public string? SourceLotId { get; set; }
        /// <summary>El ave (si se vende un ave adulta o un pollito individual).</summary>
        [JsonPropertyName("birdId")] public string? BirdId { get; set; }
        [JsonPropertyName("description"), StringLength(200)] public string? Description { get; set; }
        [JsonPropertyName("quantity")] public decimal Quantity { get; set; }
        [JsonPropertyName("unit"), StringLength(20)] public string? Unit { get; set; }
        [JsonPropertyName("unitPrice")] public decimal UnitPrice { get; set; }
        [JsonPropertyName("discount")] public decimal Discount { get; set; }
    }

    public class VentaNuevaDto
    {
        /// <summary>Vacío = cliente ocasional.</summary>
        [JsonPropertyName("customerId")] public string? CustomerId { get; set; }
        [JsonPropertyName("date"), Required(ErrorMessage = "Elige la fecha de la venta.")] public string Date { get; set; } = null!;
        [JsonPropertyName("lines"), Required(ErrorMessage = "Agrega al menos un producto a la venta."), MinLength(1, ErrorMessage = "Agrega al menos un producto a la venta."), MaxLength(50)] public List<LineaVentaDto> Lines { get; set; } = null!;
        /// <summary>Pendiente, Parcial o Pagado.</summary>
        [JsonPropertyName("paymentStatus"), Required(ErrorMessage = "Elige el estado del pago.")] public string PaymentStatus { get; set; } = null!;
        [JsonPropertyName("paymentMethod"), StringLength(40)] public string? PaymentMethod { get; set; }
        [JsonPropertyName("paid")] public decimal Paid { get; set; }
        /// <summary>El efectivo recibido, para calcular el cambio.</summary>
        [JsonPropertyName("tendered")] public decimal? Tendered { get; set; }
        [JsonPropertyName("farmName"), StringLength(80)] public string? FarmName { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
        /// <summary>La genera la app por cada intento: si se repite por un corte de red, la API devuelve la misma venta.</summary>
        [JsonPropertyName("idempotencyKey"), Required(ErrorMessage = "Falta la clave de la venta."), StringLength(80, MinimumLength = 8)] public string IdempotencyKey { get; set; } = null!;
    }

    public class AbonoDto
    {
        [JsonPropertyName("amount")] public decimal Amount { get; set; }
        [JsonPropertyName("method"), Required(ErrorMessage = "Indica el medio de pago."), StringLength(40)] public string Method { get; set; } = null!;
    }

    public class DevolucionDto
    {
        [JsonPropertyName("lineId"), Required(ErrorMessage = "Elige la línea.")] public string LineId { get; set; } = null!;
        [JsonPropertyName("quantity")] public int Quantity { get; set; }
    }

    // ---------- consultas derivadas ----------

    public class FilaDeTrazaDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("code")] public string Code { get; set; } = null!;
        [JsonPropertyName("kind")] public string Kind { get; set; } = null!;
        [JsonPropertyName("title")] public string Title { get; set; } = null!;
        [JsonPropertyName("date")] public string Date { get; set; } = null!;
        [JsonPropertyName("details")] public string Details { get; set; } = null!;
    }

    public class ResumenComercialDto
    {
        [JsonPropertyName("gross")] public decimal Gross { get; set; }
        [JsonPropertyName("paid")] public decimal Paid { get; set; }
        [JsonPropertyName("unpaid")] public decimal Unpaid { get; set; }
        [JsonPropertyName("eggsSold")] public decimal EggsSold { get; set; }
        [JsonPropertyName("chicksSold")] public decimal ChicksSold { get; set; }
        [JsonPropertyName("adultBirdsSold")] public decimal AdultBirdsSold { get; set; }
        [JsonPropertyName("availableEggs")] public decimal AvailableEggs { get; set; }
        [JsonPropertyName("availableChicks")] public decimal AvailableChicks { get; set; }
        [JsonPropertyName("hatched")] public int Hatched { get; set; }
        [JsonPropertyName("incubated")] public int Incubated { get; set; }
        /// <summary>Nacidos entre incubados; vacío si no hay huevos incubados.</summary>
        [JsonPropertyName("hatchRate")] public double? HatchRate { get; set; }
    }
}
