using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PicoCriollo.Domain.DTOs;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.Infrastructure;

namespace PicoCriollo.Tests
{
    /// <summary>La API completa (controladores, filtros, JWT, límites) sobre una base en memoria.</summary>
    public class ApiFactory : WebApplicationFactory<Program>
    {
        private readonly string _base = Guid.NewGuid().ToString();

        protected override void ConfigureWebHost(IWebHostBuilder constructor)
        {
            constructor.UseSetting("Base:AplicarEsquema", "false");
            constructor.UseSetting("Mercado:CierreAutomatico", "false");
            constructor.UseSetting("Notificaciones:Automaticas", "false");
            constructor.ConfigureServices(servicios =>
            {
                servicios.RemoveAll<DbContextOptions<DBContext>>();
                servicios.RemoveAll<IDbContextOptionsConfiguration<DBContext>>();
                servicios.AddDbContext<DBContext>(o => o.UseInMemoryDatabase(_base));
            });
        }
    }

    public class AuthApiTests : IClassFixture<ApiFactory>
    {
        private readonly ApiFactory _fabrica;
        public AuthApiTests(ApiFactory fabrica) => _fabrica = fabrica;

        private static object Registro(string correo, string nombre) =>
            new { correo, password = "una-clave-bien-larga-1", nombreUsuario = nombre, ciudad = "Medellín", departamento = "Antioquia" };

        [Fact]
        public async Task FlujoCompleto_RegistroYoRefrescoYSalida()
        {
            using var cliente = _fabrica.CreateClient();
            var registro = await cliente.PostAsJsonAsync("/api/auth/registro", Registro("flujo@correo.test", "Flujo Completo"));
            Assert.Equal(HttpStatusCode.OK, registro.StatusCode);
            var sesion = (await registro.Content.ReadFromJsonAsync<InicioRespuestaDto>())!;
            Assert.True(sesion.Respuesta);

            // Sin token no hay acceso; con token, la API devuelve a la persona.
            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.GetAsync("/api/auth/yo")).StatusCode);
            cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.Token);
            var yo = (await cliente.GetFromJsonAsync<UsuarioDto>("/api/auth/yo"))!;
            Assert.Equal("flujo@correo.test", yo.Correo);
            Assert.Equal("Flujo Completo", yo.NombreUsuario);

            // Un token alterado se rechaza.
            cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.Token[..^3] + "abc");
            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.GetAsync("/api/auth/yo")).StatusCode);
            cliente.DefaultRequestHeaders.Authorization = null;

            var refresco = await cliente.PostAsJsonAsync("/api/auth/refrescar", new { refreshToken = sesion.RefreshToken });
            Assert.Equal(HttpStatusCode.OK, refresco.StatusCode);
            var nueva = (await refresco.Content.ReadFromJsonAsync<InicioRespuestaDto>())!;
            Assert.NotEqual(sesion.RefreshToken, nueva.RefreshToken);

            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.PostAsJsonAsync("/api/auth/refrescar", new { refreshToken = sesion.RefreshToken })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.PostAsJsonAsync("/api/auth/refrescar", new { refreshToken = nueva.RefreshToken })).StatusCode);
        }

        [Fact]
        public async Task Login_ErroresConElMismoFormatoYElCodigoCorrecto()
        {
            using var cliente = _fabrica.CreateClient();
            await cliente.PostAsJsonAsync("/api/auth/registro", Registro("errores@correo.test", "Con Errores"));

            var mala = await cliente.PostAsJsonAsync("/api/auth/login", new { correo = "errores@correo.test", password = "otra-clave-larga-9" });
            Assert.Equal(HttpStatusCode.Unauthorized, mala.StatusCode);
            var cuerpo = (await mala.Content.ReadFromJsonAsync<RespuestaDto>())!;
            Assert.False(cuerpo.Respuesta);
            Assert.Equal("Correo o contraseña incorrectos.", cuerpo.Mensaje);

            var repetido = await cliente.PostAsJsonAsync("/api/auth/registro", Registro("errores@correo.test", "Otro Nombre"));
            Assert.Equal(HttpStatusCode.Conflict, repetido.StatusCode);

            var corta = await cliente.PostAsJsonAsync("/api/auth/registro", new { correo = "c@correo.test", password = "corta", nombreUsuario = "Cortica" });
            Assert.Equal(HttpStatusCode.BadRequest, corta.StatusCode);
            Assert.Equal("La contraseña debe tener entre 12 y 128 caracteres.", (await corta.Content.ReadFromJsonAsync<RespuestaDto>())!.Mensaje);

            var vacio = await cliente.PostAsJsonAsync("/api/auth/login", new { });
            Assert.Equal(HttpStatusCode.BadRequest, vacio.StatusCode);
        }

        [Fact]
        public async Task OlvidoPassword_ResponderIgualExistaONoLaCuenta()
        {
            using var cliente = _fabrica.CreateClient();
            await cliente.PostAsJsonAsync("/api/auth/registro", Registro("olvido@correo.test", "Olvido Algo"));
            var existe = await cliente.PostAsJsonAsync("/api/auth/olvido-password", new { correo = "olvido@correo.test" });
            var noExiste = await cliente.PostAsJsonAsync("/api/auth/olvido-password", new { correo = "nadie@correo.test" });
            Assert.Equal(HttpStatusCode.OK, existe.StatusCode);
            Assert.Equal(HttpStatusCode.OK, noExiste.StatusCode);
            Assert.Equal((await existe.Content.ReadFromJsonAsync<RespuestaDto>())!.Mensaje, (await noExiste.Content.ReadFromJsonAsync<RespuestaDto>())!.Mensaje);
            Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostAsJsonAsync("/api/auth/olvido-password", new { correo = "no-es-correo" })).StatusCode);
        }

        [Fact]
        public async Task Restablecer_ConUnEnlaceFalsoDa400()
        {
            using var cliente = _fabrica.CreateClient();
            var r = await cliente.PostAsJsonAsync("/api/auth/restablecer-password", new { token = new string('a', 43), password = "clave-nueva-y-larga-2" });
            Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
            Assert.Contains("enlace", (await r.Content.ReadFromJsonAsync<RespuestaDto>())!.Mensaje);
        }

        [Fact]
        public async Task Health_ResponderOkConLaBaseDisponible()
        {
            using var cliente = _fabrica.CreateClient();
            Assert.Equal(HttpStatusCode.OK, (await cliente.GetAsync("/api/health")).StatusCode);
        }

        [Fact]
        public async Task SwaggerSePublicaEnDesarrollo()
        {
            using var cliente = _fabrica.CreateClient();
            var ui = await cliente.GetAsync("/swagger/index.html");
            Assert.Equal(HttpStatusCode.OK, ui.StatusCode);
            var json = await cliente.GetStringAsync("/swagger/v1/swagger.json");
            Assert.Contains("/api/auth/login", json);
        }

        [Fact]
        public async Task ElOpenApiSePublicaEnDesarrollo()
        {
            using var cliente = _fabrica.CreateClient();
            var r = await cliente.GetAsync("/openapi/v1.json");
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            string json = await r.Content.ReadAsStringAsync();
            Assert.Contains("/api/auth/login", json);
            Assert.Contains("/api/auth/restablecer-password", json);
        }
    }
}
