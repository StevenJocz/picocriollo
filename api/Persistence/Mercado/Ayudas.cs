using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;
using Microsoft.EntityFrameworkCore;

namespace PicoCriollo.Persistence.Mercado
{
    /// <summary>Operaciones sobre los bloqueos de disponibilidad. Una publicación puede tener varios (un lote de aves bloquea cada ave); todo se opera por publicación.</summary>
    public static class Bloqueos
    {
        public static Task<List<Bloqueo>> ActivosAsync(this AlmacenMercado a, string publicacionId) =>
            a.Bloqueos.ListarAsync(("listingId", publicacionId), ("status", "active"));

        public static async Task LiberarAsync(this AlmacenMercado a, string publicacionId)
        {
            foreach (Bloqueo b in await a.ActivosAsync(publicacionId))
            {
                b.Status = "released";
                b.ReleasedAt = JsonMercado.Iso(a.Ahora);
                a.Bloqueos.Actualizar(b);
            }
        }

        public static async Task ReservarAsync(this AlmacenMercado a, string publicacionId, string operacionId)
        {
            foreach (Bloqueo b in await a.ActivosAsync(publicacionId))
            {
                b.OperationId = operacionId;
                a.Bloqueos.Actualizar(b);
            }
        }

        public static async Task SoltarDeOperacionAsync(this AlmacenMercado a, string publicacionId, string operacionId)
        {
            foreach (Bloqueo b in await a.ActivosAsync(publicacionId))
            {
                if (b.OperationId != operacionId) continue;
                b.OperationId = null;
                a.Bloqueos.Actualizar(b);
            }
        }
    }

    public static class AyudasOperacion
    {
        public static void Paso(Operacion op, string estado, string actor, DateTime ahora, string? nota = null)
        {
            op.Status = estado;
            op.UpdatedAt = JsonMercado.Iso(ahora);
            op.Version += 1;
            op.History.Add(new PasoDeOperacion { At = op.UpdatedAt, Status = estado, ActorId = actor, Note = string.IsNullOrEmpty(nota) ? null : nota });
        }

        public static Operacion Nueva(AlmacenMercado a, Publicacion publicacion, string comprador, string origen, long precio, string estado, string actor)
        {
            string en = JsonMercado.Iso(a.Ahora);
            var op = new Operacion
            {
                Id = Guid.NewGuid().ToString(), ListingId = publicacion.Id, BirdId = publicacion.BirdId, SellerId = publicacion.SellerId, BuyerId = comprador,
                Origin = origen, Price = precio, Status = estado, CreatedAt = en, UpdatedAt = en,
                History = [new PasoDeOperacion { At = en, Status = estado, ActorId = actor }],
            };
            a.Operaciones.Insertar(op);
            return op;
        }

        /// <summary>El motivo de una cancelación o una disputa: obligatorio, de 10 a 500 caracteres.</summary>
        public static string Motivo(string? motivo)
        {
            if (motivo is null || motivo.Trim().Length < 10) throw ReglaNegocioException.Validacion("Explica el motivo (al menos 10 caracteres).");
            if (motivo.Length > 500) throw ReglaNegocioException.Validacion("El motivo supera 500 caracteres.");
            return motivo.Trim();
        }

        public static async Task<GranjaE> GranjaAsync(AlmacenMercado a, string usuario, bool seguimiento = false)
        {
            if (!Guid.TryParse(usuario, out Guid id)) throw ReglaNegocioException.NoEncontrado("No existe la granja de esa cuenta.");
            IQueryable<GranjaE> consulta = seguimiento ? a.Contexto.GranjaEs : a.Contexto.GranjaEs.AsNoTracking();
            return await consulta.FirstOrDefaultAsync(g => g.IdUsuario == id) ?? throw ReglaNegocioException.NoEncontrado("No existe la granja de esa cuenta.");
        }

        public static string? ConsultaId(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor;
    }
}
