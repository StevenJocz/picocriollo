using System.Globalization;
using System.Text;
using System.Text.Json;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Entities.UsuarioE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Queries
{
    public class FiltroMercado
    {
        public string? Q { get; set; }
        public string? Type { get; set; }
        public string? Breed { get; set; }
        public string? Species { get; set; }
        public string? Sex { get; set; }
        public string? Kind { get; set; }
        public long? Min { get; set; }
        public long? Max { get; set; }
        public int? Limit { get; set; }
        public int? Offset { get; set; }
    }

    public interface IMercadoQueries
    {
        Task<ListadoMercadoDto> ExplorarAsync(FiltroMercado filtro, Guid? quienMira);
        Task<DetallePublicacionDto> DetalleAsync(string id, Guid? quienMira);
        Task<List<MiPublicacionDto>> MisPublicacionesAsync(Guid usuario, string? filtro);
        Task<List<InteresadoDto>> InteresadosAsync(Guid usuario, string publicacionId);
        Task<List<MiOfertaDto>> MisOfertasAsync(Guid usuario);
        Task<List<OperacionVistaDto>> OperacionesAsync(Guid usuario, string? rol);
        Task<ContactoDto> ContactoAsync(Guid usuario, string operacionId);
        Task<List<ResumenConversacionDto>> ConversacionesAsync(Guid usuario);
        Task<ConversacionDto> ConversacionAsync(Guid usuario, string id);
        Task<ComprobanteDto> ComprobanteAsync(Guid usuario, string codigo);
        Task<List<ResumenFacturaDto>> FacturasAsync(Guid usuario, string? rol);
        Task<FacturaDto> FacturaAsync(Guid usuario, string numero);
        Task<ProcedenciaDto> ProcedenciaAsync(Guid usuario, string aveId);
        Task<ReputacionPublicaDto> ReputacionAsync(string vendedorId);
        /// <summary>La vista pública de varias publicaciones (para el feed de reels).</summary>
        Task<List<PublicacionVistaDto>> VistasPublicasAsync(List<Publicacion> filas);
    }

    public class MercadoQueries : IMercadoQueries
    {
        private readonly AlmacenMercado _a;

        public MercadoQueries(AlmacenMercado almacen) => _a = almacen;

        // ---------- publicaciones ----------

        public async Task<ListadoMercadoDto> ExplorarAsync(FiltroMercado f, Guid? quienMira)
        {
            string aguja = Plegar(f.Q ?? string.Empty);
            List<Publicacion> filas = (await _a.Publicaciones.ListarAsync("status", EstadoPublicacion.Publicada))
                .Where(p => string.IsNullOrEmpty(f.Kind) || p.Kind == f.Kind)
                .Where(p => string.IsNullOrEmpty(f.Type) || p.Tipo == f.Type)
                .Where(p => string.IsNullOrEmpty(f.Breed) || p.Snapshot.Breed == f.Breed)
                .Where(p => string.IsNullOrEmpty(f.Species) || (p.Tipo != TipoPublicacion.Insumo && ReglasMercado.Especie(p.Snapshot.Species) == f.Species))
                .Where(p => string.IsNullOrEmpty(f.Sex) || p.Snapshot.Sex == f.Sex)
                .Where(p => f.Min is null || p.Price >= f.Min)
                .Where(p => f.Max is null || p.Price <= f.Max)
                .Where(p => aguja.Length == 0 || Plegar($"{p.Snapshot.Name} {p.Snapshot.Title} {p.Snapshot.Breed} {p.Snapshot.Species} {p.Snapshot.Code} {p.Snapshot.Description}").Contains(aguja))
                .OrderByDescending(p => p.PublishedAt ?? string.Empty, StringComparer.Ordinal).ToList();

            // Lo de mi ciudad y mi departamento sale primero; dentro de cada grupo se conserva «más nuevo primero».
            if (quienMira is { } yo && await _a.UsuarioAsync(yo.ToString()) is { } persona && LugarDe(persona) is { Ciudad.Length: > 0 } lugar)
            {
                var cercania = new Dictionary<string, int>();
                foreach (string vendedor in filas.Select(p => p.SellerId).Distinct())
                {
                    var vend = await _a.UsuarioAsync(vendedor);
                    var otro = vend is null ? null : LugarDe(vend);
                    cercania[vendedor] = otro is null || otro.Value.Ciudad.Length == 0 ? 2 : Plegar(otro.Value.Ciudad) == Plegar(lugar.Ciudad) ? 0
                        : lugar.Region.Length > 0 && Plegar(otro.Value.Region) == Plegar(lugar.Region) ? 1 : 2;
                }
                filas = filas.OrderBy(p => cercania[p.SellerId]).ToList();
            }
            int limite = Math.Clamp(f.Limit ?? 24, 1, 60), desde = Math.Max(f.Offset ?? 0, 0);
            return new ListadoMercadoDto { Items = await VistasAsync(filas.Skip(desde).Take(limite).ToList()), Total = filas.Count };
        }

        public async Task<DetallePublicacionDto> DetalleAsync(string id, Guid? quienMira)
        {
            string? yo = quienMira?.ToString();
            Publicacion p = await _a.Publicaciones.ObtenerAsync(id) ?? throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
            bool dueno = yo == p.SellerId;
            if (!dueno && p.Status != EstadoPublicacion.Publicada) throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
            List<Oferta> ofertas = p.Kind == TipoPublicacion.Subasta ? await _a.Ofertas.ListarAsync("listingId", id) : [];
            EstadoDeSubasta? estado = ReglasMercado.EstadoSubasta(p, ofertas, _a.Ahora);
            bool interes = yo is not null && !dueno && (await _a.Intereses.ListarAsync(("listingId", id), ("userId", yo))).Any(i => i.Status == "activo");
            Operacion? op = yo is null || dueno ? null : (await _a.Operaciones.ListarAsync("listingId", id)).FirstOrDefault(o => o.BuyerId == yo && o.Status is not (EstadoOperacion.Cancelada or EstadoOperacion.Completada));
            string? hilo = yo is null || dueno ? null : (await _a.Conversaciones.ListarAsync("listingId", id)).FirstOrDefault(c => c.Participants.Contains(yo))?.Id;
            Oferta? mejor = ReglasMercado.Mejor(ofertas);
            return new DetallePublicacionDto
            {
                Listing = (await VistasAsync([p]))[0],
                Bids = ofertas.OrderByDescending(o => o.Seq).Select(o => SubastaCommands.Publica(o, yo ?? string.Empty, ofertas)).ToList(),
                Viewer = new QuienMiraDto { IsOwner = dueno, HasInterest = interes, IsTopBidder = yo is not null && mejor?.BidderId == yo, OperationId = op?.Id, OperationStatus = op?.Status, ThreadId = hilo },
            };
        }

        public async Task<List<MiPublicacionDto>> MisPublicacionesAsync(Guid usuario, string? filtro)
        {
            string yo = usuario.ToString();
            var salida = new List<MiPublicacionDto>();
            string alias = await _a.AliasAsync(yo);
            foreach (Publicacion p in (await _a.Publicaciones.ListarAsync("sellerId", yo)).OrderByDescending(p => p.UpdatedAt, StringComparer.Ordinal))
            {
                int interesados = (await _a.Intereses.ListarAsync("listingId", p.Id)).Count(i => i.Status == "activo");
                List<Oferta> ofertas = p.Kind == TipoPublicacion.Subasta ? await _a.Ofertas.ListarAsync("listingId", p.Id) : [];
                List<Operacion> ops = await _a.Operaciones.ListarAsync("listingId", p.Id);
                Operacion? activa = ops.FirstOrDefault(o => o.Status is not (EstadoOperacion.Solicitud or EstadoOperacion.Cancelada or EstadoOperacion.Completada));
                var vista = Vista<MiPublicacionDto>(p, alias, ReglasMercado.EstadoSubasta(p, ofertas, _a.Ahora), null);
                vista.BirdId = p.BirdId; vista.NeedsReview = p.NeedsReview; vista.InterestCount = interesados; vista.Version = p.Version; vista.ClosedReason = p.ClosedReason;
                vista.PendingRequests = ops.Count(o => o.Status == EstadoOperacion.Solicitud);
                vista.OperationStatus = activa?.Status; vista.OperationId = activa?.Id;
                salida.Add(vista);
            }
            DateTime limite = _a.Ahora.AddHours(24);
            return filtro switch
            {
                null or "" or "todas" => salida,
                "con_interesados" => salida.Where(r => r.Status == EstadoPublicacion.Publicada && r.InterestCount > 0).ToList(),
                "con_ofertas" => salida.Where(r => r.Kind == TipoPublicacion.Subasta && r.Status == EstadoPublicacion.Publicada && (r.Auction?.BidCount ?? 0) > 0).ToList(),
                "por_cerrar" => salida.Where(r => r.Kind == TipoPublicacion.Subasta && r.Status == EstadoPublicacion.Publicada && r.ClosesAt is not null && JsonMercado.Fecha(r.ClosesAt) <= limite && JsonMercado.Fecha(r.ClosesAt) > _a.Ahora).ToList(),
                "pendiente_confirmar" => salida.Where(r => r.PendingRequests > 0 || r.OperationStatus == EstadoOperacion.Aceptada).ToList(),
                "pendiente_pago" => salida.Where(r => r.OperationStatus is EstadoOperacion.PagoPendiente or EstadoOperacion.PagoRegistrado).ToList(),
                "pendiente_entrega" => salida.Where(r => r.OperationStatus is EstadoOperacion.EntregaPendiente or EstadoOperacion.EntregaConfirmada).ToList(),
                "requieren_revision" => salida.Where(r => r.NeedsReview).ToList(),
                "retirada" => salida.Where(r => r.Status is EstadoPublicacion.Retirada or EstadoPublicacion.Cancelada or EstadoPublicacion.Rechazada or EstadoPublicacion.CerradaSinOfertas).ToList(),
                _ => salida.Where(r => r.Status == filtro).ToList(),
            };
        }

        public async Task<List<InteresadoDto>> InteresadosAsync(Guid usuario, string publicacionId)
        {
            Publicacion p = await _a.Publicaciones.ObtenerAsync(publicacionId) ?? throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
            if (p.SellerId != usuario.ToString()) throw ReglaNegocioException.Prohibido("Esta publicación no es tuya.");
            var salida = new List<InteresadoDto>();
            foreach (Interes i in (await _a.Intereses.ListarAsync("listingId", publicacionId)).Where(i => i.Status == "activo").OrderByDescending(i => i.CreatedAt, StringComparer.Ordinal))
                salida.Add(new InteresadoDto { Id = i.Id, UserId = i.UserId, Alias = await _a.AliasAsync(i.UserId), Message = i.Message, CreatedAt = i.CreatedAt });
            return salida;
        }

        public async Task<List<MiOfertaDto>> MisOfertasAsync(Guid usuario)
        {
            string yo = usuario.ToString();
            var salida = new List<MiOfertaDto>();
            foreach (var grupo in (await _a.Ofertas.ListarAsync("bidderId", yo)).GroupBy(o => o.ListingId))
            {
                Publicacion? p = await _a.Publicaciones.ObtenerAsync(grupo.Key);
                if (p is null) continue;
                List<Oferta> todas = await _a.Ofertas.ListarAsync("listingId", grupo.Key);
                EstadoDeSubasta estado = ReglasMercado.EstadoSubasta(p, todas, _a.Ahora)!;
                Oferta mejor = grupo.OrderByDescending(o => o.Amount).First();
                salida.Add(new MiOfertaDto
                {
                    ListingId = p.Id, BirdName = p.Snapshot.Name, BirdCode = p.Snapshot.Code, SellerAlias = await _a.AliasAsync(p.SellerId), ClosesAt = p.ClosesAt, ListingStatus = p.Status,
                    MyBest = mejor.Amount, CurrentPrice = estado.CurrentPrice, Phase = estado.Phase,
                    Result = mejor.Status == "ganadora" ? "ganadora" : p.Status == EstadoPublicacion.Publicada ? (grupo.Any(o => o.Status == "valida") ? "liderando" : "superada") : "no_ganadora",
                    Cancelled = p.Status == EstadoPublicacion.Cancelada ? true : null,
                });
            }
            return salida.OrderByDescending(o => o.ClosesAt ?? string.Empty, StringComparer.Ordinal).ToList();
        }

        // ---------- operaciones ----------

        public async Task<List<OperacionVistaDto>> OperacionesAsync(Guid usuario, string? rol)
        {
            string yo = usuario.ToString();
            var filas = new List<Operacion>();
            if (rol != "vendedor") filas.AddRange(await _a.Operaciones.ListarAsync("buyerId", yo));
            if (rol != "comprador") filas.AddRange(await _a.Operaciones.ListarAsync("sellerId", yo));
            var salida = new List<OperacionVistaDto>();
            foreach (Operacion op in filas.DistinctBy(o => o.Id).OrderByDescending(o => o.UpdatedAt, StringComparer.Ordinal))
            {
                Publicacion? p = await _a.Publicaciones.ObtenerAsync(op.ListingId);
                string otro = op.BuyerId == yo ? op.SellerId : op.BuyerId;
                Conversacion? hilo = (await _a.Conversaciones.ListarAsync("listingId", op.ListingId)).FirstOrDefault(c => c.Participants.Contains(op.BuyerId));
                Comprobante? comprobante = (await _a.Comprobantes.ListarAsync("operationId", op.Id)).FirstOrDefault();
                Factura? factura = (await _a.Facturas.ListarAsync("operationId", op.Id)).FirstOrDefault();
                bool soyComprador = op.BuyerId == yo;
                salida.Add(new OperacionVistaDto
                {
                    Id = op.Id, ListingId = op.ListingId, Status = op.Status, Origin = op.Origin, Price = op.Price, Role = soyComprador ? "comprador" : "vendedor",
                    BirdName = p?.Snapshot.Name ?? "Ave", BirdCode = p?.Snapshot.Code ?? string.Empty, Counterpart = await _a.AliasAsync(otro), CounterpartId = otro,
                    CreatedAt = op.CreatedAt, UpdatedAt = op.UpdatedAt, CancelReason = op.CancelReason,
                    History = op.History.Select(h => new PasoVistaDto { At = h.At, Status = h.Status, Note = h.Note }).ToList(),
                    ThreadId = hilo?.Id, ReceiptCode = comprobante?.Code, InvoiceNumber = factura?.Number, PaymentMethod = op.PaymentMethod,
                    Rating = await EstadoValoracionAsync(op, yo),
                    ContactShared = new ContactoCompartidoDto { Mine = soyComprador ? op.ShareContact.Buyer : op.ShareContact.Seller, Theirs = soyComprador ? op.ShareContact.Seller : op.ShareContact.Buyer },
                });
            }
            return salida;
        }

        /// <summary>La valoración de la otra parte se muestra solo cuando ya valoraste o cuando venció el plazo (evita represalias).</summary>
        private async Task<EstadoValoracionDto> EstadoValoracionAsync(Operacion op, string yo)
        {
            if (op.Status != EstadoOperacion.Completada) return new EstadoValoracionDto();
            List<Valoracion> filas = await _a.Valoraciones.ListarAsync("operationId", op.Id);
            Valoracion? mia = filas.FirstOrDefault(v => v.RaterId == yo), suya = filas.FirstOrDefault(v => v.RaterId != yo);
            string? cerrada = ReglasMercado.CompletadaEn(op);
            bool abierta = cerrada is not null && _a.Ahora - JsonMercado.Fecha(cerrada) <= ReglasMercado.PlazoValoracion;
            return new EstadoValoracionDto
            {
                CanRate = abierta && mia is null,
                Mine = mia is null ? null : new ValoracionVistaDto { Stars = mia.Stars, Comment = mia.Comment },
                Theirs = suya is not null && (mia is not null || !abierta) ? new ValoracionVistaDto { Stars = suya.Stars, Comment = suya.Comment } : null,
            };
        }

        public async Task<ContactoDto> ContactoAsync(Guid usuario, string operacionId)
        {
            string yo = usuario.ToString();
            Operacion op = await _a.Operaciones.ObtenerAsync(operacionId) ?? throw ReglaNegocioException.NoEncontrado("Operación no encontrada.");
            if (op.BuyerId != yo && op.SellerId != yo) throw ReglaNegocioException.Prohibido("Esta operación no es tuya.");
            if (op.Status is not (EstadoOperacion.PagoPendiente or EstadoOperacion.PagoRegistrado or EstadoOperacion.EntregaPendiente or EstadoOperacion.EntregaConfirmada))
                throw ReglaNegocioException.Conflicto("El contacto solo está disponible mientras la operación está en curso.");
            if (!op.ShareContact.Buyer || !op.ShareContact.Seller) throw ReglaNegocioException.Prohibido("El contacto se revela cuando ambas partes lo autorizan.");
            string otroId = op.BuyerId == yo ? op.SellerId : op.BuyerId;
            UsuarioE otro = (await _a.UsuarioAsync(otroId))!;
            return new ContactoDto { Alias = ReglasMercado.Alias(otroId, otro.NombreUsuario), Email = otro.Correo, Phone = TextoDelPerfil(otro, "contactPhone") };
        }

        private static string? TextoDelPerfil(UsuarioE u, string campo)
        {
            try
            {
                using JsonDocument d = JsonDocument.Parse(string.IsNullOrWhiteSpace(u.Perfil) ? "{}" : u.Perfil);
                return d.RootElement.TryGetProperty(campo, out JsonElement e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;
            }
            catch (JsonException) { return null; }
        }

        // ---------- mensajes ----------

        public async Task<List<ResumenConversacionDto>> ConversacionesAsync(Guid usuario)
        {
            string yo = usuario.ToString();
            var salida = new List<ResumenConversacionDto>();
            foreach (Conversacion c in (await _a.Conversaciones.ListarAsync()).Where(c => c.Participants.Contains(yo)))
            {
                Mensaje? ultimo = (await _a.Mensajes.ListarAsync("threadId", c.Id)).Where(m => m.Hidden != true).OrderByDescending(m => m.CreatedAt, StringComparer.Ordinal).FirstOrDefault();
                if (ultimo is null) continue;
                Publicacion? p = await _a.Publicaciones.ObtenerAsync(c.ListingId);
                string otro = c.Participants.First(id => id != yo);
                salida.Add(new ResumenConversacionDto
                {
                    Id = c.Id, ListingId = c.ListingId, ListingName = p?.Snapshot.Name ?? "Publicación", Counterpart = await _a.AliasAsync(otro),
                    Role = p?.SellerId == yo ? "vendedor" : "comprador", OperationId = c.OperationId, LastMessage = ultimo.Body.Length > 140 ? ultimo.Body[..140] : ultimo.Body, LastAt = ultimo.CreatedAt,
                });
            }
            return salida.OrderByDescending(c => c.LastAt, StringComparer.Ordinal).ToList();
        }

        public async Task<ConversacionDto> ConversacionAsync(Guid usuario, string id)
        {
            string yo = usuario.ToString();
            Conversacion c = await _a.Conversaciones.ObtenerAsync(id) ?? throw ReglaNegocioException.NoEncontrado("Conversación no encontrada.");
            if (!c.Participants.Contains(yo)) throw ReglaNegocioException.Prohibido("Esta conversación no es tuya.");
            Publicacion? p = await _a.Publicaciones.ObtenerAsync(c.ListingId);
            var alias = new Dictionary<string, string>();
            foreach (string par in c.Participants) alias[par] = await _a.AliasAsync(par);
            string otro = c.Participants.FirstOrDefault(x => x != yo) ?? yo;
            return new ConversacionDto
            {
                Id = c.Id, ListingId = c.ListingId, ListingName = p?.Snapshot.Name ?? "Publicación", OperationId = c.OperationId, Counterpart = alias[otro],
                Messages = (await _a.Mensajes.ListarAsync("threadId", id)).Where(m => m.Hidden != true).OrderBy(m => m.CreatedAt, StringComparer.Ordinal)
                    .Select(m => new MensajeVistaDto { Id = m.Id, Mine = m.SenderId == yo, Author = alias.GetValueOrDefault(m.SenderId, "Usuario"), Body = m.Body, CreatedAt = m.CreatedAt }).ToList(),
            };
        }

        // ---------- comprobantes, facturas y procedencia ----------

        public async Task<ComprobanteDto> ComprobanteAsync(Guid usuario, string codigo)
        {
            string yo = usuario.ToString();
            Comprobante c = (await _a.Comprobantes.ListarAsync("code", codigo)).FirstOrDefault() ?? throw ReglaNegocioException.NoEncontrado("Comprobante no encontrado.");
            if (c.SellerId != yo && c.BuyerId != yo) throw ReglaNegocioException.Prohibido("Este comprobante no es tuyo.");
            return new ComprobanteDto
            {
                Code = c.Code, BirdName = c.BirdName, BirdCode = c.BirdCode, Ring = c.Ring, SellerAlias = c.SellerAlias, BuyerAlias = c.BuyerAlias, Price = c.Price,
                TransferredAt = c.TransferredAt, Hash = c.Hash, Integrity = OperacionCommands.HuellaComprobante(c) == c.Hash, Role = c.SellerId == yo ? "vendedor" : "comprador",
            };
        }

        public async Task<List<ResumenFacturaDto>> FacturasAsync(Guid usuario, string? rol)
        {
            string yo = usuario.ToString();
            var filas = new List<Factura>();
            if (rol != "vendedor") filas.AddRange(await _a.Facturas.ListarAsync("buyerId", yo));
            if (rol != "comprador") filas.AddRange(await _a.Facturas.ListarAsync("sellerId", yo));
            return filas.DistinctBy(f => f.Id).OrderByDescending(f => f.IssuedAt, StringComparer.Ordinal).Select(f => new ResumenFacturaDto
            {
                Number = f.Number, IssuedAt = f.IssuedAt, Title = f.Lines.FirstOrDefault()?.Description ?? "Venta", Total = f.Total, OperationId = f.OperationId,
                Role = f.BuyerId == yo ? "comprador" : "vendedor", Counterpart = f.BuyerId == yo ? f.SellerAlias : f.BuyerAlias,
            }).ToList();
        }

        public async Task<FacturaDto> FacturaAsync(Guid usuario, string numero)
        {
            string yo = usuario.ToString();
            Factura f = (await _a.Facturas.ListarAsync("number", numero)).FirstOrDefault() ?? throw ReglaNegocioException.NoEncontrado("Factura no encontrada.");
            if (f.BuyerId != yo && f.SellerId != yo) throw ReglaNegocioException.Prohibido("Esta factura no es tuya.");
            return new FacturaDto
            {
                Number = f.Number, OperationId = f.OperationId, ReceiptCode = f.ReceiptCode, SellerAlias = f.SellerAlias, BuyerAlias = f.BuyerAlias, Lines = f.Lines, Subtotal = f.Subtotal,
                Total = f.Total, Currency = f.Currency, PaymentMethod = f.PaymentMethod, PaymentDeclaredAt = f.PaymentDeclaredAt, PaymentConfirmedAt = f.PaymentConfirmedAt,
                DeliveredAt = f.DeliveredAt, ReceivedAt = f.ReceivedAt, IssuedAt = f.IssuedAt, Hash = f.Hash, Role = f.BuyerId == yo ? "comprador" : "vendedor",
                Integrity = OperacionCommands.HuellaFactura(f) == f.Hash,
            };
        }

        /// <summary>Quién fue propietario de un ave y cuándo. Solo para quienes lo han sido.</summary>
        public async Task<ProcedenciaDto> ProcedenciaAsync(Guid usuario, string aveId)
        {
            string yo = usuario.ToString();
            List<TramoDePropiedad> tramos = (await _a.Tramos.ListarAsync("birdId", aveId)).OrderBy(t => t.From, StringComparer.Ordinal).ToList();
            if (!tramos.Any(t => t.OwnerId == yo)) throw ReglaNegocioException.Prohibido("Solo quienes han sido propietarios del ave ven su procedencia.");
            var duenos = new List<DuenoDto>();
            foreach (TramoDePropiedad t in tramos)
                duenos.Add(new DuenoDto { Alias = await _a.AliasAsync(t.OwnerId), From = t.From, To = t.To, Mine = t.OwnerId == yo, ViaOperation = t.OperationId is not null });
            Pasaporte? pasaporte = (await _a.Pasaportes.ListarAsync("birdId", aveId)).FirstOrDefault();
            return new ProcedenciaDto { BirdId = aveId, Owners = duenos, PassportCode = pasaporte?.Code, OriginRing = pasaporte?.OriginRing };
        }

        public async Task<ReputacionPublicaDto> ReputacionAsync(string vendedorId)
        {
            if (await _a.UsuarioAsync(vendedorId) is null) throw ReglaNegocioException.NoEncontrado("Criador no encontrado.");
            Reputacion r = await ReputacionVendedorAsync(vendedorId);
            return new ReputacionPublicaDto { Alias = await _a.AliasAsync(vendedorId), Count = r.Count, Average = r.Average, Completed = r.Completed, Distribution = r.Distribution };
        }

        // ---------- apoyo ----------

        /// <summary>Reputación como vendedor: valoraciones de compradores sobre ventas realmente completadas.</summary>
        private async Task<Reputacion> ReputacionVendedorAsync(string vendedorId)
        {
            List<Operacion> hechas = (await _a.Operaciones.ListarAsync("sellerId", vendedorId)).Where(o => o.Status == EstadoOperacion.Completada).ToList();
            var ids = hechas.Select(o => o.Id).ToHashSet();
            List<Valoracion> valoraciones = (await _a.Valoraciones.ListarAsync("rateeId", vendedorId)).Where(v => ids.Contains(v.OperationId)).ToList();
            return ReglasMercado.Reputacion(valoraciones, hechas.Count);
        }

        public Task<List<PublicacionVistaDto>> VistasPublicasAsync(List<Publicacion> filas) => VistasAsync(filas);

        private async Task<List<PublicacionVistaDto>> VistasAsync(List<Publicacion> filas)
        {
            var alias = new Dictionary<string, string>();
            var reputacion = new Dictionary<string, Reputacion>();
            var salida = new List<PublicacionVistaDto>();
            foreach (Publicacion p in filas)
            {
                if (!alias.ContainsKey(p.SellerId)) { alias[p.SellerId] = await _a.AliasAsync(p.SellerId); reputacion[p.SellerId] = await ReputacionVendedorAsync(p.SellerId); }
                List<Oferta> ofertas = p.Kind == TipoPublicacion.Subasta ? await _a.Ofertas.ListarAsync("listingId", p.Id) : [];
                salida.Add(Vista<PublicacionVistaDto>(p, alias[p.SellerId], ReglasMercado.EstadoSubasta(p, ofertas, _a.Ahora), reputacion[p.SellerId]));
            }
            return salida;
        }

        private static T Vista<T>(Publicacion p, string alias, EstadoDeSubasta? estado, Reputacion? reputacion) where T : PublicacionVistaDto, new()
        {
            // La ficha pública no lleva los ids de archivos (la API todavía no sirve archivos): solo el enlace de la foto, si hay.
            FichaPublica ficha = JsonSerializer.Deserialize<FichaPublica>(JsonSerializer.Serialize(p.Snapshot, JsonMercado.Opciones), JsonMercado.Opciones)!;
            ficha.PhotoId = null; ficha.PhotoIds = null;
            return new T
            {
                Id = p.Id, SellerId = p.SellerId, Kind = p.Kind, Status = p.Status, Price = p.Price, Currency = p.Currency, Terms = p.Terms, Snapshot = ficha, SellerAlias = alias,
                PublishedAt = p.PublishedAt, OpensAt = p.OpensAt, ClosesAt = p.ClosesAt,
                Auction = estado is null || p.Auction is null ? null : new SubastaVistaDto
                {
                    Phase = estado.Phase, CurrentPrice = estado.CurrentPrice, StartingPrice = estado.StartingPrice, BidCount = estado.BidCount, MinNextBid = estado.MinNextBid,
                    MinIncrement = p.Auction.MinIncrement, HasReserve = p.Auction.ReservePrice is not null, AntiSniping = p.Auction.AntiSniping is not null,
                },
                SellerReputation = reputacion is null ? null : new ReputacionDto { Count = reputacion.Count, Average = reputacion.Average, Completed = reputacion.Completed },
            };
        }

        private static (string Ciudad, string Region)? LugarDe(UsuarioE u)
        {
            try
            {
                using JsonDocument d = JsonDocument.Parse(string.IsNullOrWhiteSpace(u.Perfil) ? "{}" : u.Perfil);
                if (!d.RootElement.TryGetProperty("location", out JsonElement l) || l.ValueKind != JsonValueKind.Object) return null;
                string Texto(string k) => l.TryGetProperty(k, out JsonElement e) && e.ValueKind == JsonValueKind.String ? e.GetString() ?? string.Empty : string.Empty;
                return (Texto("city"), Texto("region"));
            }
            catch (JsonException) { return null; }
        }

        /// <summary>Minúsculas y sin tildes: «Medellín» y «medellin» son lo mismo al buscar.</summary>
        private static string Plegar(string texto)
        {
            string normal = texto.Trim().ToLower(new CultureInfo("es-CO")).Normalize(NormalizationForm.FormD);
            return new string(normal.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray());
        }
    }
}
