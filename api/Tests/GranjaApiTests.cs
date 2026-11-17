using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using PicoCriollo.Domain.DTOs;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.DTOs.UsuarioD;

namespace PicoCriollo.Tests
{
    /// <summary>«Mi granja» por HTTP: autorización con token, formato de errores y el recorrido de un cambio.</summary>
    public class GranjaApiTests : IClassFixture<ApiFactory>
    {
        private readonly ApiFactory _fabrica;
        public GranjaApiTests(ApiFactory fabrica) => _fabrica = fabrica;

        private async Task<HttpClient> ClienteConSesion(string correo)
        {
            var cliente = _fabrica.CreateClient();
            var registro = await cliente.PostAsJsonAsync("/api/auth/registro", new { correo, password = "una-clave-bien-larga-1", nombreUsuario = $"Granja {correo[..4]}" });
            var sesion = (await registro.Content.ReadFromJsonAsync<InicioRespuestaDto>())!;
            cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.Token);
            return cliente;
        }

        [Fact]
        public async Task SinTokenNoHayAccesoANingunaRuta()
        {
            using var cliente = _fabrica.CreateClient();
            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.GetAsync("/api/granja")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.PostAsJsonAsync("/api/granja/gallineros", new { name = "A", capacity = 1 })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await cliente.DeleteAsync("/api/granja/aves/x")).StatusCode);
        }

        [Fact]
        public async Task RecorridoCompleto_GallineroAveRecoleccionYConsulta()
        {
            using var cliente = await ClienteConSesion("recorrido@correo.test");
            var inicial = (await cliente.GetFromJsonAsync<GranjaDto>("/api/granja"))!;
            Assert.Equal(1, inicial.Version);
            Assert.Equal(0, inicial.Datos.GetProperty("coops").GetArrayLength());

            var gallinero = await cliente.PostAsJsonAsync("/api/granja/gallineros", new { name = "La Arboleda", capacity = 42, type = "Pastoril" });
            Assert.Equal(HttpStatusCode.OK, gallinero.StatusCode);
            var g = (await gallinero.Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;
            Assert.Equal(2, g.Version);

            var ave = await cliente.PostAsJsonAsync("/api/granja/aves", new { name = "Luna", sex = "Gallina", coopId = g.Id, breed = "Brahma" });
            var a = (await ave.Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;
            Assert.StartsWith("ave-", a.Id);

            var recoleccion = await cliente.PostAsJsonAsync("/api/granja/recolecciones", new { date = "2026-10-22", coopId = g.Id, henId = a.Id, eggs = 5, consumption = 2 });
            Assert.Equal(HttpStatusCode.OK, recoleccion.StatusCode);

            var granja = (await cliente.GetFromJsonAsync<GranjaDto>("/api/granja"))!;
            Assert.Equal(4, granja.Version);
            Assert.Equal("Luna", granja.Datos.GetProperty("birds")[0].GetProperty("name").GetString());
            Assert.Equal(5, granja.Datos.GetProperty("eggs")[0].GetProperty("eggs").GetInt32());
        }

        [Fact]
        public async Task LosErroresSalenConElFormatoDeSiempre()
        {
            using var cliente = await ClienteConSesion("errores2@correo.test");
            var invalida = await cliente.PostAsJsonAsync("/api/granja/gallineros", new { name = "A", capacity = 0 });
            Assert.Equal(HttpStatusCode.BadRequest, invalida.StatusCode);
            var cuerpo = (await invalida.Content.ReadFromJsonAsync<RespuestaDto>())!;
            Assert.False(cuerpo.Respuesta);
            Assert.Contains("Capacidad de aves", cuerpo.Mensaje);

            var sinNombre = await cliente.PostAsJsonAsync("/api/granja/gallineros", new { capacity = 5 });
            Assert.Equal(HttpStatusCode.BadRequest, sinNombre.StatusCode);
            Assert.Equal("Escribe el nombre del gallinero.", (await sinNombre.Content.ReadFromJsonAsync<RespuestaDto>())!.Mensaje);

            var noExiste = await cliente.DeleteAsync("/api/granja/gallineros/no-existe");
            Assert.Equal(HttpStatusCode.NotFound, noExiste.StatusCode);

            var g = (await (await cliente.PostAsJsonAsync("/api/granja/gallineros", new { name = "Uno", capacity = 5 })).Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;
            await cliente.PostAsJsonAsync("/api/granja/aves", new { name = "Luna", sex = "Gallina", coopId = g.Id });
            var conflicto = await cliente.DeleteAsync($"/api/granja/gallineros/{g.Id}");
            Assert.Equal(HttpStatusCode.Conflict, conflicto.StatusCode);
            Assert.Contains("aves asociadas", (await conflicto.Content.ReadFromJsonAsync<RespuestaDto>())!.Mensaje);
        }

        [Fact]
        public async Task CadaPersonaSoloVeYCambiaSuGranja()
        {
            using var ana = await ClienteConSesion("ana.granja@correo.test");
            using var beto = await ClienteConSesion("beto.granja@correo.test");
            var gAna = (await (await ana.PostAsJsonAsync("/api/granja/gallineros", new { name = "De Ana", capacity = 5 })).Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;

            var granjaBeto = (await beto.GetFromJsonAsync<GranjaDto>("/api/granja"))!;
            Assert.Equal(0, granjaBeto.Datos.GetProperty("coops").GetArrayLength());
            Assert.Equal(HttpStatusCode.NotFound, (await beto.DeleteAsync($"/api/granja/gallineros/{gAna.Id}")).StatusCode);
            var aveBeto = await beto.PostAsJsonAsync("/api/granja/aves", new { name = "Intrusa", sex = "Gallina", coopId = gAna.Id });
            Assert.Equal(HttpStatusCode.BadRequest, aveBeto.StatusCode);   // el gallinero de Ana no existe para Beto
        }

        [Fact]
        public async Task InventarioPorHttp_CompraConsumoYTarea()
        {
            using var cliente = await ClienteConSesion("inventario@correo.test");
            var g = (await (await cliente.PostAsJsonAsync("/api/granja/gallineros", new { name = "Uno", capacity = 5 })).Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;
            await cliente.PostAsJsonAsync("/api/granja/compras", new { date = "2026-10-10", product = "Maíz triturado", category = "Maíz triturado", quantity = 25, unit = "kg", unitPrice = 2400 });
            var granja = (await cliente.GetFromJsonAsync<GranjaDto>("/api/granja"))!;
            string stockId = granja.Datos.GetProperty("stock")[0].GetProperty("id").GetString()!;
            Assert.Equal(25m, granja.Datos.GetProperty("stock")[0].GetProperty("quantity").GetDecimal());

            Assert.Equal(HttpStatusCode.BadRequest, (await cliente.PostAsJsonAsync("/api/granja/consumos", new { stockId, quantity = 99, date = "2026-10-12" })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await cliente.PostAsJsonAsync("/api/granja/consumos", new { stockId, quantity = 5, date = "2026-10-12" })).StatusCode);

            var tarea = (await (await cliente.PostAsJsonAsync("/api/granja/tareas", new { title = "Limpiar", coopId = g.Id, frequencyDays = 3, nextDue = "2026-10-22", stockId, supplies = 2 })).Content.ReadFromJsonAsync<RegistroGuardadoDto>())!;
            var completada = await cliente.PostAsJsonAsync($"/api/granja/tareas/{tarea.Id}/completar", new { hoy = "2026-10-22" });
            Assert.Equal(HttpStatusCode.OK, completada.StatusCode);
            var final = (await cliente.GetFromJsonAsync<GranjaDto>("/api/granja"))!;
            Assert.Equal(18m, final.Datos.GetProperty("stock")[0].GetProperty("quantity").GetDecimal());
            Assert.Equal("2026-10-25", final.Datos.GetProperty("maintenance")[0].GetProperty("nextDue").GetString());

            // Completar sin cuerpo también funciona (usa la fecha del servidor).
            var sinCuerpo = await cliente.PostAsync($"/api/granja/tareas/{tarea.Id}/completar", null);
            Assert.Equal(HttpStatusCode.OK, sinCuerpo.StatusCode);
        }

        [Fact]
        public async Task ElContratoPublicaLasRutasDeGranja()
        {
            using var cliente = _fabrica.CreateClient();
            using var json = JsonDocument.Parse(await cliente.GetStringAsync("/openapi/v1.json"));
            var rutas = json.RootElement.GetProperty("paths").EnumerateObject().Select(p => p.Name).ToList();
            foreach (string ruta in new[] { "/api/granja", "/api/granja/gallineros", "/api/granja/aves/{id}", "/api/granja/recolecciones", "/api/granja/incubaciones", "/api/granja/compras", "/api/granja/consumos", "/api/granja/tareas/{id}/completar" })
                Assert.Contains(ruta, rutas);
        }
    }
}
