using System.Text.RegularExpressions;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Commands
{
    public interface IMensajeCommands
    {
        Task<MensajeEnviadoDto> EnviarAsync(Guid usuario, MensajeNuevoDto dto);
    }

    /// <summary>
    /// Conversaciones entre comprador y vendedor sobre una publicación. El comprador abre la conversación desde la publicación;
    /// el vendedor solo responde dentro de una existente. Teléfonos y correos no circulan hasta que haya una operación aceptada.
    /// </summary>
    public class MensajeCommands : IMensajeCommands
    {
        private readonly AlmacenMercado _a;

        public MensajeCommands(AlmacenMercado almacen) => _a = almacen;

        public Task<MensajeEnviadoDto> EnviarAsync(Guid usuario, MensajeNuevoDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            await _a.AsegurarActivaAsync(yo);
            Conversacion hilo;
            if (!string.IsNullOrWhiteSpace(dto.ThreadId))
            {
                hilo = await _a.Conversaciones.ObtenerAsync(dto.ThreadId) ?? throw ReglaNegocioException.NoEncontrado("Conversación no encontrada.");
                if (!hilo.Participants.Contains(yo)) throw ReglaNegocioException.Prohibido("Esta conversación no es tuya.");
            }
            else
            {
                Publicacion p = string.IsNullOrWhiteSpace(dto.ListingId) ? throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.")
                    : await _a.Publicaciones.ObtenerAsync(dto.ListingId) is { Status: not EstadoPublicacion.Borrador } visible ? visible : throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
                if (p.SellerId == yo) throw ReglaNegocioException.Prohibido("Responde desde la conversación del comprador.");
                if (p.Status is not (EstadoPublicacion.Publicada or EstadoPublicacion.EnOperacion) && await Hilos.OperacionActivaAsync(_a, p.Id, yo) is null)
                    throw ReglaNegocioException.Conflicto("Esta publicación ya no admite mensajes nuevos.");
                hilo = await Hilos.AsegurarAsync(_a, p, yo);
            }
            Mensaje mensaje = await Hilos.AgregarAsync(_a, hilo, yo, dto.Body);
            return new MensajeEnviadoDto { ThreadId = hilo.Id, MessageId = mensaje.Id };
        });
    }

    public static partial class Hilos
    {
        private const int Maximo = 1000;
        private const int MensajesPorHora = 30;
        private static readonly string[] ContactoPermitido = [EstadoOperacion.Aceptada, EstadoOperacion.PagoPendiente, EstadoOperacion.PagoRegistrado, EstadoOperacion.EntregaPendiente, EstadoOperacion.EntregaConfirmada, EstadoOperacion.Completada];

        [GeneratedRegex(@"[\u0000-\u0008\u000b\u000c\u000e-\u001f]")] private static partial Regex Controles();

        public static async Task<Operacion?> OperacionActivaAsync(AlmacenMercado a, string publicacionId, string comprador) =>
            (await a.Operaciones.ListarAsync("listingId", publicacionId)).FirstOrDefault(o => o.BuyerId == comprador && o.Status != EstadoOperacion.Cancelada);

        public static async Task<Conversacion> AsegurarAsync(AlmacenMercado a, Publicacion publicacion, string comprador)
        {
            Conversacion? hilo = (await a.Conversaciones.ListarAsync("listingId", publicacion.Id)).FirstOrDefault(c => c.Participants.Contains(comprador));
            Operacion? op = await OperacionActivaAsync(a, publicacion.Id, comprador);
            if (hilo is not null)
            {
                if (op is not null && hilo.OperationId != op.Id) { hilo.OperationId = op.Id; a.Conversaciones.Actualizar(hilo); }
                return hilo;
            }
            hilo = new Conversacion { Id = Guid.NewGuid().ToString(), ListingId = publicacion.Id, OperationId = op?.Id, Participants = [publicacion.SellerId, comprador], CreatedAt = JsonMercado.Iso(a.Ahora) };
            a.Conversaciones.Insertar(hilo);
            return hilo;
        }

        /// <summary>Agrega un mensaje dentro de una orden ya abierta (también lo usa la solicitud de compra).</summary>
        public static async Task<Mensaje> AgregarAsync(AlmacenMercado a, Conversacion hilo, string remitente, string? cuerpo)
        {
            string texto = Controles().Replace(cuerpo ?? string.Empty, string.Empty).Trim();
            if (texto.Length == 0) throw ReglaNegocioException.Validacion("Escribe un mensaje.");
            if (texto.Length > Maximo) throw ReglaNegocioException.Validacion($"El mensaje supera {Maximo} caracteres.");
            if (!hilo.Participants.Contains(remitente)) throw ReglaNegocioException.Prohibido("Esta conversación no es tuya.");
            Operacion? op = hilo.OperationId is null ? null : await a.Operaciones.ObtenerAsync(hilo.OperationId);
            if (ReglasMercado.ContieneContacto(texto) && !(op is not null && ContactoPermitido.Contains(op.Status)))
                throw ReglaNegocioException.Validacion("Por seguridad no compartas teléfono ni correo en el chat hasta que la operación esté aceptada. Podrás compartir tu contacto con consentimiento de ambas partes.");
            DateTime desde = a.Ahora.AddHours(-1);
            if ((await a.Mensajes.ListarAsync("senderId", remitente)).Count(m => JsonMercado.Fecha(m.CreatedAt) >= desde) >= MensajesPorHora)
                throw ReglaNegocioException.Conflicto("Enviaste demasiados mensajes. Espera un momento antes de escribir de nuevo.");
            var mensaje = new Mensaje { Id = Guid.NewGuid().ToString(), ThreadId = hilo.Id, SenderId = remitente, Body = texto, CreatedAt = JsonMercado.Iso(a.Ahora) };
            a.Mensajes.Insertar(mensaje);
            string destinatario = hilo.Participants.First(id => id != remitente);
            await a.EmitirAsync("market.message.created", "thread", hilo.Id, new { threadId = hilo.Id, messageId = mensaje.Id, recipientId = destinatario, listingId = hilo.ListingId }, $"message:{mensaje.Id}");
            return mensaje;
        }
    }
}
