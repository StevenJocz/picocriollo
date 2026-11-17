using PicoCriollo.Domain.Mercado;
namespace PicoCriollo.Tests;
public class RecomendacionTests
{
    [Fact]
    public async Task PriorizaNuevosYRecuperaVistosSinDuplicarCompartidos()
    {
        using var e = new EntornoMercado();
        var ana = await e.Persona("Ana");
        var beto = await e.Persona("Beto");
        var original = await e.Social.CrearPublicacionAsync(ana, new() { Text = "Una familia #brahma" });
        await e.Social.CompartirAsync(beto, original, "Conozcan esta familia");
        Assert.Single((await e.Perfiles.ReelsAsync(new(), beto)).Items);
        Assert.Equal(1, await e.Social.RegistrarSenalesAsync(beto, [new() { Key = "p:" + original, Type = "view", Ms = 7000 }]));
        Assert.Equal(original, Assert.Single((await e.Perfiles.ReelsAsync(new(), beto)).Items).Id);
        await e.Social.PonerMeGustaAsync(beto, original, true);
        var nuevo = await e.Social.CrearPublicacionAsync(ana, new() { Text = "Otro ejemplar" });
        Assert.Equal(nuevo, Assert.Single((await e.Perfiles.ReelsAsync(new() { Limite = 1 }, beto)).Items).Id);
        var siguiente = await e.Perfiles.ReelsAsync(new() { Vistos = [ReglasSociales.ClaveCorta("p:" + nuevo)] }, beto);
        Assert.Equal(original, Assert.Single(siguiente.Items).Id);
        Assert.Null(siguiente.NextBefore);
    }
    [Fact]
    public void AlternaAutoresAunqueUnoDomineLosPrimerosCandidatos()
    {
        var ahora = DateTime.UtcNow;
        var favoritos = Enumerable.Range(0, 30).Select(i => new CandidatoReel($"p:{i}", ahora.ToString("O"), "popular", ["#gallinas"], 99, 99, 0, true, false, false));
        var nuevo = new CandidatoReel("p:nuevo", ahora.ToString("O"), "nuevo", ["#huevos"], 0, 0, 2, false, false, false);
        var r = ReglasSociales.Ordenar(favoritos.Append(nuevo), new(), ahora, "prueba", 2, new HashSet<string>(), []);
        Assert.NotEqual(r[0].AuthorId, r[1].AuthorId);
    }
    [Fact]
    public void SeparaAnunciosCuandoHayPublicacionesDisponibles()
    {
        var ahora = DateTime.UtcNow;
        var ads = Enumerable.Range(0, 30).Select(i => new CandidatoReel($"a:{i}", ahora.ToString("O"), $"autor{i}", [], 99, 99, 0, true, false, true));
        var p = new CandidatoReel("p:nuevo", ahora.ToString("O"), "nuevo", [], 0, 0, 2, false, false, false);
        var r = ReglasSociales.Ordenar(ads.Append(p), new(), ahora, "prueba", 2, new HashSet<string>(), []);
        Assert.False(r[0].IsAd && r[1].IsAd);
    }
}
