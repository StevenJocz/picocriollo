using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PicoCriollo.Domain.DTOs.GranjaD
{
    // Mismo vocabulario que el documento de la granja (births, breedingGroups, rings, birdEvents).

    public class NacimientoDto
    {
        [JsonPropertyName("incubationId"), Required(ErrorMessage = "Elige la incubación.")] public string IncubationId { get; set; } = null!;
        [JsonPropertyName("date"), Required(ErrorMessage = "Elige la fecha de nacimiento.")] public string Date { get; set; } = null!;
        [JsonPropertyName("count")] public int Count { get; set; }
        [JsonPropertyName("motherId")] public string? MotherId { get; set; }
        [JsonPropertyName("fatherId")] public string? FatherId { get; set; }
        /// <summary>Confirmada, Probable o Desconocida.</summary>
        [JsonPropertyName("parentageStatus")] public string? ParentageStatus { get; set; }
        [JsonPropertyName("coopId")] public string? CoopId { get; set; }
        [JsonPropertyName("breed"), StringLength(60)] public string? Breed { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class GrupoReproductorDto
    {
        [JsonPropertyName("name"), Required(ErrorMessage = "Escribe el nombre del grupo."), StringLength(80)] public string Name { get; set; } = null!;
        [JsonPropertyName("coopId")] public string? CoopId { get; set; }
        [JsonPropertyName("breed"), StringLength(60)] public string? Breed { get; set; }
        [JsonPropertyName("roosterId"), Required(ErrorMessage = "Elige el gallo.")] public string RoosterId { get; set; } = null!;
        [JsonPropertyName("henIds"), Required(ErrorMessage = "Elige al menos una gallina.")] public List<string> HenIds { get; set; } = null!;
        [JsonPropertyName("startedAt"), Required(ErrorMessage = "Elige la fecha de inicio.")] public string StartedAt { get; set; } = null!;
        [JsonPropertyName("endedAt")] public string? EndedAt { get; set; }
        /// <summary>Activo o Finalizado.</summary>
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("notes"), StringLength(1000)] public string? Notes { get; set; }
    }

    public class AsignarAnilloDto
    {
        [JsonPropertyName("number")] public int Number { get; set; }
        [JsonPropertyName("birdId"), Required(ErrorMessage = "Elige el ave.")] public string BirdId { get; set; } = null!;
    }

    public class RetirarAnilloDto
    {
        [JsonPropertyName("birdId"), Required(ErrorMessage = "Elige el ave.")] public string BirdId { get; set; } = null!;
    }

    public class InhabilitarAnilloDto
    {
        [JsonPropertyName("number")] public int Number { get; set; }
        [JsonPropertyName("notes"), StringLength(300)] public string? Notes { get; set; }
    }

    public class ActivarAnilloDto
    {
        [JsonPropertyName("number")] public int Number { get; set; }
    }

    public class EventoAveDto
    {
        [JsonPropertyName("birdId"), Required(ErrorMessage = "Elige el ave.")] public string BirdId { get; set; } = null!;
        /// <summary>Observación, Salud o Reproductivo.</summary>
        [JsonPropertyName("kind"), Required(ErrorMessage = "Elige el tipo de evento.")] public string Kind { get; set; } = null!;
        [JsonPropertyName("date"), Required(ErrorMessage = "Elige la fecha.")] public string Date { get; set; } = null!;
        [JsonPropertyName("title"), Required(ErrorMessage = "Escribe un título para el evento."), StringLength(120)] public string Title { get; set; } = null!;
        [JsonPropertyName("details"), StringLength(1000)] public string? Details { get; set; }
    }
}
