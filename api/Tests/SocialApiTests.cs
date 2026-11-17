using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using PicoCriollo.Domain.DTOs.NotificacionesD;
using PicoCriollo.Domain.DTOs.SocialD;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.API.Controllers;
using System.Reflection;

namespace PicoCriollo.Tests
{
    /// <summary>Perfil, reels, fotos y notificaciones por HTTP: autorización y el recorrido de una foto.</summary>
    public class SocialApiTests : IClassFixture<ApiFactory>
    {
        private readonly ApiFactory _fabrica;
        public SocialApiTests(ApiFactory fabrica) => _fabrica = fabrica;

        private static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

        private async Task<HttpClient> Cliente(string correo, string nombre)
        {
            var cliente = _fabrica.CreateClient();
            var registro = await cliente.PostAsJsonAsync("/api/auth/registro", new { correo, password = "una-clave-bien-larga-1", nombreUsuario = nombre });
            var sesion = (await registro.Content.ReadFromJsonAsync<InicioRespuestaDto>())!;
            cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.Token);
            return cliente;
        }

        [Fact]
        public async Task TodoExigeSesionSalvoVerUnaFoto()
        {
            using var anonimo = _fabrica.CreateClient();
            foreach (string ruta in new[] { "/api/perfil", "/api/reels", "/api/notificaciones", "/api/notificaciones/resumen", "/api/notificaciones/preferencias", "/api/perfiles/x/publicaciones" })
                Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync(ruta)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsJsonAsync("/api/publicaciones-perfil", new { text = "hola" })).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await anonimo.GetAsync("/api/media/no-existe")).StatusCode);
        }

        [Fact]
        public async Task Recorrido_FotoDePerfilPublicacionYFeed()
        {
            using var ana = await Cliente("socialana@correo.test", "Ana Social");
            using var beto = await Cliente("socialbeto@correo.test", "Beto Social");

            var contenido = new ByteArrayContent(Png);
            contenido.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            var subida = await ana.PostAsync("/api/media?uso=avatar&ancho=1&alto=1", contenido);
            Assert.Equal(HttpStatusCode.OK, subida.StatusCode);
            var medio = (await subida.Content.ReadFromJsonAsync<MedioSubidoDto>())!;

            using var anonimo = _fabrica.CreateClient();
            var foto = await anonimo.GetAsync(medio.Url);
            Assert.Equal("image/webp", foto.Content.Headers.ContentType!.MediaType);
            var optimizada = await foto.Content.ReadAsByteArrayAsync();
            Assert.Equal("WEBP", System.Text.Encoding.ASCII.GetString(optimizada, 8, 4));

            var texto = new StringContent("hola", System.Text.Encoding.UTF8, "text/plain");
            Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await ana.PostAsync("/api/media?uso=post", texto)).StatusCode);

            var creada = await ana.PostAsJsonAsync("/api/publicaciones-perfil", new { text = "Mi primer reel #gallos" });
            Assert.Equal(HttpStatusCode.OK, creada.StatusCode);
            var post = (await creada.Content.ReadFromJsonAsync<PostDto>())!;
            Assert.Equal(medio.Url, post.AuthorAvatarUrl);

            var feed = (await beto.GetFromJsonAsync<PaginaReelsDto>("/api/reels?limite=5"))!;
            Assert.Equal(post.Id, feed.Items.Single().Id);

            Assert.Equal(HttpStatusCode.OK, (await beto.PutAsJsonAsync($"/api/publicaciones-perfil/{post.Id}/me-gusta", new { liked = true })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await beto.DeleteAsync($"/api/publicaciones-perfil/{post.Id}")).StatusCode);
            var seguir = await beto.PostAsync($"/api/perfiles/{post.AuthorId}/seguir", null);
            Assert.Equal(1, (await seguir.Content.ReadFromJsonAsync<SeguirResultadoDto>())!.Followers);

        }

        [Theory]
        [InlineData("abc.webp", "abc")]
        [InlineData("abc.mp4", "abc")]
        [InlineData("abc", "abc")]
        public void LaRutaMediaAceptaExtensionSinCambiarElIdentificador(string ruta, string esperado)
        {
            var metodo = typeof(MediaController).GetMethod("NormalizarId", BindingFlags.Public | BindingFlags.Static);
            Assert.NotNull(metodo);
            Assert.Equal(esperado, metodo!.Invoke(null, [ruta]));
        }

        [Fact]
        public async Task Notificaciones_PreferenciasYDispositivosPorHttp()
        {
            using var ana = await Cliente("avisos@correo.test", "Ana Avisos");
            var prefs = (await ana.GetFromJsonAsync<PreferenciasDto>("/api/notificaciones/preferencias"))!;
            Assert.True(prefs.Channels["inApp"]);
            Assert.Equal("Mercado y ofertas", prefs.CategoryLabels["comercial"]);

            var cambiada = await ana.PutAsJsonAsync("/api/notificaciones/preferencias", new { channels = new { push = true }, quietHours = new { enabled = true, start = "22:00", end = "06:00" } });
            Assert.Equal(HttpStatusCode.OK, cambiada.StatusCode);
            Assert.True((await cambiada.Content.ReadFromJsonAsync<PreferenciasDto>())!.Channels["push"]);
            Assert.Equal(HttpStatusCode.BadRequest, (await ana.PutAsJsonAsync("/api/notificaciones/preferencias", new { digest = "cada minuto" })).StatusCode);

            Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsJsonAsync("/api/notificaciones/dispositivos", new { token = "ExponentPushToken[xyz]", plataforma = "android" })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await ana.PostAsJsonAsync("/api/notificaciones/dispositivos", new { token = "cualquier-cosa-larga", plataforma = "android" })).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await ana.DeleteAsync("/api/notificaciones/dispositivos?token=ExponentPushToken[xyz]")).StatusCode);

            var resumen = (await ana.GetFromJsonAsync<ResumenNotificacionesDto>("/api/notificaciones/resumen"))!;
            Assert.Equal(0, resumen.Unread);
            Assert.Equal(HttpStatusCode.BadRequest, (await ana.PostAsJsonAsync("/api/notificaciones/leer", new { ids = Array.Empty<string>() })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await ana.PostAsync("/api/notificaciones/leer-todas", null)).StatusCode);
        }
    }
}
