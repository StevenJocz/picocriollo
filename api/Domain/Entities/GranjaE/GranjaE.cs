using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PicoCriollo.Domain.Entities.GranjaE
{
    /// <summary>Tabla farm_data de la app actual: la granja completa de una persona en un documento jsonb.</summary>
    [Table("farm_data")]
    public class GranjaE
    {
        [Key]
        [Column("user_id")]
        public Guid IdUsuario { get; set; }

        [Column("data", TypeName = "jsonb")]
        public string Datos { get; set; } = "{}";

        /// <summary>Control de versión optimista: dos guardados sobre la misma versión no pueden convivir; el segundo recibe un conflicto.</summary>
        [ConcurrencyCheck]
        [Column("version")]
        public long Version { get; set; }

        [Column("updated_at")]
        public DateTime ActualizadoEn { get; set; }
    }
}
