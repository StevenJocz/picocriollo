using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Commands;

namespace PicoCriollo.Tests;

public class LotePollitosTests
{
    private static async Task PrepararLote(EntornoMercado e, Guid dueno, int cantidad = 12)
    {
        var granja = await e.Base.Contexto.GranjaEs.SingleAsync(g => g.IdUsuario == dueno);
        var doc = JsonNode.Parse(granja.Datos)!.AsObject();
        doc["chickLots"] = new JsonArray(new JsonObject
        {
            ["id"] = "lote-uno", ["code"] = "POL-001", ["birthId"] = "", ["breed"] = "Criolla",
            ["initial"] = cantidad, ["available"] = cantidad, ["sold"] = 0,
        });
        granja.Datos = doc.ToJsonString();
        await e.Base.Contexto.SaveChangesAsync();
    }

    [Fact]
    public async Task ReservaCantidadYNoPermiteSobrevender()
    {
        using var e = new EntornoMercado();
        var vendedor = await e.Persona("VendedorPollitos");
        await PrepararLote(e, vendedor);
        long versionAntes = (await e.Base.Contexto.GranjaEs.SingleAsync(g => g.IdUsuario == vendedor)).Version;
        var uno = await e.Publicaciones.CrearAsync(vendedor, new() { ItemType = "lote_pollitos", LotId = "lote-uno", Quantity = 8, Kind = "fixed", Price = 80_000, Publish = true });
        Assert.Equal(versionAntes + 1, (await e.Base.Contexto.GranjaEs.SingleAsync(g => g.IdUsuario == vendedor)).Version);
        Assert.Equal("publicada", uno.Status);
        var bloqueo = Assert.Single(await e.Almacen.Bloqueos.ListarAsync(("listingId", uno.Id), ("status", "active")));
        Assert.Equal(8, bloqueo.Quantity);
        var error = await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Publicaciones.CrearAsync(vendedor, new() { ItemType = "lote_pollitos", LotId = "lote-uno", Quantity = 5, Kind = "fixed", Price = 50_000, Publish = true }));
        Assert.Equal(409, error.Estado);
        await e.Publicaciones.RetirarAsync(vendedor, uno.Id);
        Assert.Empty(await e.Almacen.Bloqueos.ListarAsync(("listingId", uno.Id), ("status", "active")));
        var dos = await e.Publicaciones.CrearAsync(vendedor, new() { ItemType = "lote_pollitos", LotId = "lote-uno", Quantity = 5, Kind = "fixed", Price = 50_000, Publish = true });
        Assert.Equal("publicada", dos.Status);
    }

    [Fact]
    public async Task RecepcionDescuentaAlVendedorYCreaLoteEnGranjaCompradora()
    {
        using var e = new EntornoMercado();
        var vendedor = await e.Persona("VendedorPollitos");
        var comprador = await e.Persona("CompradorPollitos");
        await PrepararLote(e, vendedor);
        var anuncio = await e.Publicaciones.CrearAsync(vendedor, new() { ItemType = "lote_pollitos", LotId = "lote-uno", Quantity = 4, Kind = "fixed", Price = 40_000, Publish = true });
        var solicitud = await e.Operaciones.SolicitarCompraAsync(comprador, anuncio.Id, new SolicitudCompraDto());
        await e.Operaciones.ResponderAsync(vendedor, solicitud.Id, true);
        await e.Operaciones.DeclararPagoAsync(comprador, solicitud.Id, new PagoDto { Method = "Efectivo" });
        await e.Operaciones.ConfirmarPagoAsync(vendedor, solicitud.Id);
        await e.Operaciones.MarcarEntregaAsync(vendedor, solicitud.Id);
        await e.Operaciones.ConfirmarRecepcionAsync(comprador, solicitud.Id);
        var origen = await e.Doc(vendedor); var destino = await e.Doc(comprador);
        Assert.Equal(8, origen["chickLots"]![0]!["available"]!.GetValue<int>());
        Assert.Equal(4, origen["chickLots"]![0]!["sold"]!.GetValue<int>());
        Assert.Equal(4, destino["chickLots"]![0]!["available"]!.GetValue<int>());
        Assert.NotEqual("POL-001", destino["chickLots"]![0]!["code"]!.GetValue<string>());
        Assert.Equal("vendida", (await e.Pub(anuncio.Id)).Status);
        Assert.Single(await e.Almacen.Facturas.ListarAsync("operationId", solicitud.Id));
    }
}
