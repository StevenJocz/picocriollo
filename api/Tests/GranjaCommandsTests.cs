using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Mercado;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.Tests
{
    internal sealed class MercadoFalso : IMercadoGuardia
    {
        public Dictionary<string, Guid> Duenos { get; } = [];
        public HashSet<string> EnMercado { get; } = [];

        public async Task RegistrarAveAsync(Guid usuario, string aveId, DateTime ahoraUtc)
        {
            await Task.CompletedTask;
            if (Duenos.TryGetValue(aveId, out Guid dueno) && dueno != usuario) throw ReglaNegocioException.Conflicto("Esta ave ya está registrada en otra cuenta.");
            Duenos[aveId] = usuario;
        }

        public Task<bool> AveEnMercadoAsync(string aveId) => Task.FromResult(EnMercado.Contains(aveId));

        public Task RevisarPublicacionesAsync(Guid usuario, PicoCriollo.Domain.Utilidades.DocumentoGranja granja, DateTime ahoraUtc) => Task.CompletedTask;

        public Task EmitirCambiosAsync(Guid usuario, PicoCriollo.Domain.Utilidades.DocumentoGranja antes, PicoCriollo.Domain.Utilidades.DocumentoGranja despues, long version) => Task.CompletedTask;
    }

    /// <summary>Una cuenta con su granja vacía y los comandos de granja sobre la misma base en memoria.</summary>
    internal sealed class EntornoGranja : IDisposable
    {
        public Entorno Base { get; } = new();
        public MercadoFalso Mercado { get; } = new();
        public GranjaCommands Granja { get; }
        public Guid Usuario { get; private set; }

        public EntornoGranja() => Granja = new GranjaCommands(Base.Contexto, Mercado, Base.Reloj);

        public async Task<EntornoGranja> Iniciar()
        {
            var sesion = await Base.Registrar();
            Usuario = sesion.Datos!.Id;
            return this;
        }

        public async Task<JsonObject> Doc()
        {
            Base.Contexto.ChangeTracker.Clear();
            return (JsonObject)JsonNode.Parse((await Base.Contexto.GranjaEs.AsNoTracking().SingleAsync()).Datos)!;
        }

        public async Task<long> Version() => (await Base.Contexto.GranjaEs.AsNoTracking().SingleAsync()).Version;

        public async Task<JsonObject> Fila(string lista, string id) =>
            (await Doc())[lista]!.AsArray().OfType<JsonObject>().Single(f => (string?)f["id"] == id);

        public async Task PonerEnDoc(Action<JsonObject> cambio)
        {
            var granja = await Base.Contexto.GranjaEs.SingleAsync();
            var doc = (JsonObject)JsonNode.Parse(granja.Datos)!;
            cambio(doc);
            granja.Datos = doc.ToJsonString();
            await Base.Contexto.SaveChangesAsync();
            Base.Contexto.ChangeTracker.Clear();
        }

        public async Task<string> Gallinero(string nombre = "La Arboleda") =>
            (await Granja.CrearGallineroAsync(Usuario, new GallineroDto { Name = nombre, Capacity = 40 })).Id;

        public async Task<string> Ave(string coopId, string sexo = "Gallina", string nombre = "Luna", string? estado = null) =>
            (await Granja.CrearAveAsync(Usuario, new AveDto { Name = nombre, Sex = sexo, CoopId = coopId, Status = estado })).Id;

        public void Dispose() => Base.Dispose();
    }

    public class GranjaCommandsTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        // ---------- documento y versión ----------

        [Fact]
        public async Task CadaCambioSubeLaVersionYDevuelveElRegistro()
        {
            using var e = await new EntornoGranja().Iniciar();
            Assert.Equal(1, await e.Version());
            var r = await e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "  La Arboleda ", Capacity = 42, Type = "Pastoril" });
            Assert.StartsWith("gal-", r.Id);
            Assert.Matches(@"^GAL-0001-[0-9A-F]{8}$", r.Codigo);
            Assert.Equal(2, r.Version);
            Assert.Equal(2, await e.Version());
            var fila = await e.Fila("coops", r.Id);
            Assert.Equal("La Arboleda", (string?)fila["name"]);
            Assert.Equal(42, (int)fila["capacity"]!);
            Assert.Equal("Activo", (string?)fila["status"]);
        }

        [Fact]
        public async Task ConservaLosCamposYListasQueLaApiNoConoce()
        {
            using var e = await new EntornoGranja().Iniciar();
            string id = await e.Gallinero();
            await e.PonerEnDoc(doc =>
            {
                doc["coops"]!.AsArray().OfType<JsonObject>().Single()["campoDeOtraApp"] = "se queda";
                doc["sales"] = new JsonArray(new JsonObject { ["id"] = "venta-1" });
                doc["demoContent"] = new JsonObject { ["kind"] = "onboarding-sample" };
            });
            await e.Granja.ActualizarGallineroAsync(e.Usuario, id, new GallineroDto { Name = "Nuevo nombre", Capacity = 10 });
            var doc2 = await e.Doc();
            Assert.Equal("se queda", (string?)(await e.Fila("coops", id))["campoDeOtraApp"]);
            Assert.Equal("Nuevo nombre", (string?)(await e.Fila("coops", id))["name"]);
            Assert.Equal("venta-1", (string?)doc2["sales"]![0]!["id"]);
            Assert.Equal("onboarding-sample", (string?)doc2["demoContent"]!["kind"]);
        }

        [Fact]
        public async Task LaVersionEsUnTokenDeConcurrencia_UnaSesionConLaVersionVieja_NoPisaALaNueva()
        {
            using var e = await new EntornoGranja().Iniciar();
            using var otraSesion = new DBContext(e.Base.Opciones);
            var vieja = await otraSesion.GranjaEs.SingleAsync();           // la otra sesión leyó la versión 1…
            await e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "Cambio nuevo", Capacity = 5 });   // …mientras esta guardaba la 2
            vieja.Datos = "{}";
            vieja.Version += 1;
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => otraSesion.SaveChangesAsync());
            Assert.Contains("Cambio nuevo", (await e.Base.Contexto.GranjaEs.AsNoTracking().SingleAsync()).Datos);
        }

        [Fact]
        public async Task SinGranjaDevuelve404()
        {
            using var e = new EntornoGranja();
            await Falla(e.Granja.CrearGallineroAsync(Guid.NewGuid(), new GallineroDto { Name = "X", Capacity = 1 }), 404);
        }

        // ---------- gallineros ----------

        [Fact]
        public async Task Gallinero_ValidaCapacidadTipoEstadoYFecha()
        {
            using var e = await new EntornoGranja().Iniciar();
            await Falla(e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "A", Capacity = 0 }), 400);
            await Falla(e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "A", Capacity = 5, Type = "Volador" }), 400);
            await Falla(e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "A", Capacity = 5, Status = "Roto" }), 400);
            await Falla(e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "A", Capacity = 5, StartedAt = "ayer" }), 400);
            await Falla(e.Granja.CrearGallineroAsync(e.Usuario, new GallineroDto { Name = "  ", Capacity = 5 }), 400);
            Assert.Equal(1, await e.Version());   // nada de eso guardó nada
        }

        [Fact]
        public async Task Gallinero_NoSeEliminaConAvesPeroSiVacio()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            await e.Ave(coop);
            await Falla(e.Granja.EliminarGallineroAsync(e.Usuario, coop), 409);
            string vacio = await e.Gallinero("Vacío");
            await e.Granja.EliminarGallineroAsync(e.Usuario, vacio);
            Assert.DoesNotContain((await e.Doc())["coops"]!.AsArray().OfType<JsonObject>(), f => (string?)f["id"] == vacio);
            await Falla(e.Granja.EliminarGallineroAsync(e.Usuario, vacio), 404);
        }

        // ---------- aves ----------

        [Fact]
        public async Task Ave_RequiereGallineroExistenteYRegistraLaPropiedad()
        {
            using var e = await new EntornoGranja().Iniciar();
            await Falla(e.Granja.CrearAveAsync(e.Usuario, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = "no-existe" }), 400);
            await Falla(e.Granja.CrearAveAsync(e.Usuario, new AveDto { Name = "Luna", Sex = "Loro", CoopId = "x" }), 400);
            string coop = await e.Gallinero();
            var r = await e.Granja.CrearAveAsync(e.Usuario, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, Breed = "Brahma", Species = "gallina" });
            Assert.Matches(@"^AVE-0002-[0-9A-F]{8}$", r.Codigo);   // el orden cuenta también el código del gallinero
            Assert.Equal(e.Usuario, e.Mercado.Duenos[r.Id]);
            var fila = await e.Fila("birds", r.Id);
            Assert.Equal("Activo", (string?)fila["status"]);
            Assert.Equal("gallina", (string?)fila["species"]);
        }

        [Fact]
        public async Task Ave_UnaDeOtraCuentaNoSePuedeRegistrar()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            // Se anticipa el id que va a generar... no se puede: se prueba la regla del guardián directamente con un ave ya de otro.
            await e.Mercado.RegistrarAveAsync(Guid.NewGuid(), "ave-ajena", DateTime.UtcNow);
            await Falla(e.Mercado.RegistrarAveAsync(e.Usuario, "ave-ajena", DateTime.UtcNow), 409);
            _ = coop;
        }

        [Fact]
        public async Task Ave_ElEstadoTransferidoLoAsignaSoloElSistemaYNoSePuedeTocarUnaTransferida()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            await Falla(e.Granja.CrearAveAsync(e.Usuario, new AveDto { Name = "X", Sex = "Gallo", CoopId = coop, Status = "Transferido" }), 409);
            string id = await e.Ave(coop);
            await Falla(e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, Status = "Transferido" }), 409);
            await e.PonerEnDoc(doc => doc["birds"]!.AsArray().OfType<JsonObject>().Single()["status"] = "Transferido");
            await Falla(e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop }), 409);
            await Falla(e.Granja.EliminarAveAsync(e.Usuario, id), 409);
        }

        [Fact]
        public async Task Ave_UnaPublicadaNoPasaAVendidaNiFallecidaNiSeElimina()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string id = await e.Ave(coop);
            e.Mercado.EnMercado.Add(id);
            var vendida = await Falla(e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, Status = "Vendido" }), 409);
            Assert.Contains("está en el mercado", vendida.Message);
            await Falla(e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, Status = "Fallecido" }), 409);
            await Falla(e.Granja.EliminarAveAsync(e.Usuario, id), 409);
            // Otros cambios sí se permiten.
            await e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna Nueva", Sex = "Gallina", CoopId = coop, Status = "En reproducción" });
            e.Mercado.EnMercado.Clear();
            await e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna Nueva", Sex = "Gallina", CoopId = coop, Status = "Vendido" });
        }

        [Fact]
        public async Task Ave_AlSerVendidaOFallecerSuAnilloSeRetira()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string id = await e.Ave(coop);
            await e.PonerEnDoc(doc => doc["rings"] = new JsonArray(new JsonObject { ["id"] = "ring-1", ["number"] = 7, ["birdId"] = id, ["status"] = "Asignado", ["assignedAt"] = "2026-01-01" }));
            await e.Granja.ActualizarAveAsync(e.Usuario, id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, Status = "Fallecido" });
            var anillo = (await e.Doc())["rings"]![0]!;
            Assert.Equal("Retirado", (string?)anillo["status"]);
            Assert.Equal("2026-10-22", (string?)anillo["endedAt"]);
        }

        [Fact]
        public async Task Ave_ConHistorialNoSeEliminaYSinElSi()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string gallina = await e.Ave(coop);
            string libre = await e.Ave(coop, nombre: "Libre");
            await e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, HenId = gallina, Eggs = 3 });
            var ex = await Falla(e.Granja.EliminarAveAsync(e.Usuario, gallina), 409);
            Assert.Contains("historial", ex.Message);
            await e.Granja.EliminarAveAsync(e.Usuario, libre);
            Assert.DoesNotContain((await e.Doc())["birds"]!.AsArray().OfType<JsonObject>(), f => (string?)f["id"] == libre);
        }

        [Fact]
        public async Task Ave_NoPuedeSerSuPropiaMadre_YLaEspecieEnBlancoSeQuita()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            var r = await e.Granja.CrearAveAsync(e.Usuario, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, Species = "gallina" });
            await Falla(e.Granja.ActualizarAveAsync(e.Usuario, r.Id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, MotherId = r.Id }), 400);
            await Falla(e.Granja.ActualizarAveAsync(e.Usuario, r.Id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop, FatherId = "no-existe" }), 400);
            await e.Granja.ActualizarAveAsync(e.Usuario, r.Id, new AveDto { Name = "Luna", Sex = "Gallina", CoopId = coop });
            Assert.False((await e.Fila("birds", r.Id)).ContainsKey("species"));
        }

        // ---------- recolección ----------

        [Fact]
        public async Task Recoleccion_ValidaLaRepartoYLaGallina()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string gallo = await e.Ave(coop, "Gallo", "Tizón");
            await Falla(e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, Eggs = 4, Incubation = 2, Consumption = 2, Sale = 1 }), 400);
            await Falla(e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, Eggs = 4, Broken = 5 }), 400);
            await Falla(e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, HenId = gallo, Eggs = 4 }), 400);
            await Falla(e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = "no", Eggs = 4 }), 400);
            await Falla(e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "20/10/2026", CoopId = coop, Eggs = 4 }), 400);
            var ok = await e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, Eggs = 4, Incubation = 2, Consumption = 1, Sale = 1, Broken = 1 });
            Assert.StartsWith("HUE-", ok.Codigo);
        }

        [Fact]
        public async Task Recoleccion_GuardaUnaFotoDelGrupoReproductor()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            await e.PonerEnDoc(doc => doc["breedingGroups"] = new JsonArray(new JsonObject { ["id"] = "grupo-1", ["roosterId"] = "gallo-1", ["henIds"] = new JsonArray("h1", "h2") }));
            var r = await e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, BreedingGroupId = "grupo-1", Eggs = 3 });
            var foto = (await e.Fila("eggs", r.Id))["groupSnapshot"]!;
            Assert.Equal("gallo-1", (string?)foto["roosterId"]);
            Assert.Equal(["h1", "h2"], foto["henIds"]!.AsArray().Select(x => (string)x!).ToArray());
            Assert.Equal("2026-10-20", (string?)foto["capturedAt"]);
        }

        [Fact]
        public async Task Recoleccion_NoSeEliminaSiDeElLaSalieronLotes()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            var r = await e.Granja.CrearRecoleccionAsync(e.Usuario, new RecoleccionDto { Date = "2026-10-20", CoopId = coop, Eggs = 3 });
            await e.PonerEnDoc(doc => doc["fertileLots"] = new JsonArray(new JsonObject { ["id"] = "lote-1", ["sourceCollectionId"] = r.Id }));
            await Falla(e.Granja.EliminarRecoleccionAsync(e.Usuario, r.Id), 409);
            await e.PonerEnDoc(doc => doc["fertileLots"] = new JsonArray());
            await e.Granja.EliminarRecoleccionAsync(e.Usuario, r.Id);
        }

        // ---------- incubación ----------

        private static IncubacionDto Incub(string coop, string? gallina, string estado = "En curso", int huevos = 8) =>
            new() { Type = "Natural", HenId = gallina, CoopId = coop, StartedAt = "2026-10-10", Eggs = huevos, Status = estado };

        [Fact]
        public async Task Incubacion_NaturalNecesitaUnaGallinaYLaDejaClueca()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string gallina = await e.Ave(coop);
            string gallo = await e.Ave(coop, "Gallo", "Tizón");
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, Incub(coop, null)), 400);
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, Incub(coop, gallo)), 400);
            var r = await e.Granja.CrearIncubacionAsync(e.Usuario, Incub(coop, gallina));
            Assert.StartsWith("INC-", r.Codigo);
            Assert.Equal("Clueca", (string?)(await e.Fila("birds", gallina))["status"]);
            var fila = await e.Fila("incubations", r.Id);
            Assert.NotNull((string?)fila["updatedAt"]);
            Assert.Empty(fila["sourceLotIds"]!.AsArray());

            await e.Granja.ActualizarIncubacionAsync(e.Usuario, r.Id, Incub(coop, gallina, "Finalizada"));
            Assert.Equal("Activo", (string?)(await e.Fila("birds", gallina))["status"]);
        }

        [Fact]
        public async Task Incubacion_AlCambiarDeGallinaLaVieja_VuelveAActivo()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string luna = await e.Ave(coop, nombre: "Luna");
            string nube = await e.Ave(coop, nombre: "Nube");
            var r = await e.Granja.CrearIncubacionAsync(e.Usuario, Incub(coop, luna));
            await e.Granja.ActualizarIncubacionAsync(e.Usuario, r.Id, Incub(coop, nube));
            Assert.Equal("Activo", (string?)(await e.Fila("birds", luna))["status"]);
            Assert.Equal("Clueca", (string?)(await e.Fila("birds", nube))["status"]);
        }

        [Fact]
        public async Task Incubacion_ValidaCantidadesLotesYAjuste()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string gallina = await e.Ave(coop);
            long version = await e.Version();
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, Incub(coop, gallina, huevos: 0)), 400);
            var demasiados = Incub(coop, gallina);
            demasiados.Hatched = 6; demasiados.Removed = 3;
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, demasiados), 400);
            var conLotes = Incub(coop, gallina);
            conLotes.SourceLotIds = ["lote-1"];
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, conLotes), 400);
            var ajuste = Incub(coop, gallina);
            ajuste.HatchAdjustmentDays = 30;
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, ajuste), 400);
            var raro = Incub(coop, gallina, "Soñando");
            await Falla(e.Granja.CrearIncubacionAsync(e.Usuario, raro), 400);
            Assert.Equal(version, await e.Version());   // nada de eso guardó nada
        }

        [Fact]
        public async Task Incubacion_ConNacimientosNoSeEliminaYSiSeEliminaLaClueca_VuelveAActivo()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            string gallina = await e.Ave(coop);
            var r = await e.Granja.CrearIncubacionAsync(e.Usuario, Incub(coop, gallina));
            await e.PonerEnDoc(doc => doc["births"] = new JsonArray(new JsonObject { ["id"] = "nac-1", ["incubationId"] = r.Id }));
            await Falla(e.Granja.EliminarIncubacionAsync(e.Usuario, r.Id), 409);
            await e.PonerEnDoc(doc => doc["births"] = new JsonArray());
            await e.Granja.EliminarIncubacionAsync(e.Usuario, r.Id);
            Assert.Equal("Activo", (string?)(await e.Fila("birds", gallina))["status"]);
        }

        // ---------- compras e inventario ----------

        private static CompraDto Compra(string producto = "Concentrado ponedoras", decimal cantidad = 40, decimal precio = 2900) =>
            new() { Date = "2026-10-10", Product = producto, Category = "Alimento ponedoras", Quantity = cantidad, Unit = "kg", UnitPrice = precio };

        [Fact]
        public async Task Compra_CreaLaExistenciaYElMovimiento_YSumaSiElProductoYaExiste()
        {
            using var e = await new EntornoGranja().Iniciar();
            var r = await e.Granja.CrearCompraAsync(e.Usuario, Compra());
            Assert.StartsWith("com-", r.Id);
            Assert.Null(r.Codigo);
            await e.Granja.CrearCompraAsync(e.Usuario, Compra("concentrado PONEDORAS", 10));
            var doc = await e.Doc();
            var existencia = doc["stock"]!.AsArray().OfType<JsonObject>().Single();
            Assert.Equal(50m, DocumentoGranja.Numero(existencia["quantity"]));
            Assert.Equal(5, (int)existencia["minimum"]!);
            var movimientos = doc["movements"]!.AsArray().OfType<JsonObject>().ToList();
            Assert.Equal(2, movimientos.Count);
            Assert.All(movimientos, m => Assert.Equal("Compra", (string?)m["kind"]));
            Assert.Equal("Compra de Concentrado ponedoras · 116000 COP", (string?)movimientos[1]["notes"]);
        }

        [Fact]
        public async Task Compra_ValidaCantidadPrecioYCategoria()
        {
            using var e = await new EntornoGranja().Iniciar();
            await Falla(e.Granja.CrearCompraAsync(e.Usuario, Compra(cantidad: 0)), 400);
            await Falla(e.Granja.CrearCompraAsync(e.Usuario, Compra(precio: -1)), 400);
            var categoria = Compra(); categoria.Category = "Cosas";
            await Falla(e.Granja.CrearCompraAsync(e.Usuario, categoria), 400);
            var unidad = Compra(); unidad.Unit = "metro";
            await Falla(e.Granja.CrearCompraAsync(e.Usuario, unidad), 400);
            var sinProducto = Compra(" ");
            await Falla(e.Granja.CrearCompraAsync(e.Usuario, sinProducto), 400);
        }

        [Fact]
        public async Task Compra_AlEditarSeReviertenLasExistenciasConUnAjuste_YSiYaSeConsumioDa409()
        {
            using var e = await new EntornoGranja().Iniciar();
            var r = await e.Granja.CrearCompraAsync(e.Usuario, Compra(cantidad: 40));
            await e.Granja.ActualizarCompraAsync(e.Usuario, r.Id, Compra(cantidad: 30));
            var doc = await e.Doc();
            Assert.Equal(30m, DocumentoGranja.Numero(doc["stock"]![0]!["quantity"]));
            Assert.Contains(doc["movements"]!.AsArray().OfType<JsonObject>(), m => (string?)m["kind"] == "Ajuste" && DocumentoGranja.Numero(m["quantity"]) == -40m);

            string stockId = (string)doc["stock"]![0]!["id"]!;
            await e.Granja.RegistrarConsumoAsync(e.Usuario, new ConsumoDto { StockId = stockId, Quantity = 25, Date = "2026-10-12" });
            var ex = await Falla(e.Granja.ActualizarCompraAsync(e.Usuario, r.Id, Compra(cantidad: 5)), 409);
            Assert.Contains("ya se consumió", ex.Message);
            await Falla(e.Granja.EliminarCompraAsync(e.Usuario, r.Id), 409);
        }

        [Fact]
        public async Task Compra_AlAnularSeDescuentaLoComprado()
        {
            using var e = await new EntornoGranja().Iniciar();
            var r = await e.Granja.CrearCompraAsync(e.Usuario, Compra(cantidad: 40));
            await e.Granja.EliminarCompraAsync(e.Usuario, r.Id);
            var doc = await e.Doc();
            Assert.Empty(doc["purchases"]!.AsArray());
            Assert.Equal(0m, DocumentoGranja.Numero(doc["stock"]![0]!["quantity"]));
        }

        [Fact]
        public async Task Consumo_DescuentaYNoDejaPasarseDeLoDisponible()
        {
            using var e = await new EntornoGranja().Iniciar();
            await e.Granja.CrearCompraAsync(e.Usuario, Compra(cantidad: 10));
            string stockId = (string)(await e.Doc())["stock"]![0]!["id"]!;
            await Falla(e.Granja.RegistrarConsumoAsync(e.Usuario, new ConsumoDto { StockId = "no-existe", Quantity = 1, Date = "2026-10-12" }), 400);
            await Falla(e.Granja.RegistrarConsumoAsync(e.Usuario, new ConsumoDto { StockId = stockId, Quantity = 0, Date = "2026-10-12" }), 400);
            var ex = await Falla(e.Granja.RegistrarConsumoAsync(e.Usuario, new ConsumoDto { StockId = stockId, Quantity = 10.5m, Date = "2026-10-12" }), 400);
            Assert.Equal("Solo hay 10 kg disponibles. Ajusta la cantidad antes de guardar.", ex.Message);
            await e.Granja.RegistrarConsumoAsync(e.Usuario, new ConsumoDto { StockId = stockId, Quantity = 2.5m, Date = "2026-10-12", Notes = "Ponedoras" });
            var doc = await e.Doc();
            Assert.Equal(7.5m, DocumentoGranja.Numero(doc["stock"]![0]!["quantity"]));
            var consumo = doc["movements"]!.AsArray().OfType<JsonObject>().First();
            Assert.Equal("Consumo", (string?)consumo["kind"]);
            Assert.Equal("Ponedoras", (string?)consumo["notes"]);
        }

        // ---------- agenda ----------

        private static TareaDto Tarea(string coop, string? stockId = null, decimal insumo = 0) =>
            new() { Title = "Limpiar bebederos", CoopId = coop, FrequencyDays = 3, LastDone = "2026-10-19", NextDue = "2026-10-22", StockId = stockId, Supplies = insumo };

        [Fact]
        public async Task Tarea_SeCreaActualizaYElimina()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            await Falla(e.Granja.CrearTareaAsync(e.Usuario, new TareaDto { Title = "A", CoopId = coop, FrequencyDays = 0, NextDue = "2026-10-22" }), 400);
            await Falla(e.Granja.CrearTareaAsync(e.Usuario, Tarea(coop, insumo: 2)), 400);   // insumo sin producto
            await Falla(e.Granja.CrearTareaAsync(e.Usuario, Tarea("no-existe")), 400);
            var r = await e.Granja.CrearTareaAsync(e.Usuario, Tarea(coop));
            Assert.StartsWith("man-", r.Id);
            Assert.Equal("Pendiente", (string?)(await e.Fila("maintenance", r.Id))["status"]);
            var cambio = Tarea(coop); cambio.Title = "Revisar mallas";
            await e.Granja.ActualizarTareaAsync(e.Usuario, r.Id, cambio);
            Assert.Equal("Revisar mallas", (string?)(await e.Fila("maintenance", r.Id))["title"]);
            await e.Granja.EliminarTareaAsync(e.Usuario, r.Id);
            Assert.Empty((await e.Doc())["maintenance"]!.AsArray());
        }

        [Fact]
        public async Task Tarea_AlCompletarseCalculaLaProximaFechaDesdeHoyYConsumeElInsumo()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            await e.Granja.CrearCompraAsync(e.Usuario, Compra("Viruta de pino", 9));
            string stockId = (string)(await e.Doc())["stock"]![0]!["id"]!;
            var r = await e.Granja.CrearTareaAsync(e.Usuario, Tarea(coop, stockId, 2));
            await e.Granja.CompletarTareaAsync(e.Usuario, r.Id, new CompletarTareaDto { Hoy = "2026-10-22" });
            var fila = await e.Fila("maintenance", r.Id);
            Assert.Equal("2026-10-22", (string?)fila["lastDone"]);
            Assert.Equal("2026-10-25", (string?)fila["nextDue"]);
            Assert.Equal("Próxima", (string?)fila["status"]);
            var doc = await e.Doc();
            Assert.Equal(7m, DocumentoGranja.Numero(doc["stock"]![0]!["quantity"]));
            Assert.Equal("Mantenimiento: Limpiar bebederos", (string?)doc["movements"]![0]!["notes"]);
        }

        [Fact]
        public async Task Tarea_NoSeCompletaSiFaltaElInsumo_Ni_ConUnaFechaInvalida()
        {
            using var e = await new EntornoGranja().Iniciar();
            string coop = await e.Gallinero();
            await e.Granja.CrearCompraAsync(e.Usuario, Compra("Viruta de pino", 1));
            string stockId = (string)(await e.Doc())["stock"]![0]!["id"]!;
            var r = await e.Granja.CrearTareaAsync(e.Usuario, Tarea(coop, stockId, 2));
            var ex = await Falla(e.Granja.CompletarTareaAsync(e.Usuario, r.Id, new CompletarTareaDto { Hoy = "2026-10-22" }), 409);
            Assert.Contains("Solo quedan 1 kg de Viruta de pino", ex.Message);
            await Falla(e.Granja.CompletarTareaAsync(e.Usuario, r.Id, new CompletarTareaDto { Hoy = "mañana" }), 400);
            await Falla(e.Granja.CompletarTareaAsync(e.Usuario, "no-existe", new CompletarTareaDto()), 404);
            // Sin fecha, usa la del servidor (el reloj de la prueba marca 2026-10-22).
            var sinInsumo = await e.Granja.CrearTareaAsync(e.Usuario, Tarea(coop));
            await e.Granja.CompletarTareaAsync(e.Usuario, sinInsumo.Id, new CompletarTareaDto());
            Assert.Equal("2026-10-22", (string?)(await e.Fila("maintenance", sinInsumo.Id))["lastDone"]);
        }

        [Fact]
        public async Task Consulta_DevuelveElDocumentoYLaVersion()
        {
            using var e = await new EntornoGranja().Iniciar();
            await e.Gallinero();
            var granja = await new GranjaQueries(e.Base.Contexto).ObtenerGranjaAsync(e.Usuario);
            Assert.Equal(2, granja.Version);
            Assert.Equal("La Arboleda", granja.Datos.GetProperty("coops")[0].GetProperty("name").GetString());
            Assert.Equal(0, granja.Datos.GetProperty("birds").GetArrayLength());
            await Assert.ThrowsAsync<ReglaNegocioException>(() => new GranjaQueries(e.Base.Contexto).ObtenerGranjaAsync(Guid.NewGuid()));
        }
    }
}
