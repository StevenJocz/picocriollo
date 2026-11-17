using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;

namespace PicoCriollo.Persistence.Mercado
{
    /// <summary>
    /// Reglas de propiedad que la granja comparte con el mercado: cada ave pertenece a una sola cuenta, no se puede vender, borrar
    /// ni dar por fallecida mientras esté publicada, y un cambio en su ficha avisa a las publicaciones que la usan.
    /// Escribe en el mismo contexto que la granja: se guarda junto con ella.
    /// </summary>
    public interface IMercadoGuardia
    {
        /// <summary>Registra el ave a nombre de la cuenta. Conflicto si ya está registrada en otra.</summary>
        Task RegistrarAveAsync(Guid usuario, string aveId, DateTime ahoraUtc);
        /// <summary>¿Hay una publicación activa que reserve esta ave?</summary>
        Task<bool> AveEnMercadoAsync(string aveId);
        /// <summary>Tras guardar la granja: marca «necesita revisión» las publicaciones cuya ficha cambió.</summary>
        Task RevisarPublicacionesAsync(Guid usuario, DocumentoGranja granja, DateTime ahoraUtc);
        /// <summary>Deja en la bandeja de salida los eventos que salen de comparar la granja antes y después de un cambio.</summary>
        Task EmitirCambiosAsync(Guid usuario, DocumentoGranja antes, DocumentoGranja despues, long version);
    }

    public class MercadoGuardia : IMercadoGuardia
    {
        private readonly AlmacenMercado _almacen;

        public MercadoGuardia(AlmacenMercado almacen) => _almacen = almacen;

        public async Task RegistrarAveAsync(Guid usuario, string aveId, DateTime ahoraUtc)
        {
            Propiedad? dueno = await _almacen.Propiedades.ObtenerAsync(aveId, true);
            if (dueno is not null)
            {
                if (!string.Equals(dueno.OwnerId, usuario.ToString(), StringComparison.OrdinalIgnoreCase))
                    throw ReglaNegocioException.Conflicto("Esta ave ya está registrada en otra cuenta.");
                return;
            }
            string en = JsonMercado.Iso(ahoraUtc);
            _almacen.Propiedades.Insertar(new Propiedad { Id = aveId, OwnerId = usuario.ToString(), Since = en });
            _almacen.Tramos.Insertar(new TramoDePropiedad { Id = $"{aveId}:{en}", BirdId = aveId, OwnerId = usuario.ToString(), From = en });
        }

        public async Task<bool> AveEnMercadoAsync(string aveId) =>
            (await _almacen.Bloqueos.ListarAsync(("birdId", aveId), ("status", "active"))).Count > 0;

        public async Task EmitirCambiosAsync(Guid usuario, DocumentoGranja antes, DocumentoGranja despues, long version)
        {
            foreach (PlanDeRecordatorio plan in ReglasNotificaciones.CambiosDeGranja(antes, despues, usuario.ToString(), version))
                await _almacen.EmitirAsync(plan.Type, plan.AggregateType, plan.AggregateId, plan.Payload, $"{plan.DedupeKey}:{usuario}");
        }

        public async Task RevisarPublicacionesAsync(Guid usuario, DocumentoGranja granja, DateTime ahoraUtc)
        {
            foreach (Publicacion p in await _almacen.Publicaciones.ListarAsync("sellerId", usuario.ToString()))
            {
                // La huella de lotes e insumos también detecta cambios en su disponibilidad o ficha.
                if (!EstadoPublicacion.Editables.Contains(p.Status) || p.NeedsReview || p.Tipo is not (TipoPublicacion.Ave or TipoPublicacion.LoteAves or TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo)) continue;
                string? actual = ReglasMercado.HuellaPublicacion(granja, p.Tipo, p.Elementos);
                if (actual == p.SourceHash) continue;
                p.NeedsReview = true;
                p.UpdatedAt = JsonMercado.Iso(ahoraUtc);
                p.Version += 1;
                _almacen.Publicaciones.Actualizar(p);
                await _almacen.EmitirAsync("market.listing.needs_review", "listing", p.Id, new { listingId = p.Id }, $"review:{p.Id}:{actual ?? "sin-ave"}");
            }
        }
    }
}
