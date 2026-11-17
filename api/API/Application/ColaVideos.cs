using System.Text.Json;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.API.Application;

public record TrabajoVideo(string Id, Guid Owner, string Status, DateTime CreatedAt, string? MediaId = null, string? Error = null);

/// <summary>Cola durable para una instancia de API. El volumen sobrevive a recreaciones del contenedor.</summary>
public sealed class ColaVideos(IConfiguration config, IServiceScopeFactory scopes, ProcesadorMedia procesador, ILogger<ColaVideos> logger) : BackgroundService
{
    public const long MaxBytes = 80L * 1024 * 1024;
    private readonly string raiz = Path.GetFullPath(config["Media:Trabajos"] ?? Path.Combine(AppContext.BaseDirectory, "media-jobs"));
    private readonly SemaphoreSlim escritura = new(1);
    private string Carpeta(string id) => Path.Combine(raiz, Guid.ParseExact(id, "N").ToString("N"));
    private async Task Guardar(TrabajoVideo j, CancellationToken ct)
    {
        var archivo = Path.Combine(Carpeta(j.Id), "estado.json");
        await File.WriteAllTextAsync(archivo + ".tmp", JsonSerializer.Serialize(j), ct);
        File.Move(archivo + ".tmp", archivo, true);
    }
    private IEnumerable<TrabajoVideo> Listar()
    {
        Directory.CreateDirectory(raiz);
        foreach (var dir in Directory.EnumerateDirectories(raiz))
        {
            if (!Guid.TryParseExact(Path.GetFileName(dir), "N", out _)) continue;
            TrabajoVideo? j = null;
            try { j = JsonSerializer.Deserialize<TrabajoVideo>(File.ReadAllText(Path.Combine(dir, "estado.json"))); }
            catch (IOException) { } catch (JsonException) { }
            if (j is not null) yield return j;
        }
    }
    public TrabajoVideo Consultar(string id, Guid owner)
    {
        if (!Guid.TryParseExact(id, "N", out _)) throw ReglaNegocioException.NoEncontrado("Video no encontrado.");
        var trabajo = Listar().FirstOrDefault(j => j.Id == id && j.Owner == owner);
        return trabajo ?? throw ReglaNegocioException.NoEncontrado("Video no encontrado.");
    }
    public async Task<TrabajoVideo> Encolar(Guid owner, Stream cuerpo, CancellationToken ct)
    {
        using (var scope = scopes.CreateScope())
        {
            var a = scope.ServiceProvider.GetRequiredService<AlmacenMercado>();
            await a.AsegurarActivaAsync(owner.ToString());
        }
        await escritura.WaitAsync(ct);
        string? carpeta = null;
        try
        {
            var jobs = Listar().ToArray();
            if (jobs.Count(j => j.Owner == owner && j.CreatedAt > DateTime.UtcNow.AddDays(-1)) >= 20 || jobs.Count(j => j.Owner == owner && j.Status is "pending" or "processing") >= 2)
                throw new ReglaNegocioException(429, "Ya tienes videos en proceso o alcanzaste 20 subidas al día. Espera e inténtalo después.");
            if (jobs.Count(j => j.Status is "pending" or "processing") >= 20)
                throw new ReglaNegocioException(503, "La cola de videos está llena. Inténtalo más tarde.");
            var j = new TrabajoVideo(Guid.NewGuid().ToString("N"), owner, "pending", DateTime.UtcNow);
            carpeta = Carpeta(j.Id); Directory.CreateDirectory(carpeta);
            await using (var f = File.Create(Path.Combine(carpeta, "entrada")))
            {
                var buffer = new byte[65536]; long total = 0; int n;
                while ((n = await cuerpo.ReadAsync(buffer, ct)) > 0)
                {
                    total += n;
                    if (total > MaxBytes) throw new ReglaNegocioException(413, "El video admite hasta 80 MB.");
                    await f.WriteAsync(buffer.AsMemory(0, n), ct);
                }
                if (total == 0) throw ReglaNegocioException.Validacion("El video está vacío.");
            }
            await Guardar(j, ct);
            return j;
        }
        catch { if (carpeta is not null) Directory.Delete(carpeta, true); throw; }
        finally { escritura.Release(); }
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Un trabajo en processing al arrancar pertenece a la instancia anterior.
        foreach (var j in Listar().Where(j => j.Status == "processing")) await Guardar(j with { Status = "pending" }, stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                foreach (var viejo in Listar().Where(j => j.Status is "ready" or "failed" && j.CreatedAt < DateTime.UtcNow.AddDays(-2))) Directory.Delete(Carpeta(viejo.Id), true);
                var j = Listar().Where(j => j.Status == "pending").OrderBy(j => j.CreatedAt).FirstOrDefault();
                if (j is null) { await Task.Delay(2000, stoppingToken); continue; }
                await Guardar(j with { Status = "processing" }, stoppingToken);
                try
                {
                    var entrada = Path.Combine(Carpeta(j.Id), "entrada");
                    var medio = await procesador.Procesar(entrada, true, stoppingToken);
                    using var scope = scopes.CreateScope();
                    var comandos = scope.ServiceProvider.GetRequiredService<ISocialCommands>();
                    var guardado = await comandos.GuardarVideoAsync(j.Owner, j.Id, medio.Bytes, medio.Portada!, medio.Ancho, medio.Alto, medio.Segundos);
                    await Guardar(j with { Status = "ready", MediaId = guardado.Id }, stoppingToken);
                    File.Delete(entrada);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { await Guardar(j, CancellationToken.None); break; }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "No se pudo procesar el video {Job}", j.Id);
                    await Guardar(j with { Status = "failed", Error = ex is ReglaNegocioException ? ex.Message : "No se pudo procesar el video. Vuelve a subirlo." }, stoppingToken);
                    File.Delete(Path.Combine(Carpeta(j.Id), "entrada"));
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError(ex, "Error en cola de videos"); await Task.Delay(5000, stoppingToken); }
        }
    }
}
