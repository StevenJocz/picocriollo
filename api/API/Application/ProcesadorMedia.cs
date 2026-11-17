using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.API.Application;

public record MediaPreparado(byte[] Bytes, int Ancho, int Alto, double Segundos, byte[]? Portada = null);

/// <summary>Solo procesa archivos locales, sin protocolos de red y con recursos limitados.</summary>
public sealed class ProcesadorMedia
{
    private readonly SemaphoreSlim turnoFoto = new(1);
    private readonly SemaphoreSlim turnoVideo = new(1);
    public static void ValidarDuracion(double segundos)
    {
        if (!double.IsFinite(segundos) || segundos <= 0 || segundos > 50)
            throw ReglaNegocioException.Validacion("El video debe durar como máximo 50 segundos.");
    }

    public static IReadOnlyList<string> ArgumentosVideo(string entrada) =>
    [
        "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-threads", "2", "-i", entrada,
        "-map_metadata", "-1", "-map", "0:v:0", "-filter_threads", "1", "-map", "0:a:0?",
        "-vf", "scale=w='min(1080,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v", "libx264", "-preset", "fast", "-crf", "24", "-pix_fmt", "yuv420p", "-r", "30",
        "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-threads", "2",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-t", "50"
    ];

    private static async Task<string> Ejecutar(string programa, IEnumerable<string> argumentos, CancellationToken ct)
    {
        using var limite = CancellationTokenSource.CreateLinkedTokenSource(ct);
        limite.CancelAfter(TimeSpan.FromMinutes(5));
        var info = new ProcessStartInfo(programa) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var a in argumentos) info.ArgumentList.Add(a);
        using var p = Process.Start(info) ?? throw new InvalidOperationException("No se pudo iniciar el procesador multimedia.");
        var salida = p.StandardOutput.ReadToEndAsync(limite.Token);
        var error = p.StandardError.ReadToEndAsync(limite.Token);
        try { await p.WaitForExitAsync(limite.Token); }
        catch { if (!p.HasExited) p.Kill(entireProcessTree: true); throw; }
        await error;
        if (p.ExitCode != 0) throw ReglaNegocioException.Validacion("No se pudo leer el archivo. Usa una foto JPG, PNG o WebP, o un video MP4, MOV o WebM válido.");
        return await salida;
    }

    private static async Task<(int W, int H, double Segundos)> Inspeccionar(string ruta, bool video, CancellationToken ct)
    {
        var json = await Ejecutar("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", ruta], ct);
        using var doc = JsonDocument.Parse(json);
        var streams = doc.RootElement.GetProperty("streams").EnumerateArray().ToArray();
        var visuales = streams.Where(s => s.TryGetProperty("codec_type", out var t) && t.GetString() == "video").ToArray();
        if (visuales.Length != 1) throw ReglaNegocioException.Validacion("El archivo debe contener una sola imagen o pista de video.");
        int w = visuales[0].GetProperty("width").GetInt32(), h = visuales[0].GetProperty("height").GetInt32();
        if (w < 1 || h < 1 || (long)w * h > 40_000_000 || w > 16000 || h > 16000)
            throw ReglaNegocioException.Validacion("Las dimensiones del archivo no son válidas.");
        var formato = doc.RootElement.GetProperty("format");
        var nombre = formato.GetProperty("format_name").GetString() ?? "";
        double segundos = 0;
        if (video)
        {
            if (!nombre.Split(',').Any(n => n is "mov" or "mp4" or "webm" or "matroska"))
                throw ReglaNegocioException.Validacion("Usa un video MP4, MOV o WebM.");
            if (formato.TryGetProperty("duration", out var dur)) double.TryParse(dur.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out segundos);
            foreach (var s in streams)
                if (s.TryGetProperty("duration", out var d) && double.TryParse(d.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var sd)) segundos = Math.Max(segundos, sd);
            ValidarDuracion(segundos);
        }
        else if (visuales[0].GetProperty("codec_name").GetString() is not ("mjpeg" or "png" or "webp"))
            throw ReglaNegocioException.Validacion("Usa una foto JPG, PNG o WebP.");
        return (w, h, segundos);
    }

    public async Task<MediaPreparado> Procesar(string entrada, bool video, CancellationToken ct)
    {
        var turno = video ? turnoVideo : turnoFoto;
        await turno.WaitAsync(ct);
        var carpeta = Path.Combine(Path.GetTempPath(), "pico-media-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(carpeta);
        try
        {
            byte[] cabecera = new byte[12];
            await using (var f = File.OpenRead(entrada)) { if (f.Length < 12) throw ReglaNegocioException.Validacion("Archivo incompleto."); await f.ReadExactlyAsync(cabecera, ct); }
            bool jpg = cabecera[0] == 255 && cabecera[1] == 216 && cabecera[2] == 255;
            bool png = cabecera.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10});
            bool webp = System.Text.Encoding.ASCII.GetString(cabecera, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(cabecera, 8, 4) == "WEBP";
            bool mp4 = System.Text.Encoding.ASCII.GetString(cabecera, 4, 4) == "ftyp";
            bool webm = cabecera.AsSpan(0, 4).SequenceEqual(new byte[] {26,69,223,163});
            if (video ? !(mp4 || webm) : !(jpg || png || webp)) throw ReglaNegocioException.Validacion("El contenido del archivo no es una foto o video permitido.");
            var original = await Inspeccionar(entrada, video, ct);
            var salida = Path.Combine(carpeta, video ? "video.mp4" : "foto.webp");
            var argumentos = video ? ArgumentosVideo(entrada).ToList() : new List<string> { "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-threads", "2", "-i", entrada, "-map_metadata", "-1", "-map", "0:v:0", "-filter_threads", "1" };
            if (!video) argumentos.AddRange(["-vf", "scale=w='min(2048,iw)':h='min(2048,ih)':force_original_aspect_ratio=decrease", "-frames:v", "1", "-c:v", "libwebp", "-quality", "85", "-threads", "2"]);
            argumentos.Add(salida);
            await Ejecutar("ffmpeg", argumentos, ct);
            if (new FileInfo(salida).Length > 48L * 1024 * 1024) throw ReglaNegocioException.Validacion("El video procesado es demasiado grande. Prueba con una resolución menor.");
            var datos = await Inspeccionar(salida, video, ct);
            byte[]? portada = null;
            if (video)
            {
                var miniatura = Path.Combine(carpeta, "portada.webp");
                await Ejecutar("ffmpeg", ["-nostdin", "-v", "error", "-y", "-threads", "2", "-i", salida, "-frames:v", "1", "-vf", "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease", "-c:v", "libwebp", "-quality", "80", miniatura], ct);
                portada = await File.ReadAllBytesAsync(miniatura, ct);
            }
            return new(await File.ReadAllBytesAsync(salida, ct), datos.W, datos.H, original.Segundos, portada);
        }
        finally { Directory.Delete(carpeta, true); turno.Release(); }
    }
}
