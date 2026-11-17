namespace PicoCriollo.Domain.Entities.MercadoE
{
    /// <summary>
    /// Una fila de cualquier tabla pc_* del mercado: el id y el documento jsonb. Todas comparten esta clase (el contexto la mapea
    /// una vez por tabla); lo que cambia es el tipo de documento que cada colección guarda dentro.
    /// </summary>
    public class FilaDocumento
    {
        public string Id { get; set; } = null!;
        public string Datos { get; set; } = "{}";
    }
}
