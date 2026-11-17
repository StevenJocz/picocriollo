using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.Persistence.Commands;

namespace PicoCriollo.Tests
{
    /// <summary>El mercado por HTTP: lo público, lo que exige sesión y un recorrido de publicar, ofertar y pedir una compra.</summary>
    public class MercadoApiTests : IClassFixture<ApiFactory>
    {
        private readonly ApiFactory _fabrica;
        public MercadoApiTests(ApiFactory fabrica) => _fabrica = fabrica;

        private async Task<HttpClient> Cliente(string correo, string nombre)
        {
            var cliente = _fabrica.CreateClient();
            var registro = await cliente.PostAsJsonAsync("/api/auth/registro", new { correo, password = "una-clave-bien-larga-1", nombreUsuario = nombre });
            var sesion = (await registro.Content.ReadFromJsonAsync<InicioRespuestaDto>())!;
            cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.Token);
            return cliente;
        }

        private static async Task<string> NuevaAve(HttpClient cliente, string nombre)
        {
            var gallinero = (await (await cliente.PostAsJsonAsync("/api/granja/gallineros", new { name = "Corral", capacity = 10 })).Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;
            return (await (await cliente.PostAsJsonAsync("/api/granja/aves", new { name = nombre, sex = "Gallo", coopId = gallinero.Id, breed = "Pico criollo" })).Content.ReadFromJsonAsync<RegistroGuardadoDto>())!.Id;
        }

        [Fact]
        public async Task ExplorarEsPublicoPeroLoDemasExigeSesion()
        {
            using var anonimo = _fabrica.CreateClient();
            Assert.Equal(HttpStatusCode.OK, (await anonimo.GetAsync("/api/mercado")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync("/api/mercado/mias")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsJsonAsync("/api/mercado/publicaciones", new { kind = "fixed" })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync("/api/operaciones")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync("/api/facturas")).StatusCode);
        }

        [Fact]
        public async Task Recorrido_PublicarVerOfertarYPedirCompra()
        {
            using var vendedor = await Cliente("vende@correo.test", "Vende Pico");
            using var comprador = await Cliente("compra@correo.test", "Compra Pico");
            string ave = await NuevaAve(vendedor, "Rojo");

            var creada = await vendedor.PostAsJsonAsync("/api/mercado/publicaciones", new { kind = "fixed", birdId = ave, price = 180000, publish = true, consent = new { description = "Gallo de buen porte", deliveryZone = "Medellín" } });
            Assert.Equal(HttpStatusCode.OK, creada.StatusCode);
            var guardada = (await creada.Content.ReadFromJsonAsync<PublicacionGuardadaDto>())!;
            Assert.Equal("publicada", guardada.Status);

            using var anonimo = _fabrica.CreateClient();
            var lista = (await anonimo.GetFromJsonAsync<ListadoMercadoDto>("/api/mercado?q=rojo"))!;
            Assert.Equal(guardada.Id, lista.Items.Single().Id);
            Assert.Equal("Vende Pico", lista.Items[0].SellerAlias);
            Assert.Equal("Gallo de buen porte", lista.Items[0].Snapshot.Description);

            var detalle = (await comprador.GetFromJsonAsync<DetallePublicacionDto>($"/api/mercado/{guardada.Id}"))!;
            Assert.False(detalle.Viewer.IsOwner);

            // Una ave ya publicada no admite otra publicación, y el comprador no puede cambiar la del vendedor.
            Assert.Equal(HttpStatusCode.Conflict, (await vendedor.PostAsJsonAsync("/api/mercado/publicaciones", new { kind = "fixed", birdId = ave, price = 1000 })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await comprador.PostAsync($"/api/mercado/publicaciones/{guardada.Id}/pausar", null)).StatusCode);

            var solicitud = await comprador.PostAsJsonAsync($"/api/mercado/publicaciones/{guardada.Id}/solicitud", new { message = "Me interesa, ¿sigue disponible?" });
            Assert.Equal(HttpStatusCode.OK, solicitud.StatusCode);
            var op = (await solicitud.Content.ReadFromJsonAsync<OperacionGuardadaDto>())!;
            var mias = (await vendedor.GetFromJsonAsync<List<MiPublicacionDto>>("/api/mercado/mias"))!;
            Assert.Equal(1, mias.Single().PendingRequests);

            var aceptada = await vendedor.PostAsJsonAsync($"/api/operaciones/{op.Id}/responder", new { decision = "accept" });
            Assert.Equal("pago_pendiente", (await aceptada.Content.ReadFromJsonAsync<OperacionGuardadaDto>())!.Status);
            var hilos = (await comprador.GetFromJsonAsync<List<ResumenConversacionDto>>("/api/mercado/conversaciones"))!;
            Assert.Equal("Me interesa, ¿sigue disponible?", hilos.Single().LastMessage);

            // Los errores de negocio salen con el formato de siempre.
            var error = await comprador.PostAsJsonAsync($"/api/operaciones/{op.Id}/recepcion", new { });
            Assert.Equal(HttpStatusCode.Conflict, error.StatusCode);
            Assert.False((await error.Content.ReadFromJsonAsync<PicoCriollo.Domain.DTOs.RespuestaDto>())!.Respuesta);
        }

        [Fact]
        public async Task Subasta_ConIdempotenciaPorHttp()
        {
            using var vendedor = await Cliente("subasta@correo.test", "Casa de Subastas");
            using var postor = await Cliente("postor@correo.test", "Postor Uno");
            string ave = await NuevaAve(vendedor, "Pintado");
            var creada = await vendedor.PostAsJsonAsync("/api/mercado/publicaciones", new { kind = "auction", birdId = ave, publish = true, auction = new { startingPrice = 80000, closesAt = DateTime.UtcNow.AddDays(2) } });
            Assert.Equal(HttpStatusCode.OK, creada.StatusCode);
            string id = (await creada.Content.ReadFromJsonAsync<PublicacionGuardadaDto>())!.Id;

            Assert.Equal(HttpStatusCode.OK, (await postor.PostAsJsonAsync($"/api/mercado/publicaciones/{id}/ofertas", new { amount = 80000, idempotencyKey = "una-clave-1" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await postor.PostAsJsonAsync($"/api/mercado/publicaciones/{id}/ofertas", new { amount = 80000, idempotencyKey = "una-clave-1" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await postor.PostAsJsonAsync($"/api/mercado/publicaciones/{id}/ofertas", new { amount = 90000, idempotencyKey = "x" })).StatusCode);
            var detalle = (await postor.GetFromJsonAsync<DetallePublicacionDto>($"/api/mercado/{id}"))!;
            Assert.Single(detalle.Bids);
            Assert.True(detalle.Viewer.IsTopBidder);
            Assert.Equal("abierta", detalle.Listing.Auction!.Phase);
        }
    }
}
