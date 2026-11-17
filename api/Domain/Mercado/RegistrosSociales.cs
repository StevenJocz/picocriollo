using System.Text.Json.Nodes;

namespace PicoCriollo.Domain.Mercado
{
    // Documentos de las tablas pc_* de notificaciones, preferencias y perfil social. Mismas reglas que los del mercado:
    // vocabulario y valores de la app Next.js, fechas ISO 8601 en UTC, sin valor = no se escribe.

    public class EnlaceNotificacion
    {
        public string View { get; set; } = string.Empty;
        public string? Id { get; set; }
    }

    public class Notificacion
    {
        public string Id { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Priority { get; set; } = "normal";
        public bool Critical { get; set; }
        public string Type { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public EnlaceNotificacion Link { get; set; } = new();
        public string EventId { get; set; } = string.Empty;
        public string DedupeKey { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
        public string? ReadAt { get; set; }
    }

    public class HorarioSilencio
    {
        public bool Enabled { get; set; }
        public string Start { get; set; } = "22:00";
        public string End { get; set; } = "06:00";
    }

    public class PreferenciasComerciales
    {
        public bool Offers { get; set; } = true;
        public bool Interests { get; set; } = true;
    }

    public class Preferencias
    {
        public string Id { get; set; } = string.Empty;
        public Dictionary<string, bool> Categories { get; set; } = [];
        public Dictionary<string, bool> Channels { get; set; } = [];
        public HorarioSilencio QuietHours { get; set; } = new();
        public string TimeZone { get; set; } = "America/Bogota";
        public Dictionary<string, List<string>> ChannelCategories { get; set; } = [];
        public int IncubationLeadDays { get; set; } = 3;
        public int TaskLeadDays { get; set; } = 2;
        public int IncubationMarginDays { get; set; } = 2;
        public int IncubationStaleDays { get; set; } = 10;
        public string Digest { get; set; } = "nunca";
        public PreferenciasComerciales Commercial { get; set; } = new();
        public string UpdatedAt { get; set; } = string.Empty;
    }

    public class Seguimiento
    {
        public string Id { get; set; } = string.Empty;
        public string FollowerId { get; set; } = string.Empty;
        public string FollowingId { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
    }

    public class VideoEnlazado
    {
        public string Provider { get; set; } = string.Empty;
        public string Id { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
    }

    public class PublicacionPerfil
    {
        public string Id { get; set; } = string.Empty;
        public string AuthorId { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public List<string> MediaIds { get; set; } = [];
        public string CreatedAt { get; set; } = string.Empty;
        public string UpdatedAt { get; set; } = string.Empty;
        public string? EditedAt { get; set; }
        public string? HiddenAt { get; set; }
        public string? HiddenBy { get; set; }
        public bool? Demo { get; set; }
        public string? DemoImageUrl { get; set; }
        public VideoEnlazado? Embed { get; set; }
        public string? SharedFromId { get; set; }
    }

    public class MeGusta
    {
        public string Id { get; set; } = string.Empty;
        public string PostId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
    }

    public class ComentarioPerfil
    {
        public string Id { get; set; } = string.Empty;
        public string PostId { get; set; } = string.Empty;
        public string? ParentId { get; set; }
        public string? ReplyToUserId { get; set; }
        public string AuthorId { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public string CreatedAt { get; set; } = string.Empty;
        public string? EditedAt { get; set; }
        public string? HiddenAt { get; set; }
        public string? HiddenBy { get; set; }
        public string? DeletedAt { get; set; }
    }

    public class ArchivoMedia
    {
        public string Id { get; set; } = string.Empty;
        public string OwnerId { get; set; } = string.Empty;
        public string Kind { get; set; } = "image";
        public string Mime { get; set; } = string.Empty;
        public long Size { get; set; }
        public string Purpose { get; set; } = "post";
        public string? ThumbOf { get; set; }
        public string? PostId { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
        public string CreatedAt { get; set; } = string.Empty;
    }

    public class InteresDeReels
    {
        public Dictionary<string, string> Seen { get; set; } = [];
        public string Id { get; set; } = string.Empty;
        public Dictionary<string, double> Weights { get; set; } = [];
        public Dictionary<string, double> Authors { get; set; } = [];
        public string UpdatedAt { get; set; } = string.Empty;
    }
}
