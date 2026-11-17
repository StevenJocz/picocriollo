using System.Text.Json;
using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Commands
{
    public interface IOperacionCommands
    {
        Task<OperacionGuardadaDto> SolicitarCompraAsync(Guid usuario, string publicacionId, SolicitudCompraDto dto);
        Task<OperacionGuardadaDto> ResponderAsync(Guid usuario, string id, bool aceptar);
        Task<OperacionGuardadaDto> RetirarSolicitudAsync(Guid usuario, string id);
        Task<OperacionGuardadaDto> DeclararPagoAsync(Guid usuario, string id, PagoDto dto);
        Task<OperacionGuardadaDto> ConfirmarPagoAsync(Guid usuario, string id);
        Task<OperacionGuardadaDto> MarcarEntregaAsync(Guid usuario, string id);
        Task<RecepcionDto> ConfirmarRecepcionAsync(Guid usuario, string id);
        Task<OperacionGuardadaDto> CancelarAsync(Guid usuario, string id, MotivoDto dto);
        Task<OperacionGuardadaDto> DisputarAsync(Guid usuario, string id, MotivoDto dto);
        Task<OperacionGuardadaDto> CompartirContactoAsync(Guid usuario, string id);
        Task ValorarAsync(Guid usuario, string id, ValoracionDto dto);
    }

    /// <summary>
    /// De la solicitud de compra a la transferencia. La plataforma NO procesa ni verifica pagos: el comprador declara que pagó,
    /// el vendedor confirma que recibió y entrega, y al confirmar la recepción el ave pasa a la granja del comprador junto con
    /// el comprobante y la factura, todo en la misma transacción.
    /// </summary>
    public class OperacionCommands : IOperacionCommands
    {
        private static readonly string[] EstadosDeContacto = [EstadoOperacion.PagoPendiente, EstadoOperacion.PagoRegistrado, EstadoOperacion.EntregaPendiente, EstadoOperacion.EntregaConfirmada];

        private readonly AlmacenMercado _a;

        public OperacionCommands(AlmacenMercado almacen) => _a = almacen;

        private static OperacionGuardadaDto Guardada(Operacion o) => new() { Id = o.Id, Status = o.Status, Version = o.Version };

        // ---------- solicitud y respuesta ----------

        /// <summary>Compra directa. No bloquea el ave ni la marca como vendida: espera la decisión del vendedor.</summary>
        public Task<OperacionGuardadaDto> SolicitarCompraAsync(Guid usuario, string publicacionId, SolicitudCompraDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            await _a.AsegurarActivaAsync(yo);
            Publicacion p = await _a.Publicaciones.ObtenerAsync(publicacionId, true) is { Status: EstadoPublicacion.Publicada } publicada ? publicada : throw ReglaNegocioException.NoEncontrado("Esta publicación no está disponible.");
            if (p.SellerId == yo) throw ReglaNegocioException.Prohibido("No puedes comprar tu propia publicación.");
            await _a.LimitarUsoAsync(yo, "operation.request", 10, TimeSpan.FromHours(1), "solicitudes de compra por hora");
            if (p.Kind != TipoPublicacion.PrecioFijo)
                throw ReglaNegocioException.Conflicto(p.Kind == TipoPublicacion.Subasta ? "Esta publicación es una subasta: haz una oferta." : "Esta publicación no tiene precio: contacta al vendedor.");
            if ((await _a.Operaciones.ListarAsync("listingId", p.Id)).Any(o => o.BuyerId == yo && EstadoOperacion.Abiertos.Contains(o.Status)))
                throw ReglaNegocioException.Conflicto("Ya tienes una solicitud abierta para esta publicación.");
            Operacion op = AyudasOperacion.Nueva(_a, p, yo, "directa", p.Price, EstadoOperacion.Solicitud, yo);
            if (!string.IsNullOrWhiteSpace(dto.Message))
            {
                Conversacion hilo = await Hilos.AsegurarAsync(_a, p, yo);
                await Hilos.AgregarAsync(_a, hilo, yo, dto.Message);
            }
            _a.Auditar(yo, "operation.request", "operation", op.Id, new { price = op.Price });
            await _a.EmitirAsync("market.purchase.requested", "operation", op.Id, new { operationId = op.Id }, $"purchase-requested:{op.Id}");
            return Guardada(op);
        });

        /// <summary>El vendedor acepta o rechaza. Al aceptar, el ave queda reservada para esa operación y las demás solicitudes se cierran.</summary>
        public Task<OperacionGuardadaDto> ResponderAsync(Guid usuario, string id, bool aceptar) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Operacion op = await CargarAsync(id);
            if (op.SellerId != yo) throw ReglaNegocioException.Prohibido("Solo el vendedor puede responder esta solicitud.");
            if (op.Status != EstadoOperacion.Solicitud) throw ReglaNegocioException.Conflicto("Esta solicitud ya fue respondida.");
            DateTime ahora = _a.Ahora;
            if (!aceptar)
            {
                op.CancelReason = "Rechazada por el vendedor";
                AyudasOperacion.Paso(op, EstadoOperacion.Cancelada, yo, ahora, op.CancelReason);
                _a.Operaciones.Actualizar(op);
                _a.Auditar(yo, "operation.reject", "operation", op.Id);
                await _a.EmitirAsync("market.purchase.rejected", "operation", op.Id, new { operationId = op.Id }, $"purchase-rejected:{op.Id}");
                return Guardada(op);
            }
            Publicacion p = await _a.Publicaciones.ObtenerAsync(op.ListingId, true) is { Status: EstadoPublicacion.Publicada } publicada ? publicada : throw ReglaNegocioException.Conflicto("La publicación ya no está disponible para aceptar solicitudes.");
            List<Bloqueo> bloqueos = await _a.ActivosAsync(p.Id);
            if (bloqueos.Count == 0 || bloqueos.Any(b => b.OperationId is not null)) throw ReglaNegocioException.Conflicto("El ave ya está comprometida en otra operación.");
            await _a.ReservarAsync(p.Id, op.Id);
            p.Status = EstadoPublicacion.EnOperacion;
            p.UpdatedAt = JsonMercado.Iso(ahora);
            p.Version += 1;
            _a.Publicaciones.Actualizar(p);
            AyudasOperacion.Paso(op, EstadoOperacion.Aceptada, yo, ahora);
            AyudasOperacion.Paso(op, EstadoOperacion.PagoPendiente, yo, ahora, "Pago pendiente");
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.accept", "operation", op.Id, new { price = op.Price });
            await _a.EmitirAsync("market.purchase.accepted", "operation", op.Id, new { operationId = op.Id }, $"purchase-accepted:{op.Id}");
            foreach (Operacion otra in (await _a.Operaciones.ListarAsync("listingId", p.Id)).Where(o => o.Id != op.Id && o.Status == EstadoOperacion.Solicitud))
            {
                otra.CancelReason = "El vendedor aceptó otra solicitud";
                AyudasOperacion.Paso(otra, EstadoOperacion.Cancelada, yo, ahora, otra.CancelReason);
                _a.Operaciones.Actualizar(otra);
                _a.Auditar(yo, "operation.auto_reject", "operation", otra.Id);
                await _a.EmitirAsync("market.purchase.rejected", "operation", otra.Id, new { operationId = otra.Id }, $"purchase-rejected:{otra.Id}");
            }
            return Guardada(op);
        });

        public Task<OperacionGuardadaDto> RetirarSolicitudAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Operacion op = await CargarAsync(id);
            if (op.BuyerId != yo) throw ReglaNegocioException.Prohibido("Esta solicitud no es tuya.");
            if (op.Status != EstadoOperacion.Solicitud) throw ReglaNegocioException.Conflicto("Solo puedes retirar una solicitud pendiente.");
            op.CancelReason = "Retirada por el comprador";
            AyudasOperacion.Paso(op, EstadoOperacion.Cancelada, yo, _a.Ahora, op.CancelReason);
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.withdraw", "operation", op.Id);
            return Guardada(op);
        });

        // ---------- pago, entrega y recepción ----------

        public Task<OperacionGuardadaDto> DeclararPagoAsync(Guid usuario, string id, PagoDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string medio = (dto.Method ?? string.Empty).Trim();
            if (medio.Length is < 2 or > 60) throw ReglaNegocioException.Validacion("Indica el medio de pago usado (2 a 60 caracteres).");
            Operacion op = await CargarAsync(id);
            ExigirRol(op, yo, "comprador", "Solo el comprador declara el pago.");
            ExigirEstado(op, "Esta operación no está esperando un pago.", EstadoOperacion.PagoPendiente);
            op.PaymentMethod = medio;
            op.PaymentDeclaredAt = JsonMercado.Iso(_a.Ahora);
            AyudasOperacion.Paso(op, EstadoOperacion.PagoRegistrado, yo, _a.Ahora, $"Pago declarado por el comprador ({medio}); sin verificar por la plataforma");
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.payment_declared", "operation", op.Id, new { method = medio });
            await _a.EmitirAsync("market.operation.payment_declared", "operation", op.Id, new { operationId = op.Id }, $"payment-declared:{op.Id}:{op.Version}");
            return Guardada(op);
        });

        public Task<OperacionGuardadaDto> ConfirmarPagoAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Operacion op = await CargarAsync(id);
            ExigirRol(op, yo, "vendedor", "Solo el vendedor confirma que recibió el pago.");
            ExigirEstado(op, "Esta operación no está esperando la confirmación de un pago.", EstadoOperacion.PagoPendiente, EstadoOperacion.PagoRegistrado);
            op.PaymentConfirmedAt = JsonMercado.Iso(_a.Ahora);
            AyudasOperacion.Paso(op, EstadoOperacion.EntregaPendiente, yo, _a.Ahora, "Pago confirmado por el vendedor (no verificado por la plataforma)");
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.payment_confirmed", "operation", op.Id);
            await _a.EmitirAsync("market.operation.payment_confirmed", "operation", op.Id, new { operationId = op.Id }, $"payment-confirmed:{op.Id}");
            return Guardada(op);
        });

        public Task<OperacionGuardadaDto> MarcarEntregaAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Operacion op = await CargarAsync(id);
            ExigirRol(op, yo, "vendedor", "Solo el vendedor marca la entrega.");
            ExigirEstado(op, "Primero debe confirmarse el pago.", EstadoOperacion.EntregaPendiente);
            op.SellerDeliveredAt = JsonMercado.Iso(_a.Ahora);
            AyudasOperacion.Paso(op, EstadoOperacion.EntregaConfirmada, yo, _a.Ahora, "Entrega confirmada por el vendedor");
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.delivered", "operation", op.Id);
            await _a.EmitirAsync("market.operation.delivered", "operation", op.Id, new { operationId = op.Id }, $"delivered:{op.Id}");
            return Guardada(op);
        });

        /// <summary>Confirmación de recepción del comprador: cierra la operación y transfiere la propiedad en la misma transacción.</summary>
        public Task<RecepcionDto> ConfirmarRecepcionAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Operacion op = await CargarAsync(id);
            ExigirRol(op, yo, "comprador", "Solo el comprador confirma la recepción.");
            ExigirEstado(op, "El vendedor aún no confirmó la entrega.", EstadoOperacion.EntregaConfirmada);
            op.BuyerReceivedAt = JsonMercado.Iso(_a.Ahora);
            Comprobante comprobante = await TransferirAsync(op);
            AyudasOperacion.Paso(op, EstadoOperacion.Completada, yo, _a.Ahora, $"Recepción confirmada; propiedad transferida ({comprobante.Code})");
            _a.Operaciones.Actualizar(op);
            return new RecepcionDto { OperationId = op.Id, Status = op.Status, ReceiptCode = comprobante.Code };
        });

        // ---------- cancelar, disputar, contacto, valoración ----------

        public Task<OperacionGuardadaDto> CancelarAsync(Guid usuario, string id, MotivoDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string motivo = AyudasOperacion.Motivo(dto.Reason);
            Operacion op = await CargarAsync(id);
            string rol = Rol(op, yo);
            if (op.Status is not (EstadoOperacion.PagoPendiente or EstadoOperacion.PagoRegistrado or EstadoOperacion.EntregaPendiente))
                throw ReglaNegocioException.Conflicto(op.Status == EstadoOperacion.EntregaConfirmada ? "La entrega ya se confirmó: abre una disputa si hay un problema." : "Esta operación ya no se puede cancelar.");
            await LiberarReservaAsync(op);
            op.CancelReason = motivo;
            AyudasOperacion.Paso(op, EstadoOperacion.Cancelada, yo, _a.Ahora, $"Cancelada por el {rol}: {motivo}");
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.cancel", "operation", op.Id, new { by = rol, reason = motivo });
            await _a.EmitirAsync("market.operation.cancelled", "operation", op.Id, new { operationId = op.Id, byId = yo }, $"operation-cancelled:{op.Id}");
            return Guardada(op);
        });

        public Task<OperacionGuardadaDto> DisputarAsync(Guid usuario, string id, MotivoDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string motivo = AyudasOperacion.Motivo(dto.Reason);
            Operacion op = await CargarAsync(id);
            Rol(op, yo);
            ExigirEstado(op, "Esta operación no admite una disputa en su estado actual.", EstadoOperacion.PagoPendiente, EstadoOperacion.PagoRegistrado, EstadoOperacion.EntregaPendiente, EstadoOperacion.EntregaConfirmada);
            op.DisputeReason = motivo;
            AyudasOperacion.Paso(op, EstadoOperacion.Disputada, yo, _a.Ahora, $"Disputa abierta: {motivo}");
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.dispute", "operation", op.Id, new { reason = motivo });
            await _a.EmitirAsync("market.operation.disputed", "operation", op.Id, new { operationId = op.Id, byId = yo }, $"operation-disputed:{op.Id}");
            return Guardada(op);
        });

        /// <summary>Cada parte autoriza compartir su contacto; solo se revela cuando ambas lo hacen y la operación sigue en curso.</summary>
        public Task<OperacionGuardadaDto> CompartirContactoAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            Operacion op = await CargarAsync(id);
            string rol = Rol(op, yo);
            ExigirEstado(op, "El contacto solo se comparte con una operación aceptada y en curso.", EstadosDeContacto);
            if (rol == "comprador") op.ShareContact.Buyer = true; else op.ShareContact.Seller = true;
            op.UpdatedAt = JsonMercado.Iso(_a.Ahora);
            op.Version += 1;
            _a.Operaciones.Actualizar(op);
            _a.Auditar(yo, "operation.share_contact", "operation", op.Id, new { role = rol });
            return Guardada(op);
        });

        /// <summary>Una valoración por parte y operación completada, dentro de 14 días.</summary>
        public Task ValorarAsync(Guid usuario, string id, ValoracionDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string comentario = (dto.Comment ?? string.Empty).Trim();
            if (comentario.Length > 0 && ReglasMercado.ContieneContacto(comentario)) throw ReglaNegocioException.Validacion("El comentario no puede incluir teléfonos ni correos.");
            Operacion op = await _a.Operaciones.ObtenerAsync(id) ?? throw ReglaNegocioException.NoEncontrado("Operación no encontrada.");
            if (op.BuyerId != yo && op.SellerId != yo) throw ReglaNegocioException.Prohibido("Solo las partes de una operación pueden valorarla.");
            if (op.Status != EstadoOperacion.Completada) throw ReglaNegocioException.Conflicto("Solo se valoran operaciones completadas.");
            string? cerrada = ReglasMercado.CompletadaEn(op);
            if (cerrada is null || _a.Ahora - JsonMercado.Fecha(cerrada) > ReglasMercado.PlazoValoracion) throw ReglaNegocioException.Conflicto("El plazo de 14 días para valorar esta operación terminó.");
            if ((await _a.Valoraciones.ListarAsync("operationId", id)).Any(v => v.RaterId == yo)) throw ReglaNegocioException.Conflicto("Ya valoraste esta operación.");
            var valoracion = new Valoracion
            {
                Id = Guid.NewGuid().ToString(), OperationId = id, RaterId = yo, RateeId = op.BuyerId == yo ? op.SellerId : op.BuyerId,
                Stars = dto.Stars, Comment = comentario, CreatedAt = JsonMercado.Iso(_a.Ahora),
            };
            _a.Valoraciones.Insertar(valoracion);
            _a.Auditar(yo, "rating.create", "operation", id, new { stars = dto.Stars });
            await _a.EmitirAsync("market.rating.received", "operation", id, new { operationId = id, ratingId = valoracion.Id }, $"rating:{valoracion.Id}");
        });

        // ---------- apoyo ----------

        private async Task<Operacion> CargarAsync(string id) =>
            await _a.Operaciones.ObtenerAsync(id, true) ?? throw ReglaNegocioException.NoEncontrado("Operación no encontrada.");

        private static string Rol(Operacion op, string usuario) =>
            op.BuyerId == usuario ? "comprador" : op.SellerId == usuario ? "vendedor" : throw ReglaNegocioException.Prohibido("Esta operación no es tuya.");

        private static void ExigirRol(Operacion op, string usuario, string rol, string mensaje)
        {
            if (Rol(op, usuario) != rol) throw ReglaNegocioException.Prohibido(mensaje);
        }

        private static void ExigirEstado(Operacion op, string mensaje, params string[] permitidos)
        {
            if (!permitidos.Contains(op.Status)) throw ReglaNegocioException.Conflicto(mensaje);
        }

        /// <summary>Libera la reserva: la compra directa vuelve a estar publicada; la de subasta queda libre para publicarse de nuevo.</summary>
        private async Task LiberarReservaAsync(Operacion op)
        {
            Publicacion? p = await _a.Publicaciones.ObtenerAsync(op.ListingId, true);
            List<Bloqueo> mios = (await _a.ActivosAsync(op.ListingId)).Where(b => b.OperationId == op.Id).ToList();
            if (p is null || mios.Count == 0) return;
            if (op.Origin == "directa")
            {
                await _a.SoltarDeOperacionAsync(p.Id, op.Id);
                if (p.Status == EstadoPublicacion.EnOperacion) p.Status = EstadoPublicacion.Publicada;
            }
            else
            {
                await _a.LiberarAsync(p.Id);
                p.Status = EstadoPublicacion.CerradaSinOfertas;
                p.ClosedReason = "operacion_cancelada";
            }
            p.UpdatedAt = JsonMercado.Iso(_a.Ahora);
            p.Version += 1;
            _a.Publicaciones.Actualizar(p);
        }

        // ---------- transferencia ----------

        /// <summary>
        /// Mueve las aves de la granja del vendedor a la del comprador (anillo, historial autorizado, propiedad y pasaporte), libera
        /// los bloqueos, marca la publicación como vendida y emite comprobante y factura. Todo o nada: corre dentro de la orden.
        /// </summary>
        private async Task<Comprobante> TransferirAsync(Operacion op)
        {
            Publicacion p = await _a.Publicaciones.ObtenerAsync(op.ListingId, true);
            if (p is null || p.BirdId != op.BirdId) throw ReglaNegocioException.Conflicto("La operación no corresponde al ave publicada.");
            if (op.Status != EstadoOperacion.EntregaConfirmada || op.PaymentConfirmedAt is null || op.SellerDeliveredAt is null) throw ReglaNegocioException.Conflicto("Faltan confirmaciones de pago o entrega para transferir.");
            if (!(await _a.ActivosAsync(p.Id)).Any(b => b.OperationId == op.Id)) throw ReglaNegocioException.Conflicto("La publicación no está reservada para esta operación.");
            if (p.Tipo is not (TipoPublicacion.Ave or TipoPublicacion.LoteAves or TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo))
                throw ReglaNegocioException.Conflicto("Tipo de publicación no transferible.");

            GranjaE granjaVendedor = await AyudasOperacion.GranjaAsync(_a, op.SellerId, true), granjaComprador = await AyudasOperacion.GranjaAsync(_a, op.BuyerId, true);
            var vendedor = DocumentoGranja.Desde(granjaVendedor.Datos);
            var comprador = DocumentoGranja.Desde(granjaComprador.Datos);
            string aliasVendedor = await _a.AliasAsync(op.SellerId), aliasComprador = await _a.AliasAsync(op.BuyerId);
            DateTime ahora = _a.Ahora;
            string hoy = ahora.ToString("yyyy-MM-dd"), en = JsonMercado.Iso(ahora);

            var movidas = new List<(string AveId, int? Anillo, bool AnilloConservado, int Historial)>();
            string? codigoLote = null;
            if (p.Tipo is TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo)
                codigoLote = MoverExistencias(op, p.Elementos[0], vendedor, comprador, aliasVendedor, aliasComprador, hoy);
            else
                foreach (ElementoPublicado e in p.Elementos)
                    movidas.Add(await MoverAveAsync(op, p, vendedor, comprador, e.BirdId!, aliasVendedor, hoy, en));

            granjaVendedor.Datos = vendedor.Json(); granjaVendedor.Version += 1; granjaVendedor.ActualizadoEn = ahora;
            granjaComprador.Datos = comprador.Json(); granjaComprador.Version += 1; granjaComprador.ActualizadoEn = ahora;

            await _a.LiberarAsync(p.Id);
            p.Status = EstadoPublicacion.Vendida;
            p.ClosedReason = "transferida";
            p.UpdatedAt = en;
            p.Version += 1;
            _a.Publicaciones.Actualizar(p);

            bool una = p.Tipo == TipoPublicacion.Ave;
            JsonObject? ave = una ? ReglasMercado.BuscarAve(vendedor, movidas[0].AveId) : null;
            string codigoAve = ave is null ? p.Snapshot.Code : DocumentoGranja.Texto(ave["code"]) ?? string.Empty;
            string nombreAve = ave is null ? p.Snapshot.Title ?? p.Snapshot.Name : DocumentoGranja.Texto(ave["name"]) ?? string.Empty;
            var contenido = new JsonObject
            {
                ["code"] = ReglasMercado.CodigoAleatorio("TRF", ahora), ["birdId"] = una ? movidas[0].AveId : p.BirdId, ["birdCode"] = codigoAve, ["birdName"] = nombreAve,
                ["ring"] = una ? movidas[0].Anillo : null, ["sellerAlias"] = aliasVendedor, ["buyerAlias"] = aliasComprador, ["price"] = op.Price, ["transferredAt"] = en, ["operationId"] = op.Id,
            };
            var comprobante = new Comprobante
            {
                Id = Guid.NewGuid().ToString(), Code = contenido["code"]!.GetValue<string>(), BirdId = contenido["birdId"]!.GetValue<string>(), OperationId = op.Id, ListingId = p.Id,
                SellerId = op.SellerId, BuyerId = op.BuyerId, SellerAlias = aliasVendedor, BuyerAlias = aliasComprador, BirdName = nombreAve, BirdCode = codigoAve,
                Ring = una ? movidas[0].Anillo : null, Price = op.Price, TransferredAt = en, Hash = ReglasMercado.Huella(contenido),
            };
            _a.Comprobantes.Insertar(comprobante);
            await EmitirFacturaAsync(op, p, comprobante, vendedor, ahora);
            _a.Auditar(op.BuyerId, "transfer.complete", una ? "bird" : "listing", una ? movidas[0].AveId : p.Id, new
            {
                operationId = op.Id, from = op.SellerId, to = op.BuyerId, receipt = comprobante.Code, itemType = p.Tipo, birdIds = movidas.Select(m => m.AveId).ToArray(), lotCode = codigoLote,
                sharedHistoryEvents = movidas.Sum(m => m.Historial), ringKept = movidas.Any(m => m.AnilloConservado),
            });
            await _a.EmitirAsync("market.transfer.completed", "operation", op.Id, new { operationId = op.Id, receiptCode = comprobante.Code }, $"transfer-completed:{op.Id}");
            return comprobante;
        }

        private static string MoverExistencias(Operacion op, ElementoPublicado item, DocumentoGranja vendedor, DocumentoGranja comprador, string aliasVendedor, string aliasComprador, string hoy)
        {
            JsonObject lote = vendedor.Buscar(ReglasMercado.ColeccionExistencias(item.Type), item.LotId) ?? throw ReglaNegocioException.Conflicto("El lote ya no existe en la granja del vendedor.");
            int cantidad = item.Quantity ?? 0;
            decimal disponible = DocumentoGranja.Numero(lote["available"]);
            if (cantidad < 1 || disponible < cantidad) throw ReglaNegocioException.Conflicto("El lote ya no tiene la cantidad publicada: la transferencia se bloqueó.");
            lote["available"] = disponible - cantidad;
            if (item.Type == TipoPublicacion.Insumo)
            {
                string nombre = DocumentoGranja.Texto(lote["name"]) ?? "", unidad = DocumentoGranja.Texto(lote["unit"]) ?? "";
                var igual = comprador.Lista("customProducts").OfType<JsonObject>().FirstOrDefault(p => DocumentoGranja.Texto(p["name"]) == nombre && DocumentoGranja.Texto(p["unit"]) == unidad);
                if (igual is not null) { igual["available"] = DocumentoGranja.Numero(igual["available"]) + cantidad; return DocumentoGranja.Texto(igual["code"]) ?? ""; }
                string productoCodigo = comprador.CodigoUnico("PRO");
                comprador.Lista("customProducts").Insert(0, new JsonObject {
                    ["id"] = DocumentoGranja.NuevoId("product"), ["code"] = productoCodigo,
                    ["name"] = nombre, ["category"] = lote["category"]?.DeepClone(), ["unit"] = unidad,
                    ["price"] = lote["price"]?.DeepClone(), ["available"] = cantidad,
                });
                return productoCodigo;
            }
            lote["sold"] = (int)DocumentoGranja.Numero(lote["sold"]) + cantidad;
            vendedor.Lista("lotMovements").Insert(0, new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("mov"), ["date"] = hoy, ["lotId"] = item.LotId,
                ["kind"] = "Vendido", ["quantity"] = cantidad, ["referenceId"] = op.Id,
                ["notes"] = $"Venta en el mercado a {aliasComprador}",
            });
            if (item.Type == TipoPublicacion.LoteHuevos)
            {
                string huevoCodigo = comprador.CodigoUnico("FER");
                comprador.Lista("fertileLots").Insert(0, new JsonObject {
                    ["id"] = DocumentoGranja.NuevoId("fertile-lot"), ["code"] = huevoCodigo,
                    ["sourceCollectionId"] = "", ["productType"] = lote["productType"]?.DeepClone(),
                    ["date"] = hoy, ["coopId"] = "", ["breed"] = lote["breed"]?.DeepClone(),
                    ["initial"] = cantidad, ["available"] = cantidad, ["sold"] = 0, ["incubated"] = 0, ["discarded"] = 0,
                    ["fertility"] = lote["fertility"]?.DeepClone(), ["storageNotes"] = "",
                    ["notes"] = $"Transferido por {aliasVendedor} el {hoy}. Datos del lote declarados por el vendedor.",
                });
                return huevoCodigo;
            }
            string codigo = comprador.CodigoUnico("POL");
            comprador.Lista("chickLots").Insert(0, new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("chick-lot"), ["code"] = codigo, ["birthId"] = "",
                ["sourceLotIds"] = new JsonArray(), ["incubationId"] = "", ["breed"] = DocumentoGranja.Texto(lote["breed"]) ?? "",
                ["initial"] = cantidad, ["available"] = cantidad, ["sold"] = 0, ["coopId"] = "",
                ["notes"] = $"Transferido por {aliasVendedor} el {hoy}. Datos del lote declarados por el vendedor.",
            });
            return codigo;
        }

        private async Task<(string AveId, int? Anillo, bool AnilloConservado, int Historial)> MoverAveAsync(Operacion op, Publicacion p, DocumentoGranja vendedor, DocumentoGranja comprador, string aveId, string aliasVendedor, string hoy, string en)
        {
            Propiedad? propiedad = await _a.Propiedades.ObtenerAsync(aveId, true);
            if (propiedad is null || propiedad.OwnerId != op.SellerId) throw ReglaNegocioException.Conflicto("El vendedor ya no es el propietario actual del ave: la transferencia se bloqueó.");
            JsonObject ave = ReglasMercado.BuscarAve(vendedor, aveId) ?? throw ReglaNegocioException.Conflicto("El ave ya no existe en la granja del vendedor.");
            string estado = DocumentoGranja.Texto(ave["status"]) ?? string.Empty;
            if (ReglasMercado.EstadosAveBloqueados.Contains(estado)) throw ReglaNegocioException.Conflicto($"El ave está {estado.ToLowerInvariant()} y no se puede transferir.");
            if (comprador.Existe("birds", aveId)) throw ReglaNegocioException.Conflicto("El comprador ya tiene registrada esta ave.");

            // Anillo: se conserva el número; si ya está ocupado en la granja del comprador no se pisa nada.
            JsonObject? anillo = vendedor.Lista("rings").OfType<JsonObject>().FirstOrDefault(r => DocumentoGranja.Texto(r["birdId"]) == aveId && DocumentoGranja.Texto(r["status"]) == "Asignado" && string.IsNullOrEmpty(DocumentoGranja.Texto(r["endedAt"])));
            var historialAnillos = new JsonArray(vendedor.Lista("rings").OfType<JsonObject>().Where(r => DocumentoGranja.Texto(r["birdId"]) == aveId)
                .Select(r => (JsonNode)new JsonObject { ["number"] = r["number"]?.DeepClone(), ["assignedAt"] = r["assignedAt"]?.DeepClone(), ["endedAt"] = string.IsNullOrEmpty(DocumentoGranja.Texto(r["endedAt"])) ? null : r["endedAt"]!.DeepClone() }).ToArray());
            string notaAnillo = string.Empty;
            int? numeroAnillo = anillo is null ? null : (int)DocumentoGranja.Numero(anillo["number"]);
            if (anillo is not null)
            {
                bool ocupado = comprador.Lista("rings").OfType<JsonObject>().Any(r => (int)DocumentoGranja.Numero(r["number"]) == numeroAnillo && DocumentoGranja.Texto(r["status"]) != "Retirado" && string.IsNullOrEmpty(DocumentoGranja.Texto(r["endedAt"])));
                if (ocupado) notaAnillo = $"Anillo {numeroAnillo} pendiente de reasignar: ese número ya está en uso en tu granja. El número original quedó en el pasaporte del ave.";
                else comprador.Lista("rings").Insert(0, new JsonObject { ["id"] = $"ring-{Guid.NewGuid()}", ["number"] = numeroAnillo, ["birdId"] = aveId, ["status"] = "Asignado", ["assignedAt"] = hoy, ["notes"] = $"Anillo original conservado en la transferencia desde {aliasVendedor}." });
                anillo["status"] = "Retirado";
                anillo["endedAt"] = hoy;
                anillo["notes"] = "Retirado por transferencia de propiedad.";
            }

            // Historial autorizado por el vendedor al publicar. Las observaciones, ventas y clientes nunca viajan.
            var tipos = new List<string>();
            if (p.Consent.ShareHistoryReproductive) tipos.Add("Reproductivo");
            if (p.Consent.ShareHistoryHealth) tipos.Add("Salud");
            List<JsonObject> historial = vendedor.Lista("birdEvents").OfType<JsonObject>().Where(ev => DocumentoGranja.Texto(ev["birdId"]) == aveId && tipos.Contains(DocumentoGranja.Texto(ev["kind"]) ?? string.Empty))
                .Select(ev => { var copia = (JsonObject)ev.DeepClone(); copia["id"] = $"evt-{Guid.NewGuid()}"; copia["transferredFrom"] = aliasVendedor; return copia; }).ToList();
            for (int i = historial.Count - 1; i >= 0; i--) comprador.Lista("birdEvents").Insert(0, historial[i]);

            string origenPrevio = DocumentoGranja.Texto(ave["origin"]) is { Length: > 0 } o ? o : "sin dato";
            var movida = (JsonObject)ave.DeepClone();
            movida["coopId"] = string.Empty;
            movida["status"] = "Activo";
            movida["notes"] = notaAnillo;
            movida["origin"] = $"Transferida por {aliasVendedor} el {hoy}. Procedencia declarada: {origenPrevio}";
            comprador.Lista("birds").Insert(0, movida);
            ave["status"] = "Transferido";

            // Propiedad y trazabilidad
            foreach (TramoDePropiedad tramo in (await _a.Tramos.ListarAsync("birdId", aveId)).Where(t => t.To is null && t.OwnerId == op.SellerId)) { tramo.To = en; _a.Tramos.Actualizar(tramo); }
            _a.Tramos.Insertar(new TramoDePropiedad { Id = $"{aveId}:{en}:{op.BuyerId[..8]}", BirdId = aveId, OwnerId = op.BuyerId, From = en, OperationId = op.Id });
            propiedad.OwnerId = op.BuyerId;
            propiedad.Since = en;
            propiedad.Version += 1;
            _a.Propiedades.Actualizar(propiedad);

            JsonNode? Linaje(string? id) => ReglasMercado.AncestroDe(vendedor, id, 2) is { } a ? JsonSerializer.SerializeToNode(a, JsonMercado.Opciones) : null;
            var linaje = new JsonObject
            {
                ["mother"] = Linaje(DocumentoGranja.Texto(ave["motherId"])), ["father"] = Linaje(DocumentoGranja.Texto(ave["fatherId"])), ["ringHistory"] = historialAnillos,
                ["birthDate"] = ave["bornAt"]?.DeepClone(), ["breed"] = ave["breed"]?.DeepClone(), ["declaredBy"] = aliasVendedor,
            };
            Pasaporte? pasaporte = (await _a.Pasaportes.ListarAsync("birdId", aveId)).FirstOrDefault();
            if (pasaporte is not null)
            {
                pasaporte.OriginRing ??= numeroAnillo;
                foreach (var par in linaje.ToArray()) { linaje.Remove(par.Key); pasaporte.Lineage[par.Key] = par.Value; }
                pasaporte.UpdatedAt = en;
                _a.Pasaportes.Actualizar(pasaporte);
            }
            else _a.Pasaportes.Insertar(new Pasaporte { Id = $"passport-{aveId}", BirdId = aveId, Code = DocumentoGranja.Texto(ave["code"]) ?? string.Empty, OriginRing = numeroAnillo, Lineage = linaje, UpdatedAt = en });
            return (aveId, numeroAnillo, numeroAnillo is not null && notaAnillo.Length == 0, historial.Count);
        }

        private async Task EmitirFacturaAsync(Operacion op, Publicacion p, Comprobante comprobante, DocumentoGranja vendedor, DateTime ahora)
        {
            string en = JsonMercado.Iso(ahora);
            List<string> detalle = p.Elementos.Select(e => ReglasMercado.BuscarAve(vendedor, e.BirdId)).OfType<JsonObject>()
                .Select(a => $"{DocumentoGranja.Texto(a["name"])} · {(DocumentoGranja.Texto(a["code"]) is { Length: > 0 } c ? c : "sin código")}").ToList();
            if (p.Tipo is TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo)
                detalle.Add($"{p.Snapshot.Title ?? p.Snapshot.Name} · Código de origen: {p.Snapshot.Code}");
            var factura = new Factura
            {
                Id = Guid.NewGuid().ToString(), Number = ReglasMercado.CodigoAleatorio("FAC", ahora), OperationId = op.Id, ListingId = p.Id, ReceiptCode = comprobante.Code,
                SellerId = op.SellerId, BuyerId = op.BuyerId, SellerAlias = comprobante.SellerAlias, BuyerAlias = comprobante.BuyerAlias,
                Lines = [new LineaDeFactura { Description = p.Snapshot.Title ?? p.Snapshot.Name, Detail = detalle, ItemType = p.Tipo, Unit = p.Tipo == TipoPublicacion.Ave ? "ave" : "lote", UnitPrice = op.Price, Total = op.Price }],
                Subtotal = op.Price, Total = op.Price, PaymentMethod = op.PaymentMethod, PaymentDeclaredAt = op.PaymentDeclaredAt, PaymentConfirmedAt = op.PaymentConfirmedAt!,
                DeliveredAt = op.SellerDeliveredAt!, ReceivedAt = op.BuyerReceivedAt ?? en, IssuedAt = en,
            };
            factura.Hash = HuellaFactura(factura);
            _a.Facturas.Insertar(factura);
            await _a.EmitirAsync("market.invoice.issued", "operation", op.Id, new { operationId = op.Id, invoiceId = factura.Id }, $"invoice-issued:{op.Id}");
        }

        /// <summary>Huella del contenido firmado: todo menos <c>id</c> y <c>hash</c>.</summary>
        public static string HuellaFactura(Factura factura)
        {
            JsonObject contenido = JsonSerializer.SerializeToNode(factura, JsonMercado.Opciones)!.AsObject();
            contenido.Remove("id");
            contenido.Remove("hash");
            return ReglasMercado.Huella(contenido);
        }

        public static string HuellaComprobante(Comprobante c) => ReglasMercado.Huella(new JsonObject
        {
            ["code"] = c.Code, ["birdId"] = c.BirdId, ["birdCode"] = c.BirdCode, ["birdName"] = c.BirdName, ["ring"] = c.Ring, ["sellerAlias"] = c.SellerAlias,
            ["buyerAlias"] = c.BuyerAlias, ["price"] = c.Price, ["transferredAt"] = c.TransferredAt, ["operationId"] = c.OperationId,
        });
    }
}
