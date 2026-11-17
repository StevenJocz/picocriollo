using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.Tests
{
    public class VentasTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        private sealed class Finca { public Guid Dueno; public string Corral = "", Gallina = "", Gallo = "", Recoleccion = ""; }

        private static async Task<Finca> Preparar(EntornoMercado e)
        {
            var f = new Finca { Dueno = await e.Persona("Ana") };
            f.Corral = (await e.Granja.CrearGallineroAsync(f.Dueno, new GallineroDto { Name = "Corral", Capacity = 20 })).Id;
            f.Gallina = (await e.Granja.CrearAveAsync(f.Dueno, new AveDto { Name = "Nube", Sex = "Gallina", CoopId = f.Corral, Breed = "Brahma" })).Id;
            f.Gallo = (await e.Granja.CrearAveAsync(f.Dueno, new AveDto { Name = "Bruno", Sex = "Gallo", CoopId = f.Corral, Breed = "Brahma" })).Id;
            f.Recoleccion = (await e.Granja.CrearRecoleccionAsync(f.Dueno, new RecoleccionDto { Date = "2026-10-20", CoopId = f.Corral, Eggs = 12, Incubation = 4, Consumption = 2, Sale = 6 })).Id;
            return f;
        }

        private static JsonObject Doc(JsonObject d, string lista, string id) => d[lista]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id);
        private static JsonArray Lista(JsonObject d, string lista) => d[lista]!.AsArray();

        private static VentaNuevaDto Venta(string clave, params LineaVentaDto[] lineas) => new()
        {
            Date = "2026-10-22", Lines = lineas.ToList(), PaymentStatus = "Pagado", PaymentMethod = "Efectivo", IdempotencyKey = clave,
            Paid = lineas.Sum(l => Math.Max(0, l.Quantity * l.UnitPrice - l.Discount)), Tendered = lineas.Sum(l => Math.Max(0, l.Quantity * l.UnitPrice - l.Discount)),
        };

        // ---------- lotes de huevos ----------

        [Fact]
        public async Task LoteDeHuevos_SalDeLaRecoleccionYNoPasaDeLoQueQuedaParaEseDestino()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            await Falla(e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = "no-existe", Quantity = 2 }), 400);
            await Falla(e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 7, Destination = "Venta" }), 400);
            await Falla(e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 1, Destination = "Regalo" }), 400);

            var lote = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 4, Breed = "Brahma", Destination = "Venta" });
            Assert.Matches(@"^FER-\d{4}-[0-9A-F]{8}$", lote.Codigo);
            await Falla(e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 3, Destination = "Venta" }), 400);
            await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 2, Destination = "Venta" });

            var doc = await e.Doc(f.Dueno);
            var fila = Doc(doc, "fertileLots", lote.Id);
            Assert.Equal("Huevo fértil", (string)fila["productType"]!);
            Assert.Equal("Pendiente", (string)fila["fertility"]!);
            Assert.Equal(4, (int)fila["available"]!);

            await e.Granja.ActualizarLoteHuevosAsync(f.Dueno, lote.Id, new LoteHuevosCambioDto { Fertility = "Confirmada", StorageNotes = "Fresco" });
            await Falla(e.Granja.ActualizarLoteHuevosAsync(f.Dueno, lote.Id, new LoteHuevosCambioDto { Fertility = "Quizá" }), 400);
            Assert.Contains(Lista(await e.Doc(f.Dueno), "lotMovements").OfType<JsonObject>(), m => (string)m["kind"]! == "Clasificado");

            var sub = await e.Granja.DividirLoteHuevosAsync(f.Dueno, lote.Id, new DividirLoteDto { Quantity = 1 });
            await Falla(e.Granja.DividirLoteHuevosAsync(f.Dueno, lote.Id, new DividirLoteDto { Quantity = 9 }), 400);
            doc = await e.Doc(f.Dueno);
            Assert.Equal(3, (int)Doc(doc, "fertileLots", lote.Id)["available"]!);
            Assert.Equal(lote.Id, (string)Doc(doc, "fertileLots", sub.Id)["parentLotId"]!);
        }

        [Fact]
        public async Task Incubacion_ConLotesDescuentaLosHuevosYNoSeDejaCambiarLosLotes()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            var lote = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 4, Destination = "Incubación" });
            await Falla(e.Granja.CrearIncubacionAsync(f.Dueno, new IncubacionDto { Type = "Natural", HenId = f.Gallina, CoopId = f.Corral, StartedAt = "2026-10-21", Eggs = 5, Status = "En curso", SourceLotIds = [lote.Id] }), 400);
            await Falla(e.Granja.CrearIncubacionAsync(f.Dueno, new IncubacionDto { Type = "Natural", HenId = f.Gallina, CoopId = f.Corral, StartedAt = "2026-10-21", Eggs = 4, Status = "En curso", SourceLotIds = ["fantasma"] }), 400);
            var inc = await e.Granja.CrearIncubacionAsync(f.Dueno, new IncubacionDto { Type = "Natural", HenId = f.Gallina, CoopId = f.Corral, StartedAt = "2026-10-21", Eggs = 4, Status = "En curso", SourceLotIds = [lote.Id] });

            var doc = await e.Doc(f.Dueno);
            var fila = Doc(doc, "fertileLots", lote.Id);
            Assert.Equal(0, (int)fila["available"]!);
            Assert.Equal(4, (int)fila["incubated"]!);
            Assert.Contains(Lista(doc, "lotMovements").OfType<JsonObject>(), m => (string)m["kind"]! == "Incubado" && (string)m["referenceId"]! == inc.Id);
            await Falla(e.Granja.ActualizarIncubacionAsync(f.Dueno, inc.Id, new IncubacionDto { Type = "Natural", HenId = f.Gallina, CoopId = f.Corral, StartedAt = "2026-10-21", Eggs = 4, Status = "En curso" }), 400);
            await e.Granja.ActualizarIncubacionAsync(f.Dueno, inc.Id, new IncubacionDto { Type = "Natural", HenId = f.Gallina, CoopId = f.Corral, StartedAt = "2026-10-21", Eggs = 4, Status = "En curso", SourceLotIds = [lote.Id], Notes = "Todo bien" });

            // Un lote reservado para incubación no se vende.
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-0001", new LineaVentaDto { Product = "Huevo fértil", SourceLotId = lote.Id, Quantity = 1, UnitPrice = 1000 })), 409);
        }

        // ---------- ventas ----------

        [Fact]
        public async Task Venta_DescuentaDelLoteEsIdempotenteYGeneraElRecibo()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            var lote = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 6, Breed = "Brahma", Destination = "Venta" });
            var cliente = await e.Granja.CrearClienteAsync(f.Dueno, new ClienteDto { Name = "Doña Rosa", Phone = "3001112233" });

            var dto = Venta("venta-1111", new LineaVentaDto { Product = "Huevo fértil", SourceLotId = lote.Id, Quantity = 4, UnitPrice = 2500, Discount = 500 });
            dto.CustomerId = cliente.Id; dto.Tendered = 20000; dto.FarmName = "La Esperanza";
            var venta = await e.Granja.RegistrarVentaAsync(f.Dueno, dto);
            Assert.Matches(@"^VEN-\d{4}-[0-9A-F]{8}$", venta.Codigo);
            // Repetir la misma clave no vende dos veces.
            var repetida = await e.Granja.RegistrarVentaAsync(f.Dueno, dto);
            Assert.Equal(venta.Id, repetida.Id);

            var doc = await e.Doc(f.Dueno);
            Assert.Single(Lista(doc, "sales"));
            Assert.Equal(2, (int)Doc(doc, "fertileLots", lote.Id)["available"]!);
            Assert.Equal(4, (int)Doc(doc, "fertileLots", lote.Id)["sold"]!);
            var guardada = Doc(doc, "sales", venta.Id);
            var recibo = guardada["receiptSnapshot"]!;
            Assert.Equal("La Esperanza", (string)recibo["farmName"]!);
            Assert.Equal("Doña Rosa", (string)recibo["customerName"]!);
            Assert.Equal(9500, (decimal)recibo["total"]!);
            Assert.Equal(10500, (decimal)recibo["change"]!);
            Assert.StartsWith("REC-", (string)guardada["receiptCode"]!);
            Assert.Single(guardada["payments"]!.AsArray());
            Assert.Contains(Lista(doc, "lotMovements").OfType<JsonObject>(), m => (string)m["kind"]! == "Vendido" && (decimal)m["quantity"]! == 4);
        }

        [Fact]
        public async Task Venta_RechazaLoQueNoCuadra()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            var lote = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 3, Destination = "Venta" });
            var consumo = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 2, Destination = "Consumo" });
            LineaVentaDto Huevos(decimal cantidad, decimal precio = 1000, decimal descuento = 0, string producto = "Huevo fértil", string? origen = null) => new() { Product = producto, SourceLotId = origen ?? lote.Id, Quantity = cantidad, UnitPrice = precio, Discount = descuento };

            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-2001", Huevos(4))), 409);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-2002", Huevos(0))), 400);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-2003", Huevos(1, 1000, 2000))), 400);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-2004", Huevos(1, producto: "Huevo consumo"))), 409);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-2005", Huevos(1, origen: "fantasma"))), 409);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-2006", Huevos(1.5m))), 400);

            var incoherente = Venta("venta-2007", Huevos(2)); incoherente.PaymentStatus = "Pendiente";
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, incoherente), 400);
            var efectivoCorto = Venta("venta-2008", Huevos(2)); efectivoCorto.Tendered = 1000;
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, efectivoCorto), 400);
            var clienteFalso = Venta("venta-2009", Huevos(1)); clienteFalso.CustomerId = "fantasma";
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, clienteFalso), 400);

            // Nada de lo rechazado descontó existencias.
            Assert.Equal(3, (int)Doc(await e.Doc(f.Dueno), "fertileLots", lote.Id)["available"]!);
            var ok = Venta("venta-2010", Huevos(1, producto: "Huevo consumo", origen: consumo.Id));
            await e.Granja.RegistrarVentaAsync(f.Dueno, ok);
        }

        [Fact]
        public async Task Venta_DeAveAdultaLaMarcaVendidaRetiraElAnilloYSeDeshaceAlAnular()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            await e.Granja.AsignarAnilloAsync(f.Dueno, new AsignarAnilloDto { Number = 12, BirdId = f.Gallo });

            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-3001", new LineaVentaDto { Product = "Ave adulta", Quantity = 2, UnitPrice = 90000 })), 400);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-3002", new LineaVentaDto { Product = "Ave adulta", BirdId = f.Gallo, Quantity = 2, UnitPrice = 90000 })), 409);
            var venta = await e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-3003", new LineaVentaDto { Product = "Ave adulta", BirdId = f.Gallo, Quantity = 1, UnitPrice = 90000 }));

            var doc = await e.Doc(f.Dueno);
            Assert.Equal("Vendido", (string)Doc(doc, "birds", f.Gallo)["status"]!);
            Assert.Equal("Retirado", (string)Lista(doc, "rings").OfType<JsonObject>().Single(r => (int)r["number"]! == 12)["status"]!);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-3004", new LineaVentaDto { Product = "Ave adulta", BirdId = f.Gallo, Quantity = 1, UnitPrice = 90000 })), 409);

            await e.Granja.AnularVentaAsync(f.Dueno, venta.Id);
            doc = await e.Doc(f.Dueno);
            Assert.Equal("Activo", (string)Doc(doc, "birds", f.Gallo)["status"]!);
            Assert.Contains(Lista(doc, "rings").OfType<JsonObject>(), r => (int)r["number"]! == 12 && (string)r["status"]! == "Asignado" && (string)r["birdId"]! == f.Gallo);
            Assert.Equal("Cancelada", (string)Doc(doc, "sales", venta.Id)["paymentStatus"]!);
            Assert.Equal(90000, (decimal)Doc(doc, "sales", venta.Id)["refunded"]!);
            // Anular dos veces no repite los movimientos.
            int movimientos = Lista(doc, "lotMovements").Count;
            await e.Granja.AnularVentaAsync(f.Dueno, venta.Id);
            Assert.Equal(movimientos, Lista(await e.Doc(f.Dueno), "lotMovements").Count);
        }

        [Fact]
        public async Task Venta_DeUnAvePublicadaEnElMercadoSeBloquea()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            await e.Publicar(f.Dueno, f.Gallo);
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-4001", new LineaVentaDto { Product = "Ave adulta", BirdId = f.Gallo, Quantity = 1, UnitPrice = 1000 })), 409);
        }

        [Fact]
        public async Task Abonos_Devoluciones_YProductosDelCatalogo()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            var producto = await e.Granja.CrearProductoAsync(f.Dueno, new ProductoDto { Name = "Concentrado", Category = "Alimento", Unit = "kg", Price = 3000, Available = 10 });
            Assert.Matches(@"^PRO-\d{4}-[0-9A-F]{8}$", producto.Codigo);
            var dto = Venta("venta-5001", new LineaVentaDto { Product = "Otro", SourceLotId = producto.Id, Quantity = 4, UnitPrice = 3000 });
            dto.PaymentStatus = "Parcial"; dto.Paid = 5000; dto.Tendered = null;
            await Falla(e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-5000", new LineaVentaDto { Product = "Otro", SourceLotId = producto.Id, Quantity = 11, UnitPrice = 1 })), 409);
            var venta = await e.Granja.RegistrarVentaAsync(f.Dueno, dto);
            Assert.Equal(6, (decimal)Doc(await e.Doc(f.Dueno), "customProducts", producto.Id)["available"]!);

            await Falla(e.Granja.RegistrarAbonoAsync(f.Dueno, venta.Id, new AbonoDto { Amount = 8000, Method = "Nequi" }), 400);
            await e.Granja.RegistrarAbonoAsync(f.Dueno, venta.Id, new AbonoDto { Amount = 7000, Method = "Nequi" });
            var pagada = Doc(await e.Doc(f.Dueno), "sales", venta.Id);
            Assert.Equal("Pagado", (string)pagada["paymentStatus"]!);
            Assert.Equal(2, pagada["payments"]!.AsArray().Count);
            await Falla(e.Granja.RegistrarAbonoAsync(f.Dueno, venta.Id, new AbonoDto { Amount = 1, Method = "Nequi" }), 409);

            string linea = (string)pagada["lines"]!.AsArray()[0]!["id"]!;
            await Falla(e.Granja.DevolverLineaAsync(f.Dueno, venta.Id, new DevolucionDto { LineId = linea, Quantity = 5 }), 400);
            await Falla(e.Granja.DevolverLineaAsync(f.Dueno, venta.Id, new DevolucionDto { LineId = "otra", Quantity = 1 }), 400);
            await e.Granja.DevolverLineaAsync(f.Dueno, venta.Id, new DevolucionDto { LineId = linea, Quantity = 1 });
            var doc = await e.Doc(f.Dueno);
            Assert.Equal(7, (decimal)Doc(doc, "customProducts", producto.Id)["available"]!);
            Assert.Equal("Devuelta parcial", (string)Doc(doc, "sales", venta.Id)["paymentStatus"]!);
            Assert.Equal(3000, (decimal)Doc(doc, "sales", venta.Id)["refunded"]!);
            await e.Granja.DevolverLineaAsync(f.Dueno, venta.Id, new DevolucionDto { LineId = linea, Quantity = 3 });
            Assert.Equal("Devuelta", (string)Doc(await e.Doc(f.Dueno), "sales", venta.Id)["paymentStatus"]!);

            await Falla(e.Granja.EliminarProductoAsync(f.Dueno, producto.Id), 409);
        }

        [Fact]
        public async Task Clientes_ConVentasNoSeEliminan()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            var lote = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = f.Recoleccion, Quantity = 2, Destination = "Venta" });
            var cliente = await e.Granja.CrearClienteAsync(f.Dueno, new ClienteDto { Name = "Pedro" });
            var libre = await e.Granja.CrearClienteAsync(f.Dueno, new ClienteDto { Name = "Libre" });
            var dto = Venta("venta-6001", new LineaVentaDto { Product = "Huevo fértil", SourceLotId = lote.Id, Quantity = 1, UnitPrice = 2000 });
            dto.CustomerId = cliente.Id;
            await e.Granja.RegistrarVentaAsync(f.Dueno, dto);
            await Falla(e.Granja.EliminarClienteAsync(f.Dueno, cliente.Id), 409);
            await e.Granja.EliminarClienteAsync(f.Dueno, libre.Id);
            await e.Granja.ActualizarClienteAsync(f.Dueno, cliente.Id, new ClienteDto { Name = "Pedro Pérez", Phone = "3000000000" });
        }

        // ---------- trazabilidad y resumen ----------

        [Fact]
        public async Task Trazabilidad_SigueLaCadenaDeLaVentaHastaElGallo()
        {
            using var e = new EntornoMercado();
            var f = await Preparar(e);
            var grupo = await e.Granja.CrearGrupoReproductorAsync(f.Dueno, new GrupoReproductorDto { Name = "Uno", RoosterId = f.Gallo, HenIds = [f.Gallina], StartedAt = "2026-10-01" });
            var coleccion = await e.Granja.CrearRecoleccionAsync(f.Dueno, new RecoleccionDto { Date = "2026-10-21", CoopId = f.Corral, BreedingGroupId = grupo.Id, Eggs = 3, Sale = 3 });
            var lote = await e.Granja.CrearLoteHuevosAsync(f.Dueno, new LoteHuevosNuevoDto { CollectionId = coleccion.Id, Quantity = 3, Destination = "Venta" });
            var venta = await e.Granja.RegistrarVentaAsync(f.Dueno, Venta("venta-7001", new LineaVentaDto { Product = "Huevo fértil", SourceLotId = lote.Id, Quantity = 2, UnitPrice = 2000 }));

            var traza = await e.Granjas.TrazarAsync(f.Dueno, venta.Codigo!.ToLowerInvariant());
            var tipos = traza.Select(t => t.Kind).ToList();
            Assert.Equal("Venta", tipos[^1]);
            Assert.Contains("Lote de huevos fértiles", tipos);
            Assert.Contains("Recolección", tipos);
            Assert.Contains("Grupo reproductor", tipos);
            Assert.Contains(traza, t => t.Kind == "Ave" && t.Title == "Bruno");
            Assert.Empty(await e.Granjas.TrazarAsync(f.Dueno, "XXX-0000"));
            await Falla(e.Granjas.TrazarAsync(f.Dueno, " "), 400);

            var resumen = await e.Granjas.ResumenComercialAsync(f.Dueno, null, null);
            Assert.Equal(4000, resumen.Gross);
            Assert.Equal(4000, resumen.Paid);
            Assert.Equal(2, resumen.EggsSold);
            Assert.Equal(1, resumen.AvailableEggs);
            Assert.Equal(0, (await e.Granjas.ResumenComercialAsync(f.Dueno, "2027-01-01", null)).Gross);
            await e.Granja.AnularVentaAsync(f.Dueno, venta.Id);
            Assert.Equal(0, (await e.Granjas.ResumenComercialAsync(f.Dueno, null, null)).Gross);
        }
    }
}
