using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PicoCriollo.Domain.Entities.UsuarioE
{
    /// <summary>Sesiones por cookie de la app Next.js (app_sessions). La API solo las cierra al cambiar la contraseña.</summary>
    [Table("app_sessions")]
    public class SesionE
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
