using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Tests;

public class HuevosInsumosMercadoTests
{
    private static async Task Preparar(EntornoMercado e, Guid usuario, string tipo, int cantidad = 12)
    {
        var fila = await e.Base.Contexto.GranjaEs.SingleAsync(g => g.IdUsuario == usuario);
        var doc = JsonNode.Parse(fila.Datos)!.AsObject();
        doc[tipo == "insumo" ? "customProducts" : "fertileLots"] = new JsonArray(new JsonObject {
            ["id"] = "origen", ["code"] = "ORIGEN-001", ["name"] = "Maíz", ["category"] = "Alimento",
            ["unit"] = "kg", ["price"] = 2500, ["breed"] = "Criolla", ["productType"] = "Huevo consumo",
            ["fertility"] = "Sin evaluar", ["initial"] = cantidad, ["available"] = cantidad, ["sold"] = 0,
            ["notes"] = "Nota privada", ["sourceCollectionId"] = "recoleccion-privada"
        });
        fila.Datos = doc.ToJsonString();
        await e.Base.Contexto.SaveChangesAsync();
    }

    [Theory]
    [InlineData("lote_huevos")]
    [InlineData("insumo")]
    public async Task ReservaRechazaSobreventaYLiberaAlRetirar(string tipo)
    {
        using var e = new EntornoMercado();
        var vendedor = await e.Persona("Vendedor");
        var ajeno = await e.Persona("Ajeno");
        await Preparar(e, vendedor, tipo);
        var dto = new PublicacionNuevaDto { ItemType = tipo, LotId = "origen", Quantity = 8, Kind = "fixed", Price = 20_000, Publish = true };
        Assert.Equal(403, (await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Publicaciones.CrearAsync(ajeno, dto))).Estado);
        var uno = await e.Publicaciones.CrearAsync(vendedor, dto);
        dto.Quantity = 5;
        Assert.Equal(409, (await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Publicaciones.CrearAsync(vendedor, dto))).Estado);
        await e.Publicaciones.RetirarAsync(vendedor, uno.Id);
        var dos = await e.Publicaciones.CrearAsync(vendedor, dto);
        Assert.Equal("publicada", dos.Status);
        Assert.Equal(5, Assert.Single(await e.Almacen.ActivosAsync(dos.Id)).Quantity);
    }

    [Theory]
    [InlineData("lote_huevos", false)]
    [InlineData("insumo", false)]
    [InlineData("insumo", true)]
    public async Task CompraCompletaTransfiereExistenciasYGeneraComprobante(string tipo, bool existente)
    {
        using var e = new EntornoMercado();
        var vendedor = await e.Persona("Vendedor"); var comprador = await e.Persona("Comprador");
        await Preparar(e, vendedor, tipo);
        if (existente) await Preparar(e, comprador, tipo, 3);
        var p = await e.Publicaciones.CrearAsync(vendedor, new() { ItemType = tipo, LotId = "origen", Quantity = 4, Kind = "fixed", Price = 10_000, Publish = true });
        var op = await e.Operaciones.SolicitarCompraAsync(comprador, p.Id, new());
        await e.Operaciones.ResponderAsync(vendedor, op.Id, true);
        await e.Operaciones.DeclararPagoAsync(comprador, op.Id, new() { Method = "Efectivo" });
        await e.Operaciones.ConfirmarPagoAsync(vendedor, op.Id);
        await e.Operaciones.MarcarEntregaAsync(vendedor, op.Id);
        await e.Operaciones.ConfirmarRecepcionAsync(comprador, op.Id);
        var coleccion = tipo == "insumo" ? "customProducts" : "fertileLots";
        var origen = (await e.Doc(vendedor))[coleccion]![0]!;
        var destino = (await e.Doc(comprador))[coleccion]!.AsArray();
        Assert.Equal(8m, decimal.Parse(origen["available"]!.ToString()));
        Assert.Single(destino);
        Assert.Equal(existente ? 7m : 4m, decimal.Parse(destino[0]!["available"]!.ToString()));
        if (!existente) Assert.NotEqual("ORIGEN-001", destino[0]!["code"]!.ToString());
        if (tipo == "lote_huevos") {
            Assert.Equal("Huevo consumo", destino[0]!["productType"]!.ToString());
            Assert.Equal("", destino[0]!["sourceCollectionId"]!.ToString());
            Assert.DoesNotContain("Nota privada", destino[0]!.ToJsonString());
        }
        Assert.Equal("vendida", (await e.Pub(p.Id)).Status);
        Assert.Empty(await e.Almacen.ActivosAsync(p.Id));
        Assert.Single(await e.Almacen.Facturas.ListarAsync("operationId", op.Id));
        Assert.Single(await e.Almacen.Comprobantes.ListarAsync("operationId", op.Id));
    }
    [Theory]
    [InlineData("lote_huevos")]
    [InlineData("insumo")]
    public async Task SiSeAgotanAntesDeRecibirNoSeTransfierenNiSeFacturan(string tipo)
    {
        using var e = new EntornoMercado();
        var vendedor = await e.Persona("Vendedor"); var comprador = await e.Persona("Comprador");
        await Preparar(e, vendedor, tipo);
        var p = await e.Publicaciones.CrearAsync(vendedor, new() { ItemType = tipo, LotId = "origen", Quantity = 4, Kind = "fixed", Price = 10_000, Publish = true });
        var op = await e.Operaciones.SolicitarCompraAsync(comprador, p.Id, new());
        await e.Operaciones.ResponderAsync(vendedor, op.Id, true);
        await e.Operaciones.DeclararPagoAsync(comprador, op.Id, new() { Method = "Efectivo" });
        await e.Operaciones.ConfirmarPagoAsync(vendedor, op.Id);
        await e.Operaciones.MarcarEntregaAsync(vendedor, op.Id);
        await Preparar(e, vendedor, tipo, 2);
        Assert.Equal(409, (await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Operaciones.ConfirmarRecepcionAsync(comprador, op.Id))).Estado);
        Assert.Empty(await e.Almacen.Facturas.ListarAsync("operationId", op.Id));
        Assert.Empty(await e.Almacen.Comprobantes.ListarAsync("operationId", op.Id));
        Assert.Empty((await e.Doc(comprador))[tipo == "insumo" ? "customProducts" : "fertileLots"]!.AsArray());
    }
}
