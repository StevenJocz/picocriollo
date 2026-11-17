using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PicoCriollo.Domain.Entities.NotificacionesE
{
    /// <summary>Un teléfono (o navegador) de una persona que puede recibir avisos push de Expo. Tabla propia de la API: la app actual no la conoce.</summary>
    [Table("api_dispositivos")]
    public class DispositivoE
    {
        [Key]
        [Column("id")]
        public Guid IdDispositivo { get; set; }

        [Column("user_id")]
        public Guid IdUsuario { get; set; }

        [Column("token")]
        public string Token { get; set; } = null!;

        [Column("plataforma")]
        public string Plataforma { get; set; } = null!;

        [Column("creado_en")]
        public DateTime CreadoEn { get; set; }
    }
}
