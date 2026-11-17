using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.Tests
{
    public class ReproduccionTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        private sealed class Granja
        {
            public Guid Dueno; public string Corral = "", Gallina = "", Gallo = "", Incubacion = "";
        }

        private static async Task<Granja> Preparar(EntornoMercado e, string nombre = "Ana")
        {
            var g = new Granja { Dueno = await e.Persona(nombre) };
            g.Corral = (await e.Granja.CrearGallineroAsync(g.Dueno, new GallineroDto { Name = "Corral", Capacity = 20 })).Id;
            g.Gallina = (await e.Granja.CrearAveAsync(g.Dueno, new AveDto { Name = "Nube", Sex = "Gallina", CoopId = g.Corral, Breed = "Brahma" })).Id;
            g.Gallo = (await e.Granja.CrearAveAsync(g.Dueno, new AveDto { Name = "Bruno", Sex = "Gallo", CoopId = g.Corral, Breed = "Brahma" })).Id;
            g.Incubacion = (await e.Granja.CrearIncubacionAsync(g.Dueno, new IncubacionDto { Type = "Natural", HenId = g.Gallina, CoopId = g.Corral, StartedAt = "2026-10-01", Eggs = 8, Status = "En curso" })).Id;
            return g;
        }

        private static JsonArray Lista(JsonObject doc, string nombre) => doc[nombre]!.AsArray();

        // ---------- nacimientos ----------

        [Fact]
        public async Task Nacimiento_CreaSuLoteDePollitosYSePuedeEditarYBorrarMientrasNoSeVenda()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            await Falla(e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = "no-existe", Date = "2026-10-22", Count = 3 }), 400);
            await Falla(e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 0 }), 400);
            await Falla(e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = g.Incubacion, Date = "22/10/2026", Count = 3 }), 400);
            await Falla(e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 3, MotherId = "fantasma" }), 400);

            var r = await e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 5, MotherId = g.Gallina, Breed = "Cruce Brahma", CoopId = g.Corral, ParentageStatus = "Probable" });
            Assert.StartsWith("nac-", r.Id);
            Assert.Matches(@"^POL-\d{4}-[0-9A-F]{8}$", r.Codigo);

            var doc = await e.Doc(g.Dueno);
            var lote = Lista(doc, "chickLots").OfType<JsonObject>().Single();
            Assert.Equal(r.Id, (string)lote["birthId"]!);
            Assert.Equal(5, (int)lote["initial"]!);
            Assert.Equal(5, (int)lote["available"]!);
            Assert.Equal("Cruce Brahma", (string)lote["breed"]!);
            Assert.NotEqual(r.Codigo, (string)lote["code"]!);

            await e.Granja.ActualizarNacimientoAsync(g.Dueno, r.Id, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 6, Breed = "", CoopId = g.Corral });
            lote = Lista(await e.Doc(g.Dueno), "chickLots").OfType<JsonObject>().Single();
            Assert.Equal(6, (int)lote["available"]!);
            Assert.Equal("Sin clasificar", (string)lote["breed"]!);
            var fila = Lista(await e.Doc(g.Dueno), "births").OfType<JsonObject>().Single();
            Assert.False(fila.ContainsKey("parentageStatus"));
            await Falla(e.Granja.ActualizarNacimientoAsync(g.Dueno, r.Id, new NacimientoDto { IncubationId = "otra", Date = "2026-10-22", Count = 6 }), 400);

            // Con pollitos ya vendidos el nacimiento se conserva.
            var granja = e.Base.Contexto.GranjaEs.Single(x => x.IdUsuario == g.Dueno);
            var edit = JsonNode.Parse(granja.Datos)!.AsObject();
            var l = edit["chickLots"]!.AsArray()[0]!.AsObject();
            l["sold"] = 2; l["available"] = 4;
            granja.Datos = edit.ToJsonString();
            await e.Base.Contexto.SaveChangesAsync();
            await Falla(e.Granja.EliminarNacimientoAsync(g.Dueno, r.Id), 409);
            await Falla(e.Granja.ActualizarNacimientoAsync(g.Dueno, r.Id, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 9 }), 409);
            await Falla(e.Granja.EliminarIncubacionAsync(g.Dueno, g.Incubacion), 409);
        }

        [Fact]
        public async Task Nacimiento_SinVentasSeBorraConSuLote()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            var r = await e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 2 });
            await e.Granja.EliminarNacimientoAsync(g.Dueno, r.Id);
            var doc = await e.Doc(g.Dueno);
            Assert.Empty(Lista(doc, "births"));
            Assert.Empty(Lista(doc, "chickLots"));
        }

        // ---------- grupos reproductores ----------

        [Fact]
        public async Task GrupoReproductor_ValidaSusMiembrosYGuardaElHistorial()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            string segunda = (await e.Granja.CrearAveAsync(g.Dueno, new AveDto { Name = "Sol", Sex = "Gallina", CoopId = g.Corral })).Id;
            string otroGallo = (await e.Granja.CrearAveAsync(g.Dueno, new AveDto { Name = "Tizón", Sex = "Gallo", CoopId = g.Corral })).Id;

            await Falla(e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Primavera", RoosterId = g.Gallina, HenIds = [g.Gallina], StartedAt = "2026-10-01" }), 400);
            await Falla(e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Primavera", RoosterId = g.Gallo, HenIds = [g.Gallo], StartedAt = "2026-10-01" }), 400);
            await Falla(e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Primavera", RoosterId = g.Gallo, HenIds = [], StartedAt = "2026-10-01" }), 400);
            await Falla(e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Primavera", RoosterId = g.Gallo, HenIds = [g.Gallina], StartedAt = "2026-10-10", EndedAt = "2026-10-01" }), 400);

            var r = await e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Primavera", RoosterId = g.Gallo, HenIds = [g.Gallina, g.Gallina, segunda], StartedAt = "2026-10-01", CoopId = g.Corral });
            Assert.Matches(@"^REP-\d{4}-[0-9A-F]{8}$", r.Codigo);
            var fila = Lista(await e.Doc(g.Dueno), "breedingGroups").OfType<JsonObject>().Single();
            Assert.Equal(2, fila["henIds"]!.AsArray().Count);
            Assert.Equal("Activo", (string)fila["status"]!);
            Assert.Single(fila["membershipHistory"]!.AsArray());

            // Cambiar al gallo cierra el periodo anterior y abre uno nuevo.
            await e.Granja.ActualizarGrupoReproductorAsync(g.Dueno, r.Id, new GrupoReproductorDto { Name = "Primavera", RoosterId = otroGallo, HenIds = [g.Gallina, segunda], StartedAt = "2026-10-01" });
            fila = Lista(await e.Doc(g.Dueno), "breedingGroups").OfType<JsonObject>().Single();
            var historia = fila["membershipHistory"]!.AsArray();
            Assert.Equal(2, historia.Count);
            Assert.Equal(g.Gallo, (string)historia[0]!["roosterId"]!);
            Assert.NotNull(historia[0]!["to"]);
            Assert.Equal(otroGallo, (string)historia[1]!["roosterId"]!);
            Assert.Null(historia[1]!["to"]);

            // Un cambio que no toca a los miembros no suma periodos.
            await e.Granja.ActualizarGrupoReproductorAsync(g.Dueno, r.Id, new GrupoReproductorDto { Name = "Primavera 2026", RoosterId = otroGallo, HenIds = [segunda, g.Gallina], StartedAt = "2026-10-01" });
            Assert.Equal(2, Lista(await e.Doc(g.Dueno), "breedingGroups").OfType<JsonObject>().Single()["membershipHistory"]!.AsArray().Count);
        }

        [Fact]
        public async Task GrupoReproductor_ConHuevosRegistradosNoSeElimina()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            var grupo = await e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Uno", RoosterId = g.Gallo, HenIds = [g.Gallina], StartedAt = "2026-10-01" });
            var vacio = await e.Granja.CrearGrupoReproductorAsync(g.Dueno, new GrupoReproductorDto { Name = "Dos", RoosterId = g.Gallo, HenIds = [g.Gallina], StartedAt = "2026-10-01" });
            await e.Granja.CrearRecoleccionAsync(g.Dueno, new RecoleccionDto { Date = "2026-10-10", CoopId = g.Corral, BreedingGroupId = grupo.Id, Eggs = 4 });
            await Falla(e.Granja.EliminarGrupoReproductorAsync(g.Dueno, grupo.Id), 409);
            await e.Granja.EliminarGrupoReproductorAsync(g.Dueno, vacio.Id);
        }

        // ---------- anillos ----------

        [Fact]
        public async Task Anillos_UnNumeroUnAveYHistorial()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 0, BirdId = g.Gallina }), 400);
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 101, BirdId = g.Gallina }), 400);
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = "fantasma" }), 400);
            await e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = g.Gallina });
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = g.Gallina }), 409);
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = g.Gallo }), 409);
            await Falla(e.Granja.InhabilitarAnilloAsync(g.Dueno, new InhabilitarAnilloDto { Number = 7 }), 409);

            // Cambiar de anillo retira el anterior y lo deja en el historial.
            await e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 8, BirdId = g.Gallina });
            var anillos = Lista(await e.Doc(g.Dueno), "rings").OfType<JsonObject>().ToList();
            Assert.Equal("Asignado", (string)anillos.Single(a => (int)a["number"]! == 8)["status"]!);
            var anterior = anillos.Single(a => (int)a["number"]! == 7);
            Assert.Equal("Retirado", (string)anterior["status"]!);
            Assert.NotNull(anterior["endedAt"]);

            await e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = g.Gallo });
            await Falla(e.Granja.RetirarAnilloAsync(g.Dueno, new RetirarAnilloDto { BirdId = g.Incubacion }), 409);
            await e.Granja.RetirarAnilloAsync(g.Dueno, new RetirarAnilloDto { BirdId = g.Gallo });
            await Falla(e.Granja.RetirarAnilloAsync(g.Dueno, new RetirarAnilloDto { BirdId = g.Gallo }), 409);

            // Un número puede quedar fuera de uso y volver.
            await e.Granja.InhabilitarAnilloAsync(g.Dueno, new InhabilitarAnilloDto { Number = 7, Notes = "Se rompió" });
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = g.Gallo }), 409);
            await Falla(e.Granja.InhabilitarAnilloAsync(g.Dueno, new InhabilitarAnilloDto { Number = 7 }), 409);
            await Falla(e.Granja.ActivarAnilloAsync(g.Dueno, new ActivarAnilloDto { Number = 9 }), 409);
            await e.Granja.ActivarAnilloAsync(g.Dueno, new ActivarAnilloDto { Number = 7 });
            await e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 7, BirdId = g.Gallo });
        }

        [Fact]
        public async Task Anillos_UnAveVendidaNoRecibeAnillo()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            await e.Granja.ActualizarAveAsync(g.Dueno, g.Gallo, new AveDto { Name = "Bruno", Sex = "Gallo", CoopId = g.Corral, Status = "Fallecido" });
            await Falla(e.Granja.AsignarAnilloAsync(g.Dueno, new AsignarAnilloDto { Number = 3, BirdId = g.Gallo }), 400);
        }

        // ---------- eventos del ave ----------

        [Fact]
        public async Task EventosDelAve_SeValidanYQuedanEnLaFicha()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            await Falla(e.Granja.RegistrarEventoAveAsync(g.Dueno, new EventoAveDto { BirdId = "fantasma", Kind = "Salud", Date = "2026-10-20", Title = "Revisión" }), 400);
            await Falla(e.Granja.RegistrarEventoAveAsync(g.Dueno, new EventoAveDto { BirdId = g.Gallina, Kind = "Otro", Date = "2026-10-20", Title = "Revisión" }), 400);
            await Falla(e.Granja.RegistrarEventoAveAsync(g.Dueno, new EventoAveDto { BirdId = g.Gallina, Kind = "Salud", Date = "2030-01-01", Title = "Revisión" }), 400);
            await Falla(e.Granja.RegistrarEventoAveAsync(g.Dueno, new EventoAveDto { BirdId = g.Gallina, Kind = "Salud", Date = "2026-10-20", Title = "  " }), 400);
            await e.Granja.RegistrarEventoAveAsync(g.Dueno, new EventoAveDto { BirdId = g.Gallina, Kind = "Salud", Date = "2026-10-20", Title = " Revisión de patas ", Details = "Sin lesiones." });
            var evento = Lista(await e.Doc(g.Dueno), "birdEvents").OfType<JsonObject>().Single();
            Assert.Equal("Revisión de patas", (string)evento["title"]!);
            Assert.Equal(g.Gallina, (string)evento["birdId"]!);
        }

        // ---------- avisos que salen de los cambios ----------

        [Fact]
        public async Task LosCambiosDeLaGranjaGeneranAvisosUnaSolaVez()
        {
            using var e = new EntornoMercado();
            var g = await Preparar(e);
            await e.Granja.CrearNacimientoAsync(g.Dueno, new NacimientoDto { IncubationId = g.Incubacion, Date = "2026-10-22", Count = 4, MotherId = g.Gallina });
            await e.Granja.ActualizarIncubacionAsync(g.Dueno, g.Incubacion, new IncubacionDto { Type = "Natural", HenId = g.Gallina, CoopId = g.Corral, StartedAt = "2026-10-01", Eggs = 8, Hatched = 4, Removed = 1, Status = "Finalizada" });
            await e.Granja.ActualizarAveAsync(g.Dueno, g.Gallo, new AveDto { Name = "Bruno", Sex = "Gallo", CoopId = g.Corral, Status = "Fallecido" });
            await e.Notificaciones.ProcesarSalidaAsync();

            var avisos = await e.Avisos.ListarAsync(g.Dueno, null, null, null, null);
            Assert.Contains(avisos, a => a.Type == "birth.recorded" && a.Body == "Registraste 4 pollitos de Nube.");
            Assert.Contains(avisos, a => a.Type == "incubation.unhatched" && a.Body.Contains("4 pollitos nacidos de 8 huevos; 4 no eclosionaron"));
            Assert.Contains(avisos, a => a.Type == "bird.deceased" && a.Body.StartsWith("Se registró la baja de Bruno"));

            // Guardar sin cambios relevantes no repite nada.
            await e.Granja.ActualizarGallineroAsync(g.Dueno, g.Corral, new GallineroDto { Name = "Corral nuevo", Capacity = 20 });
            Assert.Equal(0, (await e.Notificaciones.ProcesarSalidaAsync()).Procesados);
        }
    }
}
