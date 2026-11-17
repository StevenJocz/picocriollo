using PicoCriollo.Domain.Mercado;

namespace PicoCriollo.Tests;

public class DestacadosTests
{
    [Fact]
    public async Task VentasSoloCompletadasYNoCuentasSuspendidas()
    {
        using var e = new EntornoMercado();
        var ana = await e.Persona("Ana");
        var beto = await e.Persona("Beto");
        e.Almacen.Operaciones.Insertar(new() { Id = "venta", SellerId = ana.ToString(), Status = EstadoOperacion.Completada });
        e.Almacen.Operaciones.Insertar(new() { Id = "pendiente", SellerId = beto.ToString(), Status = EstadoOperacion.EntregaPendiente });
        await e.Almacen.Contexto.SaveChangesAsync();
        var destacados = await e.Perfiles.DestacadosAsync("ventas");
        Assert.Equal(ana.ToString(), Assert.Single(destacados).Id);
        Assert.Equal(1, destacados[0].Count);
        var usuario = await e.Almacen.UsuarioAsync(ana.ToString());
        usuario!.Perfil = "{\"suspendedAt\":\"2026-01-01\"}";
        await e.Almacen.Contexto.SaveChangesAsync();
        Assert.Empty(await e.Perfiles.DestacadosAsync("ventas"));
    }

    [Fact]
    public async Task PublicacionesExcluyeOcultasYCompartidasYOrdenaSeguidores()
    {
        using var e = new EntornoMercado();
        var ana = (await e.Persona("Ana")).ToString();
        var beto = (await e.Persona("Beto")).ToString();
        e.Almacen.PublicacionesPerfil.Insertar(new() { Id = "original", AuthorId = ana });
        e.Almacen.PublicacionesPerfil.Insertar(new() { Id = "oculta", AuthorId = beto, HiddenAt = "2026-01-01" });
        e.Almacen.PublicacionesPerfil.Insertar(new() { Id = "compartida", AuthorId = beto, SharedFromId = "original" });
        e.Almacen.Seguimientos.Insertar(new() { Id = ana + ":" + beto, FollowerId = ana, FollowingId = beto });
        await e.Almacen.Contexto.SaveChangesAsync();
        Assert.Equal(ana, Assert.Single(await e.Perfiles.DestacadosAsync("publicaciones")).Id);
        Assert.Equal(beto, Assert.Single(await e.Perfiles.DestacadosAsync("seguidores")).Id);
    }
}
