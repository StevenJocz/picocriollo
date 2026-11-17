using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PicoCriollo.Domain.Entities.UsuarioE
{
    /// <summary>Enlace para restablecer la contraseña. Solo se guarda el hash del token; vale 30 minutos y una sola vez.</summary>
    [Table("api_password_resets")]
    public class RestablecimientoE
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
    }
}
