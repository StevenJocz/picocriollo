using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using PicoCriollo.Domain.DTOs.MercadoD;

namespace PicoCriollo.Domain.DTOs.SocialD
{
    public class PerfilDestacadoDto
    {
        public string Id { get; set; } = "";
        public string Alias { get; set; } = "";
        public string? AvatarUrl { get; set; }
        public string Category { get; set; } = "";
        public int Count { get; set; }
    }
    // Mismo vocabulario que el perfil social de la app Next.js (authorId, mediaIds, likes…).

    // ---------- órdenes ----------

    public class PerfilCambioDto
    {
        [JsonPropertyName("displayName"), StringLength(80)] public string? DisplayName { get; set; }
        [JsonPropertyName("contactPhone"), StringLength(30)] public string? ContactPhone { get; set; }
        [JsonPropertyName("timeZone"), StringLength(60)] public string? TimeZone { get; set; }
    }

    public class RedesDto
    {
        [JsonPropertyName("tiktok"), StringLength(300)] public string? Tiktok { get; set; }
        [JsonPropertyName("instagram"), StringLength(300)] public string? Instagram { get; set; }
        [JsonPropertyName("youtube"), StringLength(300)] public string? Youtube { get; set; }
    }

    public class UbicacionDto
    {
        /// <summary>Vacía quita la ubicación.</summary>
        [JsonPropertyName("city")] public string? City { get; set; }
        [JsonPropertyName("region")] public string? Region { get; set; }
    }

    public class PublicacionPerfilNuevaDto
    {
        [JsonPropertyName("text")] public string? Text { get; set; }
        [JsonPropertyName("mediaIds")] public List<string>? MediaIds { get; set; }
        /// <summary>Enlace de un video público de YouTube.</summary>
        [JsonPropertyName("videoUrl")] public string? VideoUrl { get; set; }
    }

    public class TextoDto
    {
        [JsonPropertyName("text")] public string? Text { get; set; }
    }

    public class ComentarioNuevoDto
    {
        [JsonPropertyName("text"), Required(ErrorMessage = "Escribe un comentario.")] public string Text { get; set; } = null!;
        [JsonPropertyName("parentId")] public string? ParentId { get; set; }
    }

    public class MeGustaDto
    {
        [JsonPropertyName("liked")] public bool Liked { get; set; }
    }

    public class SenalDto
    {
        [JsonPropertyName("key"), Required, StringLength(40)] public string Key { get; set; } = null!;
        /// <summary>view o open.</summary>
        [JsonPropertyName("type"), Required, StringLength(10)] public string Type { get; set; } = null!;
        [JsonPropertyName("ms")] public double? Ms { get; set; }
    }

    public class SenalesDto
    {
        [JsonPropertyName("signals"), Required, MaxLength(40)] public List<SenalDto> Signals { get; set; } = null!;
    }

    // ---------- vistas ----------

    public class RedesVistaDto
    {
        [JsonPropertyName("tiktok")] public string? Tiktok { get; set; }
        [JsonPropertyName("instagram")] public string? Instagram { get; set; }
        [JsonPropertyName("youtube")] public string? Youtube { get; set; }
    }

    public class LugarDto
    {
        [JsonPropertyName("city")] public string City { get; set; } = null!;
        [JsonPropertyName("region")] public string? Region { get; set; }
    }

    public class MiPerfilDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("email")] public string Email { get; set; } = null!;
        [JsonPropertyName("displayName")] public string DisplayName { get; set; } = string.Empty;
        [JsonPropertyName("avatarUrl")] public string? AvatarUrl { get; set; }
        [JsonPropertyName("timeZone")] public string TimeZone { get; set; } = null!;
        [JsonPropertyName("role")] public string Role { get; set; } = null!;
        [JsonPropertyName("contactPhone")] public string ContactPhone { get; set; } = string.Empty;
        [JsonPropertyName("location")] public LugarDto? Location { get; set; }
        [JsonPropertyName("social")] public RedesVistaDto Social { get; set; } = new();
    }

    public class PerfilPublicoDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("avatarUrl")] public string? AvatarUrl { get; set; }
        [JsonPropertyName("location")] public LugarDto? Location { get; set; }
        [JsonPropertyName("social")] public RedesVistaDto Social { get; set; } = new();
        [JsonPropertyName("followers")] public int Followers { get; set; }
        [JsonPropertyName("following")] public int Following { get; set; }
        [JsonPropertyName("publications")] public int Publications { get; set; }
        [JsonPropertyName("isFollowing")] public bool IsFollowing { get; set; }
        [JsonPropertyName("isMe")] public bool IsMe { get; set; }
        [JsonPropertyName("reputation")] public ReputacionPublicaDto Reputation { get; set; } = null!;
        [JsonPropertyName("listings")] public int Listings { get; set; }
    }

    public class SeguirResultadoDto
    {
        [JsonPropertyName("following")] public bool Following { get; set; }
        [JsonPropertyName("followers")] public int Followers { get; set; }
        [JsonPropertyName("followingCount")] public int FollowingCount { get; set; }
    }

    public class MedioDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("kind")] public string Kind { get; set; } = null!;
        [JsonPropertyName("mime")] public string Mime { get; set; } = null!;
        [JsonPropertyName("size")] public long Size { get; set; }
        [JsonPropertyName("width")] public int? Width { get; set; }
        [JsonPropertyName("height")] public int? Height { get; set; }
        [JsonPropertyName("url")] public string Url { get; set; } = null!;
        [JsonPropertyName("thumbUrl")] public string? ThumbUrl { get; set; }
    }

    public class VideoDto
    {
        [JsonPropertyName("provider")] public string Provider { get; set; } = null!;
        [JsonPropertyName("label")] public string Label { get; set; } = null!;
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("kind")] public string Kind { get; set; } = null!;
        [JsonPropertyName("url")] public string Url { get; set; } = null!;
        [JsonPropertyName("embedUrl")] public string EmbedUrl { get; set; } = null!;
        [JsonPropertyName("aspect")] public string Aspect { get; set; } = null!;
    }

    /// <summary>El original de un reel compartido. Si ya no está disponible, solo <c>available: false</c>.</summary>
    public class CompartidoDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("available")] public bool Available { get; set; }
        [JsonPropertyName("authorId")] public string? AuthorId { get; set; }
        [JsonPropertyName("authorAlias")] public string? AuthorAlias { get; set; }
        [JsonPropertyName("authorAvatarUrl")] public string? AuthorAvatarUrl { get; set; }
        [JsonPropertyName("text")] public string? Text { get; set; }
        [JsonPropertyName("createdAt")] public string? CreatedAt { get; set; }
        [JsonPropertyName("media")] public List<MedioDto>? Media { get; set; }
        [JsonPropertyName("embed")] public VideoDto? Embed { get; set; }
    }

    public class PostDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("authorId")] public string AuthorId { get; set; } = null!;
        [JsonPropertyName("authorAlias")] public string AuthorAlias { get; set; } = null!;
        [JsonPropertyName("authorAvatarUrl")] public string? AuthorAvatarUrl { get; set; }
        [JsonPropertyName("authorFollowers")] public int AuthorFollowers { get; set; }
        [JsonPropertyName("followedByViewer")] public bool FollowedByViewer { get; set; }
        [JsonPropertyName("text")] public string Text { get; set; } = string.Empty;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
        [JsonPropertyName("editedAt")] public string? EditedAt { get; set; }
        [JsonPropertyName("mine")] public bool Mine { get; set; }
        [JsonPropertyName("hidden")] public bool? Hidden { get; set; }
        [JsonPropertyName("media")] public List<MedioDto> Media { get; set; } = [];
        [JsonPropertyName("likes")] public int Likes { get; set; }
        [JsonPropertyName("liked")] public bool Liked { get; set; }
        [JsonPropertyName("commentCount")] public int CommentCount { get; set; }
        [JsonPropertyName("embed")] public VideoDto? Embed { get; set; }
        [JsonPropertyName("shared")] public CompartidoDto? Shared { get; set; }
    }

    public class PaginaPostsDto
    {
        [JsonPropertyName("items")] public List<PostDto> Items { get; set; } = [];
        [JsonPropertyName("nextBefore")] public string? NextBefore { get; set; }
    }

    public class MeGustaResultadoDto
    {
        [JsonPropertyName("liked")] public bool Liked { get; set; }
        [JsonPropertyName("likes")] public int Likes { get; set; }
    }

    public class PersonaDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
        [JsonPropertyName("avatarUrl")] public string? AvatarUrl { get; set; }
    }

    public class QuienDioMeGustaDto
    {
        [JsonPropertyName("total")] public int Total { get; set; }
        [JsonPropertyName("users")] public List<PersonaDto> Users { get; set; } = [];
    }

    public class ResponderADto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("alias")] public string Alias { get; set; } = null!;
    }

    public class ComentarioDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("postId")] public string PostId { get; set; } = null!;
        [JsonPropertyName("parentId")] public string? ParentId { get; set; }
        [JsonPropertyName("authorId")] public string AuthorId { get; set; } = null!;
        [JsonPropertyName("authorAlias")] public string AuthorAlias { get; set; } = null!;
        [JsonPropertyName("authorAvatarUrl")] public string? AuthorAvatarUrl { get; set; }
        [JsonPropertyName("replyTo")] public ResponderADto? ReplyTo { get; set; }
        [JsonPropertyName("text")] public string Text { get; set; } = string.Empty;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
        [JsonPropertyName("editedAt")] public string? EditedAt { get; set; }
        [JsonPropertyName("mine")] public bool Mine { get; set; }
        [JsonPropertyName("canDelete")] public bool CanDelete { get; set; }
        [JsonPropertyName("hidden")] public bool? Hidden { get; set; }
        [JsonPropertyName("deleted")] public bool? Deleted { get; set; }
        [JsonPropertyName("replies")] public List<ComentarioDto>? Replies { get; set; }
        [JsonPropertyName("repliesTotal")] public int RepliesTotal { get; set; }
    }

    public class PaginaComentariosDto
    {
        [JsonPropertyName("items")] public List<ComentarioDto> Items { get; set; } = [];
        [JsonPropertyName("nextAfter")] public string? NextAfter { get; set; }
        [JsonPropertyName("total")] public int Total { get; set; }
    }

    /// <summary>Un elemento del feed de reels: una publicación de la comunidad o un aviso del mercado (<c>kind</c> = post | advertisement).</summary>
    public class ElementoReelDto
    {
        [JsonPropertyName("kind")] public string Kind { get; set; } = null!;
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = null!;
        [JsonPropertyName("post")] public PostDto? Post { get; set; }
        [JsonPropertyName("listing")] public PublicacionVistaDto? Listing { get; set; }
        [JsonPropertyName("sellerAvatarUrl")] public string? SellerAvatarUrl { get; set; }
        [JsonPropertyName("sellerFollowers")] public int? SellerFollowers { get; set; }
        [JsonPropertyName("followedByViewer")] public bool? FollowedByViewer { get; set; }
    }

    public class PaginaReelsDto
    {
        [JsonPropertyName("items")] public List<ElementoReelDto> Items { get; set; } = [];
        [JsonPropertyName("nextBefore")] public string? NextBefore { get; set; }
    }

    public class AceptadasDto
    {
        [JsonPropertyName("accepted")] public int Accepted { get; set; }
    }

    public class MedioSubidoDto
    {
        [JsonPropertyName("id")] public string Id { get; set; } = null!;
        [JsonPropertyName("url")] public string Url { get; set; } = null!;
    }
}
