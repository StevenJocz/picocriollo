using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Mercado;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.Tests
{
    internal sealed class PushFalso : PicoCriollo.Infrastructure.Push.IEnviadorPush
    {
        public List<PicoCriollo.Infrastructure.Push.MensajePush> Enviados { get; } = [];
        public List<string> Olvidar { get; } = [];

        public Task<IReadOnlyList<string>> EnviarAsync(IReadOnlyList<PicoCriollo.Infrastructure.Push.MensajePush> mensajes, CancellationToken cancelar = default)
        {
            Enviados.AddRange(mensajes);
            return Task.FromResult<IReadOnlyList<string>>(Olvidar.ToList());
        }
    }

    /// <summary>Un mercado completo en memoria: varias personas, el guardián real y un reloj que se puede adelantar.</summary>
    internal sealed class EntornoMercado : IDisposable
    {
        public Entorno Base { get; } = new();
        public AlmacenMercado Almacen { get; }
        public GranjaCommands Granja { get; }
        public PublicacionCommands Publicaciones { get; }
        public SubastaCommands Subastas { get; }
        public OperacionCommands Operaciones { get; }
        public MensajeCommands Mensajes { get; }
        public MercadoQueries Consultas { get; }
        public PushFalso Push { get; } = new();
        public NotificacionCommands Notificaciones { get; }
        public NotificacionQueries Avisos { get; }
        public SocialCommands Social { get; }
        public SocialQueries Perfiles { get; }
        public GranjaQueries Granjas { get; }

        public EntornoMercado()
        {
            Almacen = new AlmacenMercado(Base.Contexto, Base.Reloj);
            Granja = new GranjaCommands(Base.Contexto, new MercadoGuardia(Almacen), Base.Reloj);
            Publicaciones = new PublicacionCommands(Almacen);
            Subastas = new SubastaCommands(Almacen);
            Operaciones = new OperacionCommands(Almacen);
            Mensajes = new MensajeCommands(Almacen);
            Consultas = new MercadoQueries(Almacen);
            Notificaciones = new NotificacionCommands(Almacen, Push, Microsoft.Extensions.Logging.Abstractions.NullLogger<NotificacionCommands>.Instance);
            Avisos = new NotificacionQueries(Almacen);
            Social = new SocialCommands(Almacen);
            Perfiles = new SocialQueries(Almacen, Consultas);
            Granjas = new GranjaQueries(Base.Contexto);
        }

        public async Task<Guid> Persona(string nombre) => (await Base.Registrar($"{nombre.ToLowerInvariant()}@correo.test", nombre)).Datos!.Id;

        public async Task<string> Ave(Guid dueno, string nombre = "Luna")
        {
            string gallinero = (await Granja.CrearGallineroAsync(dueno, new GallineroDto { Name = "Corral " + nombre, Capacity = 20 })).Id;
            return (await Granja.CrearAveAsync(dueno, new AveDto { Name = nombre, Sex = "Gallina", CoopId = gallinero, Breed = "Brahma", BornAt = "2026-01-10" })).Id;
        }

        public async Task<string> Publicar(Guid vendedor, string aveId, long precio = 150_000) =>
            (await Publicaciones.CrearAsync(vendedor, new PublicacionNuevaDto { Kind = "fixed", BirdId = aveId, Price = precio, Publish = true })).Id;

        public async Task<string> Subasta(Guid vendedor, string aveId, long inicial = 100_000, long? reserva = null, bool antiFrancotirador = false) =>
            (await Publicaciones.CrearAsync(vendedor, new PublicacionNuevaDto
            {
                Kind = "auction", BirdId = aveId, Publish = true,
                Auction = new SubastaDto { StartingPrice = inicial, ReservePrice = reserva, AntiSniping = antiFrancotirador, ClosesAt = Base.Reloj.GetUtcNow().UtcDateTime.AddHours(2) },
            })).Id;

        public async Task<Publicacion> Pub(string id) => (await Almacen.Publicaciones.ObtenerAsync(id))!;

        public async Task<JsonObject> Doc(Guid persona)
        {
            Base.Contexto.ChangeTracker.Clear();
            return (JsonObject)JsonNode.Parse((await Base.Contexto.GranjaEs.AsNoTracking().SingleAsync(g => g.IdUsuario == persona)).Datos)!;
        }

        public void Dispose() => Base.Dispose();
    }

    public class MercadoCommandsTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        // ---------- publicaciones ----------

        [Fact]
        public async Task Publicar_BloqueaElAveYMuestraSoloLaFichaPublica()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            string ave = await e.Ave(ana);
            string id = await e.Publicar(ana, ave);

            var p = await e.Pub(id);
            Assert.Equal("publicada", p.Status);
            Assert.Equal("Luna", p.Snapshot.Name);
            Assert.False(string.IsNullOrEmpty(p.SourceHash));
            Assert.Single(await e.Almacen.Bloqueos.ListarAsync(("birdId", ave), ("status", "active")));

            var lista = await e.Consultas.ExplorarAsync(new FiltroMercado(), null);
            Assert.Equal(1, lista.Total);
            Assert.Equal("Ana", lista.Items[0].SellerAlias);
        }

        [Fact]
        public async Task Publicar_RechazaAveAjenaDuplicadaYTiposSinSoporte()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string ave = await e.Ave(ana);
            await Falla(e.Publicaciones.CrearAsync(beto, new PublicacionNuevaDto { Kind = "fixed", BirdId = ave, Price = 1000 }), 403);
            await e.Publicar(ana, ave);
            await Falla(e.Publicaciones.CrearAsync(ana, new PublicacionNuevaDto { Kind = "fixed", BirdId = ave, Price = 1000 }), 409);
            await Falla(e.Publicaciones.CrearAsync(ana, new PublicacionNuevaDto { Kind = "fixed", ItemType = "lote_pollitos", Price = 1000 }), 400);
            string otra = await e.Ave(ana, "Sol");
            await Falla(e.Publicaciones.CrearAsync(ana, new PublicacionNuevaDto { Kind = "fixed", BirdId = otra, Price = 0 }), 400);
        }

        [Fact]
        public async Task LaAveEnElMercadoNoSePuedeVenderNiBorrarDesdeLaGranja()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            string ave = await e.Ave(ana);
            await e.Publicar(ana, ave);
            await Falla(e.Granja.EliminarAveAsync(ana, ave), 409);
        }

        [Fact]
        public async Task CambiarLaFichaDelAvePublicadaMarcaLaPublicacionParaRevision()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            string ave = await e.Ave(ana);
            string id = await e.Publicar(ana, ave);
            Assert.False((await e.Pub(id)).NeedsReview);

            var fila = (await e.Doc(ana))["birds"]!.AsArray().OfType<JsonObject>().Single();
            await e.Granja.ActualizarAveAsync(ana, ave, new AveDto { Name = "Luna Dorada", Sex = "Gallina", CoopId = (string)fila["coopId"]!, Breed = "Brahma", BornAt = "2026-01-10" });
            Assert.True((await e.Pub(id)).NeedsReview);
            await e.Publicaciones.PausarAsync(ana, id);
            await Falla(e.Publicaciones.ReanudarAsync(ana, id), 409);
        }

        [Fact]
        public async Task RetirarLiberaElAveYPermiteVolverAPublicar()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            string ave = await e.Ave(ana);
            string id = await e.Publicar(ana, ave);
            await e.Publicaciones.RetirarAsync(ana, id);
            Assert.Empty(await e.Almacen.Bloqueos.ListarAsync(("birdId", ave), ("status", "active")));
            await e.Publicar(ana, ave);
        }

        // ---------- compra directa y traspaso ----------

        [Fact]
        public async Task CompraDirecta_DeLaSolicitudALaTransferencia()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string ave = await e.Ave(ana);
            string id = await e.Publicar(ana, ave);

            await Falla(e.Operaciones.SolicitarCompraAsync(ana, id, new SolicitudCompraDto()), 403);
            var solicitud = await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto { Message = "¿Sigue disponible?" });
            Assert.Equal("solicitud_recibida", solicitud.Status);
            await Falla(e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto()), 409);
            await Falla(e.Operaciones.ResponderAsync(beto, solicitud.Id, true), 403);

            Assert.Equal("pago_pendiente", (await e.Operaciones.ResponderAsync(ana, solicitud.Id, true)).Status);
            Assert.Equal("en_operacion", (await e.Pub(id)).Status);
            await Falla(e.Operaciones.ConfirmarPagoAsync(beto, solicitud.Id), 403);
            await Falla(e.Operaciones.ConfirmarRecepcionAsync(beto, solicitud.Id), 409);

            await e.Operaciones.DeclararPagoAsync(beto, solicitud.Id, new PagoDto { Method = "Nequi" });
            await e.Operaciones.ConfirmarPagoAsync(ana, solicitud.Id);
            await Falla(e.Operaciones.ConfirmarRecepcionAsync(beto, solicitud.Id), 409);
            await e.Operaciones.MarcarEntregaAsync(ana, solicitud.Id);
            var recibo = await e.Operaciones.ConfirmarRecepcionAsync(beto, solicitud.Id);
            Assert.Equal("completada", recibo.Status);
            Assert.StartsWith("TRF-", recibo.ReceiptCode);

            // El ave cambia de granja con el mismo id y código; en la del vendedor queda como historial.
            var granjaBeto = await e.Doc(beto);
            var aveBeto = granjaBeto["birds"]!.AsArray().OfType<JsonObject>().Single();
            Assert.Equal(ave, (string)aveBeto["id"]!);
            Assert.Equal("Activo", (string)aveBeto["status"]!);
            Assert.Contains("Transferida por Ana", (string)aveBeto["origin"]!);
            Assert.Equal("Transferido", (string)(await e.Doc(ana))["birds"]!.AsArray().OfType<JsonObject>().Single()["status"]!);

            Assert.Equal(beto.ToString(), (await e.Almacen.Propiedades.ObtenerAsync(ave))!.OwnerId);
            Assert.Equal("vendida", (await e.Pub(id)).Status);
            Assert.Empty(await e.Almacen.Bloqueos.ListarAsync(("birdId", ave), ("status", "active")));
            Assert.Single(await e.Almacen.Tramos.ListarAsync("birdId", ave), t => t.To is null && t.OwnerId == beto.ToString());

            var comprobante = await e.Consultas.ComprobanteAsync(beto, recibo.ReceiptCode);
            Assert.True(comprobante.Integrity);
            Assert.Equal("comprador", comprobante.Role);
            await Falla(e.Consultas.ComprobanteAsync(await e.Persona("Carla"), recibo.ReceiptCode), 403);

            var facturas = await e.Consultas.FacturasAsync(ana, null);
            Assert.Single(facturas);
            var factura = await e.Consultas.FacturaAsync(ana, facturas[0].Number);
            Assert.True(factura.Integrity);
            Assert.Equal(150_000, factura.Total);
            Assert.Equal("Nequi", factura.PaymentMethod);

            var procedencia = await e.Consultas.ProcedenciaAsync(beto, ave);
            Assert.Equal(["Ana", "Beto"], procedencia.Owners.Select(o => o.Alias).ToArray());
        }

        [Fact]
        public async Task AceptarUnaSolicitudCierraLasDemasYCancelarLiberaElAve()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto"), carla = await e.Persona("Carla");
            string ave = await e.Ave(ana);
            string id = await e.Publicar(ana, ave);
            var deBeto = await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto());
            var deCarla = await e.Operaciones.SolicitarCompraAsync(carla, id, new SolicitudCompraDto());
            await e.Operaciones.ResponderAsync(ana, deBeto.Id, true);

            var ops = await e.Consultas.OperacionesAsync(carla, null);
            Assert.Equal("cancelada", ops.Single(o => o.Id == deCarla.Id).Status);

            await Falla(e.Operaciones.CancelarAsync(ana, deBeto.Id, new MotivoDto { Reason = "corto" }), 400);
            await e.Operaciones.CancelarAsync(ana, deBeto.Id, new MotivoDto { Reason = "El comprador no respondió más" });
            Assert.Equal("publicada", (await e.Pub(id)).Status);
            Assert.Single(await e.Almacen.Bloqueos.ListarAsync(("birdId", ave), ("status", "active")));
            Assert.Null((await e.Almacen.Bloqueos.ListarAsync("birdId", ave)).Single(b => b.Status == "active").OperationId);
        }

        [Fact]
        public async Task LaPlataformaNoRevelaElContactoHastaQueAmbosLoAutorizan()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await e.Publicar(ana, await e.Ave(ana));
            var op = await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto());
            await Falla(e.Mensajes.EnviarAsync(beto, new MensajeNuevoDto { ListingId = id, Body = "Escríbeme al 300 123 4567" }), 400);
            await e.Operaciones.ResponderAsync(ana, op.Id, true);
            await Falla(e.Consultas.ContactoAsync(beto, op.Id), 403);
            await e.Operaciones.CompartirContactoAsync(beto, op.Id);
            await Falla(e.Consultas.ContactoAsync(beto, op.Id), 403);
            await e.Operaciones.CompartirContactoAsync(ana, op.Id);
            var contacto = await e.Consultas.ContactoAsync(beto, op.Id);
            Assert.Equal("ana@correo.test", contacto.Email);
        }

        [Fact]
        public async Task LasValoracionesSoloCuentanTrasUnaVentaCompletada()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await e.Publicar(ana, await e.Ave(ana));
            var op = await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto());
            await Falla(e.Operaciones.ValorarAsync(beto, op.Id, new ValoracionDto { Stars = 5 }), 409);
            await e.Operaciones.ResponderAsync(ana, op.Id, true);
            await e.Operaciones.DeclararPagoAsync(beto, op.Id, new PagoDto { Method = "Efectivo" });
            await e.Operaciones.ConfirmarPagoAsync(ana, op.Id);
            await e.Operaciones.MarcarEntregaAsync(ana, op.Id);
            await e.Operaciones.ConfirmarRecepcionAsync(beto, op.Id);

            await e.Operaciones.ValorarAsync(beto, op.Id, new ValoracionDto { Stars = 5, Comment = "Excelente" });
            await Falla(e.Operaciones.ValorarAsync(beto, op.Id, new ValoracionDto { Stars = 4 }), 409);
            var reputacion = await e.Consultas.ReputacionAsync(ana.ToString());
            Assert.Equal(1, reputacion.Count);
            Assert.Equal(5.0, reputacion.Average);
            // La opinión de la otra parte no se ve hasta que se valora o vence el plazo.
            Assert.Null((await e.Consultas.OperacionesAsync(ana, null)).Single().Rating.Theirs);
            await e.Operaciones.ValorarAsync(ana, op.Id, new ValoracionDto { Stars = 4 });
            Assert.Equal(5, (await e.Consultas.OperacionesAsync(ana, null)).Single().Rating.Theirs!.Stars);
        }

        // ---------- subastas ----------

        [Fact]
        public async Task Oferta_RespetaMinimoIdempotenciaYVendedor()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto"), carla = await e.Persona("Carla");
            string id = await e.Subasta(ana, await e.Ave(ana), 100_000);

            await Falla(e.Subastas.OfertarAsync(ana, id, new OfertaDto { Amount = 200_000, IdempotencyKey = "clave-ana-1" }), 403);
            await Falla(e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 99_000, IdempotencyKey = "clave-beto-1" }), 400);
            var primera = await e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 100_000, IdempotencyKey = "clave-beto-2" });
            var repetida = await e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 100_000, IdempotencyKey = "clave-beto-2" });
            Assert.Equal(primera.PlacedAt, repetida.PlacedAt);
            Assert.Single(await e.Almacen.Ofertas.ListarAsync("listingId", id));
            await Falla(e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 300_000, IdempotencyKey = "clave-beto-3" }), 409);
            await Falla(e.Subastas.OfertarAsync(carla, id, new OfertaDto { Amount = 100_500, IdempotencyKey = "clave-carla-1" }), 400);
            await e.Subastas.OfertarAsync(carla, id, new OfertaDto { Amount = 105_000, IdempotencyKey = "clave-carla-2" });

            var detalle = await e.Consultas.DetalleAsync(id, carla);
            Assert.True(detalle.Viewer.IsTopBidder);
            Assert.Equal(2, detalle.Bids.Count);
            Assert.Equal(new[] { "Postor 2", "Postor 1" }, detalle.Bids.Select(b => b.Alias).ToArray());
            Assert.Equal(110_000, detalle.Listing.Auction!.MinNextBid);
        }

        [Fact]
        public async Task AntiFrancotirador_AlargaElCierreConUnaOfertaTardia()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await e.Subasta(ana, await e.Ave(ana), 100_000, antiFrancotirador: true);
            string cierreInicial = (await e.Pub(id)).ClosesAt!;
            e.Base.Reloj.Avanzar(TimeSpan.FromMinutes(118));
            await e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 100_000, IdempotencyKey = "clave-beto-1" });
            var p = await e.Pub(id);
            Assert.Equal(1, p.Extensions);
            Assert.Equal(JsonMercado.Fecha(cierreInicial).AddMinutes(5), JsonMercado.Fecha(p.ClosesAt!));
        }

        [Fact]
        public async Task Cierre_AdjudicaALaOfertaMasAltaYAbreLaOperacion()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto"), carla = await e.Persona("Carla");
            string ave = await e.Ave(ana);
            string id = await e.Subasta(ana, ave, 100_000);
            await e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 100_000, IdempotencyKey = "clave-beto-1" });
            await e.Subastas.OfertarAsync(carla, id, new OfertaDto { Amount = 120_000, IdempotencyKey = "clave-carla-1" });

            Assert.Equal(0, (await e.Subastas.CerrarVencidasAsync()).Closed);
            e.Base.Reloj.Avanzar(TimeSpan.FromHours(3));
            Assert.Equal(1, (await e.Subastas.CerrarVencidasAsync()).Closed);
            Assert.Equal(0, (await e.Subastas.CerrarVencidasAsync()).Closed);

            var p = await e.Pub(id);
            Assert.Equal("en_operacion", p.Status);
            Assert.Equal("adjudicada", p.ClosedReason);
            var op = (await e.Consultas.OperacionesAsync(carla, "comprador")).Single();
            Assert.Equal("pago_pendiente", op.Status);
            Assert.Equal(120_000, op.Price);
            Assert.Equal("subasta", op.Origin);
            var misOfertas = await e.Consultas.MisOfertasAsync(beto);
            Assert.Equal("no_ganadora", misOfertas.Single().Result);
            Assert.Equal("ganadora", (await e.Consultas.MisOfertasAsync(carla)).Single().Result);
        }

        [Fact]
        public async Task Cierre_SinReservaCumplidaLiberaElAve()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string ave = await e.Ave(ana);
            string id = await e.Subasta(ana, ave, 100_000, reserva: 200_000);
            await e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 150_000, IdempotencyKey = "clave-beto-1" });
            e.Base.Reloj.Avanzar(TimeSpan.FromHours(3));
            await e.Subastas.CerrarVencidasAsync();
            var p = await e.Pub(id);
            Assert.Equal("cerrada_sin_ofertas", p.Status);
            Assert.Equal("reserva_no_alcanzada", p.ClosedReason);
            Assert.Empty(await e.Almacen.Bloqueos.ListarAsync(("birdId", ave), ("status", "active")));
            Assert.Empty(await e.Consultas.OperacionesAsync(beto, null));
        }

        [Fact]
        public async Task CancelarUnaSubastaConOfertasExigeMotivoYMasDe24Horas()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = (await e.Publicaciones.CrearAsync(ana, new PublicacionNuevaDto
            {
                Kind = "auction", BirdId = await e.Ave(ana), Publish = true,
                Auction = new SubastaDto { StartingPrice = 100_000, ClosesAt = e.Base.Reloj.GetUtcNow().UtcDateTime.AddDays(3) },
            })).Id;
            await e.Subastas.OfertarAsync(beto, id, new OfertaDto { Amount = 100_000, IdempotencyKey = "clave-beto-1" });
            await Falla(e.Publicaciones.RetirarAsync(ana, id), 409);
            await Falla(e.Subastas.CancelarAsync(ana, id, new MotivoDto()), 400);
            await e.Subastas.CancelarAsync(ana, id, new MotivoDto { Reason = "Ya no quiero venderla" });
            Assert.Equal("cancelada", (await e.Pub(id)).Status);
            Assert.Equal("no_ganadora", (await e.Almacen.Ofertas.ListarAsync("listingId", id)).Single().Status);
        }

        // ---------- interesados ----------

        [Fact]
        public async Task Interesados_SeRegistranYElVendedorLosVe()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await e.Publicar(ana, await e.Ave(ana));
            await Falla(e.Publicaciones.MostrarInteresAsync(ana, id, new InteresDto()), 403);
            await e.Publicaciones.MostrarInteresAsync(beto, id, new InteresDto { Message = "Me interesa" });
            await e.Publicaciones.MostrarInteresAsync(beto, id, new InteresDto());
            var lista = await e.Consultas.InteresadosAsync(ana, id);
            Assert.Single(lista);
            Assert.Equal("Beto", lista[0].Alias);
            await Falla(e.Consultas.InteresadosAsync(beto, id), 403);
            await e.Publicaciones.RetirarInteresAsync(beto, id);
            Assert.Empty(await e.Consultas.InteresadosAsync(ana, id));
        }

        [Fact]
        public async Task Detalle_UnBorradorSoloLoVeSuDueno()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = (await e.Publicaciones.CrearAsync(ana, new PublicacionNuevaDto { Kind = "interest", BirdId = await e.Ave(ana) })).Id;
            await Falla(e.Consultas.DetalleAsync(id, beto), 404);
            await Falla(e.Consultas.DetalleAsync(id, null), 404);
            Assert.True((await e.Consultas.DetalleAsync(id, ana)).Viewer.IsOwner);
            Assert.Single(await e.Consultas.MisPublicacionesAsync(ana, "borrador"));
        }
    }
}
