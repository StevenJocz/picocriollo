using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;

namespace PicoCriollo.Tests;

public class FotosMercadoTests
{
    [Fact]
    public async Task NoPublicaSinFotos()
    {
        using var e = new EntornoMercado();
        var user = await e.Persona("Fotos");
        var bird = await e.Ave(user);
        var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Publicaciones.CrearAsync(user,
            new() { BirdId = bird, Kind = "fixed", Price = 10000, Publish = true, Consent = new() { ShowPhoto = false } }));
        Assert.Contains("foto", ex.Message.ToLowerInvariant());
    }

    [Fact]
    public async Task FotoAjenaNoSePuedePublicar()
    {
        using var e = new EntornoMercado();
        var user = await e.Persona("Fotos");
        var bird = await e.Ave(user);
        var id = Guid.NewGuid().ToString();
        e.Almacen.Archivos.Insertar(new() { Id = id, OwnerId = Guid.NewGuid().ToString(), Kind = "image" });
        await e.Base.Contexto.SaveChangesAsync();
        await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Publicaciones.CrearAsync(user,
            new() { BirdId = bird, Kind = "fixed", Price = 10000, PhotoIds = [id] }));
    }

    [Fact]
    public async Task LoteConservaVariasFotosAlActualizarFicha()
    {
        using var e = new EntornoMercado();
        var user = await e.Persona("Fotos");
        var a = await e.Ave(user, "Uno");
        var b = await e.Ave(user, "Dos");
        var ids = new[] { Guid.NewGuid().ToString(), Guid.NewGuid().ToString() };
        foreach (var id in ids) e.Almacen.Archivos.Insertar(new() { Id = id, OwnerId = user.ToString(), Kind = "image" });
        await e.Base.Contexto.SaveChangesAsync();
        var p = await e.Publicaciones.CrearAsync(user, new() { ItemType = "lote_aves", BirdIds = [a,b], Kind = "fixed", Price = 10000, PhotoIds = [..ids], Publish = true });
        await e.Publicaciones.ActualizarFichaAsync(user, p.Id);
        var row = await e.Almacen.Publicaciones.ObtenerAsync(p.Id);
        Assert.All(ids, id => Assert.Contains("/api/media/" + id, row!.Snapshot.PhotoUrls));
    }
}
