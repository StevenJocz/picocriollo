using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PicoCriollo.Domain.Entities.UsuarioE
{
    /// <summary>Token de refresco. Solo se guarda su hash SHA-256; el token en claro lo tiene únicamente el cliente.</summary>
    [Table("api_refresh_tokens")]
    public class RefrescoE
    {
        [Key]
        [Column("token_hash")]
        public string TokenHash { get; set; } = null!;

        [Column("user_id")]
        public Guid IdUsuario { get; set; }

        [Column("expires_at")]
        public DateTime ExpiraEn { get; set; }

        [Column("created_at")]
        public DateTime CreadoEn { get; set; }

        [Column("revoked_at")]
        public DateTime? RevocadoEn { get; set; }

        [Column("replaced_by")]
        public string? ReemplazadoPor { get; set; }
    }
}
