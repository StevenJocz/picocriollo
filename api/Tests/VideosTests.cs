using PicoCriollo.API.Application;
using PicoCriollo.Domain.Excepciones;
using System.Reflection;

namespace PicoCriollo.Tests;

public class VideosTests
{
    [Fact]
    public void ConfiguraVideoParaInicioRapidoEnMovil()
    {
        var metodo = typeof(ProcesadorMedia).GetMethod("ArgumentosVideo", BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(metodo);
        var argumentos = Assert.IsAssignableFrom<IReadOnlyList<string>>(metodo!.Invoke(null, ["entrada.mov"]));
        string linea = string.Join(' ', argumentos);
        Assert.Contains("min(1080,iw)", linea);
        Assert.Contains("-crf 24", linea);
        Assert.Contains("-g 60", linea);
        Assert.Contains("-keyint_min 60", linea);
        Assert.Contains("-sc_threshold 0", linea);
        Assert.Contains("-movflags +faststart", linea);
    }

    [Theory]
    [InlineData(0.1)] [InlineData(49.99)] [InlineData(50)]
    public void AceptaHastaCincuenta(double segundos) => ProcesadorMedia.ValidarDuracion(segundos);

    [Theory]
    [InlineData(0)] [InlineData(-1)] [InlineData(50.001)] [InlineData(51)] [InlineData(double.NaN)] [InlineData(double.PositiveInfinity)]
    public void RechazaDuracionInvalida(double segundos) => Assert.Throws<ReglaNegocioException>(() => ProcesadorMedia.ValidarDuracion(segundos));

    [Fact]
    public async Task VideoTerminadoEsIdempotenteYNoSePuedeAdjuntarPorOtraCuenta()
    {
        using var e = new EntornoMercado();
        var owner = await e.Persona("Video"); var otro = await e.Persona("Otrovideo");
        var job = Guid.NewGuid().ToString("N");
        var uno = await e.Social.GuardarVideoAsync(owner, job, [1,2,3], [4,5,6], 720, 1280, 50);
        var dos = await e.Social.GuardarVideoAsync(owner, job, [1,2,3], [4,5,6], 720, 1280, 50);
        Assert.Equal(uno.Id, dos.Id);
        Assert.Equal(2, (await e.Almacen.Archivos.ListarAsync("ownerId", owner.ToString())).Count);
        await Assert.ThrowsAsync<ReglaNegocioException>(() => e.Social.CrearPublicacionAsync(otro, new() { MediaIds = [uno.Id] }));
        var post = await e.Social.CrearPublicacionAsync(owner, new() { MediaIds = [uno.Id] });
        Assert.NotEmpty(post);
        var medio = (await e.Perfiles.PostAsync(post, owner)).Media.Single();
        Assert.EndsWith(".mp4", medio.Url);
        Assert.EndsWith(".webp", medio.ThumbUrl);
    }
}

