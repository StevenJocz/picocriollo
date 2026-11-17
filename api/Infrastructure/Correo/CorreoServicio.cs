using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace PicoCriollo.Infrastructure.Correo
{
    public class CorreoOpciones
    {
        public const string Seccion = "Smtp";
        public string Host { get; set; } = string.Empty;
        public int Puerto { get; set; } = 587;
        public string Usuario { get; set; } = string.Empty;
        public string Clave { get; set; } = string.Empty;
        /// <summary>Remitente, por ejemplo: Pico Criollo &lt;avisos@tudominio.com&gt;.</summary>
        public string Desde { get; set; } = string.Empty;
    }

    public interface ICorreoServicio
    {
        Task EnviarAsync(string para, string asunto, string texto, string html, CancellationToken cancelar = default);
    }

    public class CorreoServicio : ICorreoServicio
    {
        private readonly CorreoOpciones _opciones;
        private readonly ILogger<CorreoServicio> _logger;

        public CorreoServicio(IOptions<CorreoOpciones> opciones, ILogger<CorreoServicio> logger)
        {
            _opciones = opciones.Value;
            _logger = logger;
        }

        public async Task EnviarAsync(string para, string asunto, string texto, string html, CancellationToken cancelar = default)
        {
            // Sin SMTP configurado no hay correo: el mensaje queda en el registro del servidor para quien administra.
            if (string.IsNullOrWhiteSpace(_opciones.Host) || string.IsNullOrWhiteSpace(_opciones.Desde))
            {
                _logger.LogWarning("SMTP sin configurar. Correo para {Para}: {Asunto}\n{Texto}", para, asunto, texto);
                return;
            }

            var mensaje = new MimeMessage();
            mensaje.From.Add(MailboxAddress.Parse(_opciones.Desde));
            mensaje.To.Add(MailboxAddress.Parse(para));
            mensaje.Subject = asunto;
            mensaje.Body = new BodyBuilder { TextBody = texto, HtmlBody = html }.ToMessageBody();

            using var cliente = new SmtpClient();
            await cliente.ConnectAsync(_opciones.Host, _opciones.Puerto, SecureSocketOptions.Auto, cancelar);
            if (!string.IsNullOrEmpty(_opciones.Usuario)) await cliente.AuthenticateAsync(_opciones.Usuario, _opciones.Clave, cancelar);
            await cliente.SendAsync(mensaje, cancelar);
            await cliente.DisconnectAsync(true, cancelar);
        }
    }
}
