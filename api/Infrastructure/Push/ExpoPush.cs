using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace PicoCriollo.Infrastructure.Push
{
    public record MensajePush(string Token, string Titulo, string Cuerpo, string Vista, string? Id);

    public interface IEnviadorPush
    {
        /// <summary>Envía los avisos. Devuelve los tokens que Expo dice que ya no existen (la app se desinstaló): hay que olvidarlos.</summary>
        Task<IReadOnlyList<string>> EnviarAsync(IReadOnlyList<MensajePush> mensajes, CancellationToken cancelar = default);
    }

    public class PushOpciones
    {
        public const string Seccion = "Expo";
        /// <summary>Opcional: el token de acceso de Expo si activaste «enhanced security» para las notificaciones push.</summary>
        public string? AccessToken { get; set; }
        public string Url { get; set; } = "https://exp.host/--/api/v2/push/send";
    }

    /// <summary>Servicio de notificaciones push de Expo (https://docs.expo.dev/push-notifications/sending-notifications/). Sin credenciales propias: solo necesita los tokens de los teléfonos.</summary>
    public class ExpoPush : IEnviadorPush
    {
        private readonly HttpClient _http;
        private readonly PushOpciones _opciones;
        private readonly ILogger<ExpoPush> _logger;

        public ExpoPush(HttpClient http, IOptions<PushOpciones> opciones, ILogger<ExpoPush> logger)
        {
            _http = http;
            _opciones = opciones.Value;
            _logger = logger;
        }

        public async Task<IReadOnlyList<string>> EnviarAsync(IReadOnlyList<MensajePush> mensajes, CancellationToken cancelar = default)
        {
            var olvidar = new List<string>();
            // Expo recibe hasta 100 mensajes por llamada.
            foreach (MensajePush[] lote in mensajes.Chunk(100))
            {
                using var peticion = new HttpRequestMessage(HttpMethod.Post, _opciones.Url)
                {
                    Content = JsonContent.Create(lote.Select(m => new { to = m.Token, title = m.Titulo, body = m.Cuerpo, sound = "default", data = new { view = m.Vista, id = m.Id } })),
                };
                if (!string.IsNullOrWhiteSpace(_opciones.AccessToken)) peticion.Headers.Authorization = new("Bearer", _opciones.AccessToken);
                using HttpResponseMessage respuesta = await _http.SendAsync(peticion, cancelar);
                if (!respuesta.IsSuccessStatusCode) { _logger.LogWarning("Expo respondió {Estado} al enviar {Cantidad} avisos push", (int)respuesta.StatusCode, lote.Length); continue; }
                RespuestaExpo? cuerpo = await respuesta.Content.ReadFromJsonAsync<RespuestaExpo>(cancelar);
                for (int i = 0; i < lote.Length && cuerpo?.Data is { } tickets && i < tickets.Count; i++)
                {
                    if (tickets[i].Status == "ok") continue;
                    if (tickets[i].Details?.Error == "DeviceNotRegistered") olvidar.Add(lote[i].Token);
                    else _logger.LogWarning("Expo rechazó un aviso push: {Mensaje}", tickets[i].Message);
                }
            }
            return olvidar;
        }

        private class RespuestaExpo { [JsonPropertyName("data")] public List<Ticket>? Data { get; set; } }
        private class Ticket
        {
            [JsonPropertyName("status")] public string? Status { get; set; }
            [JsonPropertyName("message")] public string? Message { get; set; }
            [JsonPropertyName("details")] public Detalles? Details { get; set; }
        }
        private class Detalles { [JsonPropertyName("error")] public string? Error { get; set; } }
    }
}
