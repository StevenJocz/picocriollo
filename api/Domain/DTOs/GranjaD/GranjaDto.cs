using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PicoCriollo.Domain.DTOs.GranjaD
{
    // Los nombres de las propiedades en el JSON (name, capacity, startedAt…) son los del documento de la granja de la app
    // actual (src/models/farm.ts), para que el documento y la API compartan un solo vocabulario. Los identificadores en C# van en español.

    /// <summary>La granja completa de una persona: un documento con listas (gallineros, aves, huevos…) y su versión.</summary>
    public class GranjaDto
    {
        [JsonPropertyName("datos")] public JsonElement Datos { get; set; }
        [JsonPropertyName("version")] public long Version { get; set; }
    }

    /// <summary>Resultado de crear, cambiar o borrar un registro. Version es la nueva versión del documento.</summary>
    public class RegistroGuardadoDto
    {
        [JsonPropertyName("respuesta")] public bool Respuesta { get; set; } = true;
        [JsonPropertyName("mensaje")] public string Mensaje { get; set; } = string.Empty;
        [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
        [JsonPropertyName("codigo")] public string? Codigo { get; set; }
        [JsonPropertyName("version")] public long Version { get; set; }
    }

    public class GallineroDto
    {
        [JsonPropertyName("name"), Required(ErrorMessage = "Escribe el nombre del gallinero."), StringLength(80)] public string Name { get; set; } = null!;
        [JsonPropertyName("location"), StringLength(120)] public string? Location { get; set; }
        [JsonPropertyName("capacity")] public int Capacity { get; set; }
        /// <summary>Piso, Pastoril, Mixto o Cría.</summary>
        [JsonPropertyName("type")] public string? Type { get; set; }
        /// <summary>Activo, Inactivo o En mantenimiento.</summary>
        [JsonPropertyName("status")] public string? Status { get; set; }
        /// <summary>Fecha en formato AAAA-MM-DD.</summary>
        [JsonPropertyName("startedAt")] public string? StartedAt { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class AveDto
    {
        [JsonPropertyName("name"), Required(ErrorMessage = "Escribe el nombre o apodo del ave."), StringLength(80)] public string Name { get; set; } = null!;
        [JsonPropertyName("species"), StringLength(40)] public string? Species { get; set; }
        /// <summary>Gallina, Gallo o Pollito.</summary>
        [JsonPropertyName("sex"), Required(ErrorMessage = "Elige el sexo del ave.")] public string Sex { get; set; } = null!;
        [JsonPropertyName("breed"), StringLength(60)] public string? Breed { get; set; }
        [JsonPropertyName("coopId"), Required(ErrorMessage = "Elige el gallinero del ave.")] public string CoopId { get; set; } = null!;
        /// <summary>Activo, En reproducción, Clueca, Inactivo, Vendido o Fallecido. «Transferido» solo lo asigna el sistema.</summary>
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("bornAt")] public string? BornAt { get; set; }
        [JsonPropertyName("origin"), StringLength(120)] public string? Origin { get; set; }
        [JsonPropertyName("motherId")] public string? MotherId { get; set; }
        [JsonPropertyName("fatherId")] public string? FatherId { get; set; }
        [JsonPropertyName("photo"), StringLength(300)] public string? Photo { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class RecoleccionDto
    {
        [JsonPropertyName("date"), Required(ErrorMessage = "Elige la fecha de la recolección.")] public string Date { get; set; } = null!;
        [JsonPropertyName("coopId"), Required(ErrorMessage = "Elige el gallinero.")] public string CoopId { get; set; } = null!;
        /// <summary>Gallina que puso, solo si se conoce.</summary>
        [JsonPropertyName("henId")] public string? HenId { get; set; }
        [JsonPropertyName("breedingGroupId")] public string? BreedingGroupId { get; set; }
        [JsonPropertyName("eggs")] public int Eggs { get; set; }
        [JsonPropertyName("broken")] public int Broken { get; set; }
        [JsonPropertyName("dirty")] public int Dirty { get; set; }
        [JsonPropertyName("incubation")] public int Incubation { get; set; }
        [JsonPropertyName("consumption")] public int Consumption { get; set; }
        [JsonPropertyName("sale")] public int Sale { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class IncubacionDto
    {
        /// <summary>Natural o Artificial.</summary>
        [JsonPropertyName("type"), Required(ErrorMessage = "Elige el tipo de incubación.")] public string Type { get; set; } = null!;
        /// <summary>Gallina clueca (obligatoria si es natural).</summary>
        [JsonPropertyName("henId")] public string? HenId { get; set; }
        [JsonPropertyName("equipment"), StringLength(80)] public string? Equipment { get; set; }
        [JsonPropertyName("coopId"), Required(ErrorMessage = "Elige el gallinero o espacio.")] public string CoopId { get; set; } = null!;
        [JsonPropertyName("startedAt"), Required(ErrorMessage = "Elige la fecha de inicio.")] public string StartedAt { get; set; } = null!;
        /// <summary>Todavía no se admiten lotes de huevos: llegan con el mercado. Debe ir vacío.</summary>
        [JsonPropertyName("sourceLotIds")] public List<string>? SourceLotIds { get; set; }
        [JsonPropertyName("eggs")] public int Eggs { get; set; }
        [JsonPropertyName("hatched")] public int Hatched { get; set; }
        [JsonPropertyName("removed")] public int Removed { get; set; }
        [JsonPropertyName("hatchAdjustmentDays")] public int? HatchAdjustmentDays { get; set; }
        /// <summary>En curso, Finalizada o Interrumpida.</summary>
        [JsonPropertyName("status"), Required(ErrorMessage = "Elige el estado de la incubación.")] public string Status { get; set; } = null!;
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class CompraDto
    {
        [JsonPropertyName("date"), Required(ErrorMessage = "Elige la fecha de la compra.")] public string Date { get; set; } = null!;
        [JsonPropertyName("product"), Required(ErrorMessage = "Escribe el producto."), StringLength(80)] public string Product { get; set; } = null!;
        [JsonPropertyName("category")] public string? Category { get; set; }
        [JsonPropertyName("quantity")] public decimal Quantity { get; set; }
        /// <summary>kg, bulto, saco, unidad o litro.</summary>
        [JsonPropertyName("unit")] public string? Unit { get; set; }
        [JsonPropertyName("unitPrice")] public decimal UnitPrice { get; set; }
        [JsonPropertyName("supplier"), StringLength(120)] public string? Supplier { get; set; }
        [JsonPropertyName("coopId")] public string? CoopId { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class ConsumoDto
    {
        [JsonPropertyName("stockId"), Required(ErrorMessage = "Selecciona un producto existente.")] public string StockId { get; set; } = null!;
        [JsonPropertyName("quantity")] public decimal Quantity { get; set; }
        [JsonPropertyName("date"), Required(ErrorMessage = "Elige la fecha del consumo.")] public string Date { get; set; } = null!;
        [JsonPropertyName("coopId")] public string? CoopId { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class TareaDto
    {
        [JsonPropertyName("title"), Required(ErrorMessage = "Escribe la tarea."), StringLength(120)] public string Title { get; set; } = null!;
        [JsonPropertyName("coopId"), Required(ErrorMessage = "Elige el gallinero.")] public string CoopId { get; set; } = null!;
        [JsonPropertyName("frequencyDays")] public int FrequencyDays { get; set; }
        [JsonPropertyName("lastDone")] public string? LastDone { get; set; }
        [JsonPropertyName("nextDue"), Required(ErrorMessage = "Elige la próxima fecha.")] public string NextDue { get; set; } = null!;
        /// <summary>Pendiente, Próxima, Vencida o Completada.</summary>
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("stockId")] public string? StockId { get; set; }
        [JsonPropertyName("supplies")] public decimal Supplies { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class CompletarTareaDto
    {
        /// <summary>Fecha de hoy (AAAA-MM-DD) según la persona; si falta, la del servidor.</summary>
        [JsonPropertyName("hoy")] public string? Hoy { get; set; }
    }
}
