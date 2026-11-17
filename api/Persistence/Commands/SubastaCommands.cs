using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Commands
{
    public interface ISubastaCommands
    {
        Task<OfertaPublicaDto> OfertarAsync(Guid usuario, string publicacionId, OfertaDto dto);
        Task<PublicacionGuardadaDto> CancelarAsync(Guid usuario, string publicacionId, MotivoDto dto);
        /// <summary>Cierra las subastas vencidas y avisa de las que están por cerrar. Idempotente.</summary>
        Task<CierreDto> CerrarVencidasAsync();
    }

    /// <summary>
    /// Subastas: ofertas vinculantes (no son un pago), cierre con adjudicación y cancelación con reglas.
    /// La oferta toma la fila de la publicación con FOR UPDATE: dos ofertas simultáneas se ordenan, nunca se pisan.
    /// </summary>
    public class SubastaCommands : ISubastaCommands
    {
        private static readonly TimeSpan AvisoDeCierre = TimeSpan.FromHours(2);

        private readonly AlmacenMercado _a;

        public SubastaCommands(AlmacenMercado almacen) => _a = almacen;

        public Task<OfertaPublicaDto> OfertarAsync(Guid usuario, string publicacionId, OfertaDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            if (dto.Amount <= 0 || dto.Amount > ReglasMercado.PrecioMaximo) throw ReglaNegocioException.Validacion("Indica un importe válido en pesos colombianos.");
            await _a.AsegurarActivaAsync(yo);
            Publicacion p = await _a.Publicaciones.ObtenerAsync(publicacionId, true) is { Kind: TipoPublicacion.Subasta, Auction: not null } s ? s : throw ReglaNegocioException.NoEncontrado("Subasta no encontrada.");
            if (p.SellerId == yo) throw ReglaNegocioException.Prohibido("No puedes ofertar en tu propia subasta.");

            Oferta? repetida = (await _a.Ofertas.ListarAsync(("listingId", publicacionId), ("bidderId", yo), ("idempotencyKey", dto.IdempotencyKey))).FirstOrDefault();
            if (repetida is not null) return Publica(repetida, yo, [repetida]);

            if (p.Status != EstadoPublicacion.Publicada) throw ReglaNegocioException.Conflicto("Esta subasta ya no admite ofertas.");
            await _a.LimitarUsoAsync(yo, "auction.bid", 30, TimeSpan.FromHours(1), "ofertas por hora");
            DateTime ahora = _a.Ahora;
            if (p.OpensAt is not null && ahora < JsonMercado.Fecha(p.OpensAt)) throw ReglaNegocioException.Conflicto("La subasta aún no ha abierto.");
            if (p.ClosesAt is not null && ahora >= JsonMercado.Fecha(p.ClosesAt)) throw ReglaNegocioException.Conflicto("La subasta ya cerró: no se aceptan ofertas nuevas.");

            List<Oferta> ofertas = await _a.Ofertas.ListarAsync("listingId", publicacionId);
            Oferta? mejor = ReglasMercado.Mejor(ofertas);
            if (mejor?.BidderId == yo) throw ReglaNegocioException.Conflicto("Ya tienes la oferta más alta.");
            long minimo = ReglasMercado.EstadoSubasta(p, ofertas, ahora)!.MinNextBid;
            if (dto.Amount < minimo) throw ReglaNegocioException.Validacion($"Tu oferta debe ser de al menos {ReglasMercado.Pesos(minimo)} COP.");

            var oferta = new Oferta
            {
                Id = Guid.NewGuid().ToString(), ListingId = publicacionId, BidderId = yo, Amount = dto.Amount, Seq = ofertas.Count + 1,
                IdempotencyKey = dto.IdempotencyKey, Status = "valida", PlacedAt = JsonMercado.Iso(ahora),
            };
            _a.Ofertas.Insertar(oferta);
            if (mejor is not null) { mejor.Status = "superada"; _a.Ofertas.Actualizar(mejor); }

            // Anti-francotirador: una oferta en los últimos minutos alarga el cierre (hasta 12 veces).
            AntiSniping? regla = p.Auction.AntiSniping;
            if (regla is not null && p.ClosesAt is not null && (JsonMercado.Fecha(p.ClosesAt) - ahora).TotalSeconds <= regla.WindowSeconds && (p.Extensions ?? 0) < ReglasMercado.MaximoExtensiones)
            {
                p.ClosesAt = JsonMercado.Iso(JsonMercado.Fecha(p.ClosesAt).AddSeconds(regla.ExtendSeconds));
                p.Extensions = (p.Extensions ?? 0) + 1;
                p.UpdatedAt = JsonMercado.Iso(ahora);
                p.Version += 1;
                _a.Publicaciones.Actualizar(p);
            }
            _a.Auditar(yo, "auction.bid", "listing", publicacionId, new { bidId = oferta.Id, amount = oferta.Amount });
            await _a.EmitirAsync("market.bid.received", "listing", publicacionId, new { listingId = publicacionId, bidId = oferta.Id }, $"bid-received:{oferta.Id}");
            if (mejor is not null)
                await _a.EmitirAsync("market.bid.outbid", "listing", publicacionId, new { listingId = publicacionId, bidId = oferta.Id, previousBidId = mejor.Id }, $"bid-outbid:{mejor.Id}:{oferta.Id}");
            return Publica(oferta, yo, [.. ofertas, oferta]);
        });

        public Task<PublicacionGuardadaDto> CancelarAsync(Guid usuario, string publicacionId, MotivoDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Publicacion p = await _a.Publicaciones.ObtenerAsync(publicacionId, true) is { Kind: TipoPublicacion.Subasta } s ? s : throw ReglaNegocioException.NoEncontrado("Subasta no encontrada.");
            if (p.SellerId != yo) throw ReglaNegocioException.Prohibido("Esta subasta no es tuya.");
            if (p.Status is not (EstadoPublicacion.Publicada or EstadoPublicacion.Pausada)) throw ReglaNegocioException.Conflicto("Esta subasta ya no se puede cancelar.");
            List<Oferta> ofertas = await _a.Ofertas.ListarAsync("listingId", publicacionId);
            bool conOfertas = ReglasMercado.Validas(ofertas).Any();
            if (conOfertas)
            {
                TimeSpan falta = p.ClosesAt is null ? TimeSpan.Zero : JsonMercado.Fecha(p.ClosesAt) - _a.Ahora;
                if (falta < ReglasMercado.CancelarConOfertasHasta)
                    throw ReglaNegocioException.Conflicto("Con ofertas registradas solo puedes cancelar si faltan más de 24 horas para el cierre. Tras ese plazo la subasta se adjudicará según las reglas.");
            }
            string motivo = conOfertas ? AyudasOperacion.Motivo(dto.Reason) : (dto.Reason ?? string.Empty).Trim();
            if (motivo.Length > 500) motivo = motivo[..500];
            await _a.LiberarAsync(p.Id);
            foreach (Oferta o in ofertas) { o.Status = "no_ganadora"; _a.Ofertas.Actualizar(o); }
            p.Status = EstadoPublicacion.Cancelada;
            p.ClosedReason = motivo.Length > 0 ? motivo : "cancelada_por_el_vendedor";
            p.UpdatedAt = JsonMercado.Iso(_a.Ahora);
            p.Version += 1;
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(yo, "auction.cancel", "listing", p.Id, new { reason = motivo, bids = ofertas.Count });
            if (conOfertas)
                await _a.EmitirAsync("market.auction.cancelled", "listing", p.Id, new { listingId = p.Id, bidderIds = ofertas.Select(o => o.BidderId).Distinct().ToArray(), reason = motivo }, $"auction-cancelled:{p.Id}");
            return new PublicacionGuardadaDto { Id = p.Id, Status = p.Status, Version = p.Version };
        });

        public async Task<CierreDto> CerrarVencidasAsync()
        {
            DateTime ahora = _a.Ahora;
            List<string> vencidas = (await _a.Publicaciones.ListarAsync("status", EstadoPublicacion.Publicada))
                .Where(p => p.Kind == TipoPublicacion.Subasta && p.ClosesAt is not null && JsonMercado.Fecha(p.ClosesAt) <= ahora).Select(p => p.Id).ToList();
            int cerradas = 0;
            foreach (string id in vencidas)
            {
                bool cerro = await _a.EjecutarAsync(async () =>
                {
                    Publicacion? p = await _a.Publicaciones.ObtenerAsync(id, true);
                    if (p is null || p.Status != EstadoPublicacion.Publicada || p.ClosesAt is null || JsonMercado.Fecha(p.ClosesAt) > ahora) return false;
                    await TerminarAsync(p, await _a.Ofertas.ListarAsync("listingId", id));
                    return true;
                });
                if (cerro) cerradas++;
            }
            // Cerca del cierre: la clave incluye la hora de cierre, así que si se extiende se avisa de nuevo.
            int avisadas = await _a.EjecutarAsync(async () =>
            {
                int n = 0;
                foreach (Publicacion p in (await _a.Publicaciones.ListarAsync("status", EstadoPublicacion.Publicada)).Where(p => p.Kind == TipoPublicacion.Subasta && p.ClosesAt is not null))
                {
                    TimeSpan falta = JsonMercado.Fecha(p.ClosesAt!) - ahora;
                    if (falta <= TimeSpan.Zero || falta > AvisoDeCierre) continue;
                    if (await _a.EmitirAsync("market.auction.closing_soon", "listing", p.Id, new { listingId = p.Id, closesAt = p.ClosesAt }, $"auction-closing:{p.Id}:{p.ClosesAt}")) n++;
                }
                return n;
            });
            return new CierreDto { Closed = cerradas, Notified = avisadas };
        }

        /// <summary>Adjudica a la oferta más alta (empate: la más temprana) si alcanza la reserva; si no, cierra sin venta y libera el ave.</summary>
        private async Task TerminarAsync(Publicacion p, List<Oferta> ofertas)
        {
            DateTime ahora = _a.Ahora;
            Oferta? mejor = ReglasMercado.Mejor(ofertas);
            long? reserva = p.Auction?.ReservePrice;
            string[] postores = ofertas.Select(o => o.BidderId).Distinct().ToArray();
            var detalle = new { totalBids = ofertas.Count, topBidId = mejor?.Id, topAmount = mejor?.Amount, reserve = reserva };
            p.UpdatedAt = JsonMercado.Iso(ahora);
            p.Version += 1;

            if (mejor is not null && (reserva is null || mejor.Amount >= reserva))
            {
                foreach (Oferta o in ofertas) { o.Status = o.Id == mejor.Id ? "ganadora" : "no_ganadora"; _a.Ofertas.Actualizar(o); }
                Operacion op = AyudasOperacion.Nueva(_a, p, mejor.BidderId, "subasta", mejor.Amount, EstadoOperacion.Aceptada, p.SellerId);
                AyudasOperacion.Paso(op, EstadoOperacion.PagoPendiente, p.SellerId, ahora, "Pago pendiente");
                _a.Operaciones.Actualizar(op);
                await _a.ReservarAsync(p.Id, op.Id);
                p.Status = EstadoPublicacion.EnOperacion;
                p.WinningBidId = mejor.Id;
                p.ClosedReason = "adjudicada";
                _a.Publicaciones.Actualizar(p);
                _a.Auditar("sistema", "auction.close", "listing", p.Id, new { detalle.totalBids, detalle.topBidId, detalle.topAmount, detalle.reserve, outcome = "adjudicada", operationId = op.Id, rule = "oferta más alta; empate: la más temprana" });
                await _a.EmitirAsync("market.auction.won", "operation", op.Id, new { listingId = p.Id, operationId = op.Id, bidId = mejor.Id }, $"auction-won:{p.Id}:{mejor.Id}");
                await _a.EmitirAsync("market.auction.ended", "listing", p.Id, new { listingId = p.Id, outcome = "sold", operationId = op.Id, amount = mejor.Amount }, $"auction-ended:{p.Id}");
                await _a.EmitirAsync("market.auction.lost", "listing", p.Id, new { listingId = p.Id, bidderIds = postores.Where(id => id != mejor.BidderId).ToArray() }, $"auction-lost:{p.Id}");
                return;
            }

            foreach (Oferta o in ofertas) { o.Status = "no_ganadora"; _a.Ofertas.Actualizar(o); }
            await _a.LiberarAsync(p.Id);
            string resultado = mejor is not null ? "reserve_not_met" : "no_bids";
            p.Status = EstadoPublicacion.CerradaSinOfertas;
            p.ClosedReason = mejor is not null ? "reserva_no_alcanzada" : "sin_ofertas";
            _a.Publicaciones.Actualizar(p);
            _a.Auditar("sistema", "auction.close", "listing", p.Id, new { detalle.totalBids, detalle.topBidId, detalle.topAmount, detalle.reserve, outcome = resultado });
            await _a.EmitirAsync("market.auction.ended", "listing", p.Id, new { listingId = p.Id, outcome = resultado, amount = mejor?.Amount ?? 0 }, $"auction-ended:{p.Id}");
            if (postores.Length > 0)
                await _a.EmitirAsync("market.auction.lost", "listing", p.Id, new { listingId = p.Id, bidderIds = postores, reserveNotMet = mejor is not null }, $"auction-lost:{p.Id}");
        }

        /// <summary>Historial público: cada postor aparece como «Postor 1», «Postor 2»… según su primera oferta, sin identidades.</summary>
        public static OfertaPublicaDto Publica(Oferta oferta, string quienMira, IReadOnlyCollection<Oferta> todas)
        {
            string[] orden = todas.OrderBy(o => o.Seq).Select(o => o.BidderId).Distinct().ToArray();
            return new OfertaPublicaDto { Alias = $"Postor {Array.IndexOf(orden, oferta.BidderId) + 1}", Amount = oferta.Amount, PlacedAt = oferta.PlacedAt, Status = oferta.Status, Mine = oferta.BidderId == quienMira };
        }
    }
}
