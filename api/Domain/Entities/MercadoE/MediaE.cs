using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace PicoCriollo.Domain.Entities.MercadoE
{
    /// <summary>Los bytes de un archivo (foto o video) de la tabla pc_media de la app actual. Los datos del archivo (dueño, uso, publicación) están en pc_media_items.</summary>
    [Table("pc_media")]
    public class MediaE
    {
        [Key]
        [Column("id")]
        public string Id { get; set; } = null!;

        [Column("mime")]
        public string Mime { get; set; } = null!;

        [Column("owner_id")]
        public string OwnerId { get; set; } = null!;

        [Column("bytes")]
        public byte[] Bytes { get; set; } = [];

        [Column("created_at")]
        public DateTime CreadoEn { get; set; }
    }
}
