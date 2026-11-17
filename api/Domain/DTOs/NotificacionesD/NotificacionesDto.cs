using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace PicoCriollo.Domain.DTOs.NotificacionesD
{
    // Mismo vocabulario que el documento de preferencias de la app Next.js (categories, channels, quietHours…).

    public class SilencioDto
    {
        [JsonPropertyName("enabled")] public bool Enabled { get; set; }
        [JsonPropertyName("start")] public string? Start { get; set; }
        [JsonPropertyName("end")] public string? End { get; set; }
    }

    public class ComercialDto
    {
        [JsonPropertyName("offers")] public bool? Offers { get; set; }
        [JsonPropertyName("interests")] public bool? Interests { get; set; }
    }

    /// <summary>Cambios parciales: lo que no viene se queda como estaba.</summary>
    public class PreferenciasCambioDto
    {
        [JsonPropertyName("categories")] public Dictionary<string, bool>? Categories { get; set; }
        [JsonPropertyName("channels")] public Dictionary<string, bool>? Channels { get; set; }
        [JsonPropertyName("channelCategories")] public Dictionary<string, List<string>>? ChannelCategories { get; set; }
        [JsonPropertyName("quietHours")] public SilencioDto? QuietHours { get; set; }
        [JsonPropertyName("timeZone")] public string? TimeZone { get; set; }
        [JsonPropertyName("incubationLeadDays")] public int? IncubationLeadDays { get; set; }
        [JsonPropertyName("taskLeadDays")] public int? TaskLeadDays { get; set; }
        [JsonPropertyName("incubationMarginDays")] public int? IncubationMarginDays { get; set; }
        [JsonPropertyName("incubationStaleDays")] public int? IncubationStaleDays { get; set; }
        [JsonPropertyName("digest")] public string? Digest { get; set; }
        [JsonPropertyName("commercial")] public ComercialDto? Commercial { get; set; }
    }

    public class PreferenciasDto
    {
        [JsonPropertyName("categories")] public Dictionary<string, bool> Categories { get; set; } = [];
        [JsonPropertyName("channels")] public Dictionary<string, bool> Channels { get; set; } = [];
        [JsonPropertyName("channelCategories")] public Dictionary<string, List<string>> ChannelCategories { get; set; } = [];
        [JsonPropertyName("quietHours")] public SilencioVistaDto QuietHours { get; set; } = new();
        [JsonPropertyName("timeZone")] public string TimeZone { get; set; } = null!;
        [JsonPropertyName("incubationLeadDays")] public int IncubationLeadDays { get; set; }
        [JsonPropertyName("taskLeadDays")] public int TaskLeadDays { get; set; }
        [JsonPropertyName("incubationMarginDays")] public int IncubationMarginDays { get; set; }
        [JsonPropertyName("incubationStaleDays")] public int IncubationStaleDays { get; set; }
        [JsonPropertyName("digest")] public string Digest { get; set; } = null!;
        [JsonPropertyName("commercial")] public ComercialVistaDto Commercial { get; set; } = new();
        /// <summary>Nombre visible de cada categoría y canal, para armar la pantalla sin repetir textos.</summary>
        [JsonPropertyName("categoryLabels")] public Dictionary<string, string> CategoryLabels { get; set; } = [];
        [JsonPropertyName("channelLabels")] public Dictionary<string, string> ChannelLabels { get; set; } = [];
    }

    public class SilencioVistaDto
    {
        [JsonPropertyName("enabled")] public bool Enabled { get; set; }
        [JsonPropertyName("start")] public string Start { get; set; } = null!;
        [JsonPropertyName("end")] public string End { get; set; } = null!;
    }

    public class ComercialVistaDto
    {
        [JsonPropertyName("offers")] public bool Offers { get; set; }
        [JsonPropertyName("interests")] public bool Interests { get; set; }
    }

    public class EnlaceDto
    {
        [JsonPropertyName("view")] public string View { get; set; } = null!;
        [JsonPropertyName("id")] public string? Id { get; set; }
    }

    public class NotificacionDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("category")] public string Category { get; set; } = null!;
        [JsonPropertyName("priority")] public string Priority { get; set; } = null!;
        [JsonPropertyName("critical")] public bool Critical { get; set; }
        [JsonPropertyName("type")] public string Type { get; set; } = null!;
        [JsonPropertyName("title")] public string Title { get; set; } = null!;
        [JsonPropertyName("body")] public string Body { get; set; } = null!;
        [JsonPropertyName("link")] public EnlaceDto Link { get; set; } = null!;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
        [JsonPropertyName("readAt")] public string? ReadAt { get; set; }
    }

    public class ResumenNotificacionesDto
    {
        /// <summary>Sin leer, sin contar los mensajes (esos van aparte).</summary>
        [JsonPropertyName("unread")] public int Unread { get; set; }
        [JsonPropertyName("unreadMessages")] public int UnreadMessages { get; set; }
        [JsonPropertyName("messageThreads")] public List<string> MessageThreads { get; set; } = [];
        [JsonPropertyName("critical")] public int Critical { get; set; }
        [JsonPropertyName("latest")] public List<NotificacionDto> Latest { get; set; } = [];
    }

    public class LeerDto
    {
        [JsonPropertyName("ids"), Required(ErrorMessage = "Indica entre 1 y 200 notificaciones."), MinLength(1, ErrorMessage = "Indica entre 1 y 200 notificaciones."), MaxLength(200, ErrorMessage = "Indica entre 1 y 200 notificaciones.")] public List<string> Ids { get; set; } = null!;
    }

    public class LeerEnlaceDto
    {
        [JsonPropertyName("type"), Required, StringLength(60)] public string Type { get; set; } = null!;
        [JsonPropertyName("linkId"), Required, StringLength(120)] public string LinkId { get; set; } = null!;
    }

    public class CambiosDto
    {
        [JsonPropertyName("changed")] public int Changed { get; set; }
    }

    public class DispositivoDto
    {
        /// <summary>El token de Expo del teléfono: «ExponentPushToken[…]».</summary>
        [JsonPropertyName("token"), Required(ErrorMessage = "Falta el token del dispositivo."), StringLength(200, MinimumLength = 10)] public string Token { get; set; } = null!;
        /// <summary>ios, android o web.</summary>
        [JsonPropertyName("plataforma"), Required, StringLength(20)] public string Plataforma { get; set; } = null!;
    }
}
