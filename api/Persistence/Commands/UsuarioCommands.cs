using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PicoCriollo.Domain.DTOs;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Entities.UsuarioE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure;
using PicoCriollo.Infrastructure.Correo;
using PicoCriollo.Infrastructure.Seguridad;

namespace PicoCriollo.Persistence.Commands
{
    public class AppOpciones
    {
        public const string Seccion = "App";
        /// <summary>Dirección pública de la app (https://app.ejemplo.co). El enlace del correo sale solo de aquí, nunca de la petición.</summary>
        public string Origen { get; set; } = string.Empty;
    }

    public interface IUsuarioCommands
    {
        Task<InicioRespuestaDto> RegistrarAsync(RegistroDto dto);
        Task<InicioRespuestaDto> IniciarSesionAsync(UsuarioInicioDto dto);
        Task<InicioRespuestaDto> RefrescarAsync(RefrescarDto dto);
        Task<RespuestaDto> CerrarSesionAsync(RefrescarDto dto);
        Task<RespuestaDto> OlvidoPasswordAsync(OlvidoPasswordDto dto);
        Task<RespuestaDto> RestablecerPasswordAsync(RestablecerPasswordDto dto);
    }

    public class UsuarioCommands : IUsuarioCommands
    {
        public static readonly TimeSpan VigenciaRestablecer = TimeSpan.FromMinutes(30);
        /// <summary>Si ya se envió un enlace hace menos de esto, no se genera otro (frena el correo masivo a una cuenta).</summary>
        public static readonly TimeSpan EsperaRestablecer = TimeSpan.FromMinutes(1);
        public const string MensajeOlvido = "Si el correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.";
        public const string EnlaceInvalido = "El enlace no es válido o ya venció. Pide uno nuevo.";
        public const string CredencialesInvalidas = "Correo o contraseña incorrectos.";
        public const string SesionInvalida = "Tu sesión ya no es válida. Inicia sesión de nuevo.";

        // El perfil se guarda como jsonb legible (tildes sin escapar); la app Node lo lee igual.
        private static readonly JsonSerializerOptions JsonLegible = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

        private readonly DBContext _contexto;
        private readonly IPassword _password;
        private readonly IGenerarToken _tokens;
        private readonly ICorreoServicio _correo;
        private readonly AppOpciones _app;
        private readonly TimeProvider _tiempo;
        private readonly ILogger<UsuarioCommands> _logger;

        public UsuarioCommands(DBContext contexto, IPassword password, IGenerarToken tokens, ICorreoServicio correo,
            IOptions<AppOpciones> app, TimeProvider tiempo, ILogger<UsuarioCommands> logger)
        {
            _contexto = contexto;
            _password = password;
            _tokens = tokens;
            _correo = correo;
            _app = app.Value;
            _tiempo = tiempo;
            _logger = logger;
        }

        private DateTime Ahora => _tiempo.GetUtcNow().UtcDateTime;

        public async Task<InicioRespuestaDto> RegistrarAsync(RegistroDto dto)
        {
            string correo = ReglasUsuario.NormalizarCorreo(dto.Correo);
            ReglasUsuario.ValidarPassword(dto.Password);
            string nombre = ReglasUsuario.ValidarNombreUsuario(dto.NombreUsuario);
            var ubicacion = ReglasUsuario.NormalizarUbicacion(dto.Ciudad, dto.Departamento);

            if (await _contexto.UsuarioEs.AnyAsync(u => u.Correo == correo))
                throw ReglaNegocioException.Conflicto("Ya existe una cuenta con ese correo.");
            await AsegurarNombreLibreAsync(nombre);

            DateTime ahora = Ahora;
            var perfil = new Dictionary<string, object> { ["displayName"] = nombre };
            if (ubicacion is { } lugar)
                perfil["location"] = lugar.Departamento is null ? new { city = lugar.Ciudad } : new { city = lugar.Ciudad, region = lugar.Departamento };

            var usuario = new UsuarioE
            {
                IdUsuario = Guid.NewGuid(),
                Correo = correo,
                PasswordHash = await _password.HashearPasswordAsync(dto.Password),
                FechaCreacion = ahora,
                Perfil = JsonSerializer.Serialize(perfil, JsonLegible),
            };
            _contexto.UsuarioEs.Add(usuario);
            _contexto.GranjaEs.Add(new GranjaE { IdUsuario = usuario.IdUsuario, Datos = GranjaVacia.Json(), Version = 1, ActualizadoEn = ahora });
            try { await _contexto.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (EsViolacionDeUnico(ex)) { throw ReglaNegocioException.Conflicto("Ya existe una cuenta con ese correo."); }

            return await EmitirSesionAsync(usuario);
        }

        public async Task<InicioRespuestaDto> IniciarSesionAsync(UsuarioInicioDto dto)
        {
            string correo = (dto.Correo ?? string.Empty).Trim().ToLowerInvariant();
            UsuarioE? usuario = await _contexto.UsuarioEs.FirstOrDefaultAsync(u => u.Correo == correo);
            if (usuario is null)
            {
                await _password.GastarTiempoAsync(dto.Password);
                throw ReglaNegocioException.NoAutorizado(CredencialesInvalidas);
            }
            if (!await _password.VerificarPasswordAsync(dto.Password, usuario.PasswordHash))
                throw ReglaNegocioException.NoAutorizado(CredencialesInvalidas);
            return await EmitirSesionAsync(usuario);
        }

        public async Task<InicioRespuestaDto> RefrescarAsync(RefrescarDto dto)
        {
            string hash = _tokens.HashearToken(dto.RefreshToken);
            RefrescoE? actual = await _contexto.RefrescoEs.FirstOrDefaultAsync(r => r.TokenHash == hash);
            if (actual is null) throw ReglaNegocioException.NoAutorizado(SesionInvalida);

            DateTime ahora = Ahora;
            if (actual.RevocadoEn is not null)
            {
                // Un token ya usado que vuelve a aparecer: alguien lo copió. Se cierran todas las sesiones de la cuenta.
                _logger.LogWarning("Reutilización de un token de refresco revocado para el usuario {Usuario}", actual.IdUsuario);
                await RevocarTodosAsync(actual.IdUsuario, ahora);
                await _contexto.SaveChangesAsync();
                throw ReglaNegocioException.NoAutorizado(SesionInvalida);
            }
            if (actual.ExpiraEn <= ahora) throw ReglaNegocioException.NoAutorizado(SesionInvalida);

            UsuarioE? usuario = await _contexto.UsuarioEs.FirstOrDefaultAsync(u => u.IdUsuario == actual.IdUsuario);
            if (usuario is null) throw ReglaNegocioException.NoAutorizado(SesionInvalida);
            return await EmitirSesionAsync(usuario, actual);
        }

        public async Task<RespuestaDto> CerrarSesionAsync(RefrescarDto dto)
        {
            string hash = _tokens.HashearToken(dto.RefreshToken);
            RefrescoE? actual = await _contexto.RefrescoEs.FirstOrDefaultAsync(r => r.TokenHash == hash);
            if (actual is { RevocadoEn: null })
            {
                actual.RevocadoEn = Ahora;
                await _contexto.SaveChangesAsync();
            }
            return new RespuestaDto { Respuesta = true, Mensaje = "Sesión cerrada." };
        }

        public async Task<RespuestaDto> OlvidoPasswordAsync(OlvidoPasswordDto dto)
        {
            string correo = ReglasUsuario.NormalizarCorreo(dto.Correo);
            var respuesta = new RespuestaDto { Respuesta = true, Mensaje = MensajeOlvido };

            UsuarioE? usuario = await _contexto.UsuarioEs.FirstOrDefaultAsync(u => u.Correo == correo);
            if (usuario is null || usuario.EsDemo || usuario.Suspendido) return respuesta;

            DateTime ahora = Ahora;
            List<RestablecimientoE> previos = await _contexto.RestablecimientoEs.Where(r => r.IdUsuario == usuario.IdUsuario).ToListAsync();
            if (previos.Any(r => ahora - r.CreadoEn < EsperaRestablecer)) return respuesta;

            _contexto.RestablecimientoEs.RemoveRange(previos);
            string token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            _contexto.RestablecimientoEs.Add(new RestablecimientoE { TokenHash = _tokens.HashearToken(token), IdUsuario = usuario.IdUsuario, CreadoEn = ahora, ExpiraEn = ahora + VigenciaRestablecer });
            await _contexto.SaveChangesAsync();

            if (string.IsNullOrWhiteSpace(_app.Origen))
            {
                _logger.LogError("Falta App:Origen: no se envía el enlace para restablecer la contraseña.");
                return respuesta;
            }
            string enlace = $"{_app.Origen.TrimEnd('/')}/restablecer?token={Uri.EscapeDataString(token)}";
            string para = usuario.Correo;
            // No se espera el envío: el tiempo de respuesta no debe delatar si la cuenta existe.
            _ = Task.Run(async () =>
            {
                try { await EnviarEnlaceAsync(para, enlace); }
                catch (Exception ex) { _logger.LogError(ex, "No se pudo enviar el correo de restablecimiento"); }
            });
            return respuesta;
        }

        public async Task<RespuestaDto> RestablecerPasswordAsync(RestablecerPasswordDto dto)
        {
            string nueva = ReglasUsuario.ValidarPassword(dto.Password);
            if (string.IsNullOrWhiteSpace(dto.Token) || dto.Token.Length < 20 || dto.Token.Length > 200)
                throw ReglaNegocioException.Validacion(EnlaceInvalido);

            string hash = _tokens.HashearToken(dto.Token);
            DateTime ahora = Ahora;
            RestablecimientoE? fila = await _contexto.RestablecimientoEs.FirstOrDefaultAsync(r => r.TokenHash == hash);
            if (fila is null || fila.ExpiraEn <= ahora) throw ReglaNegocioException.Validacion(EnlaceInvalido);
            UsuarioE? usuario = await _contexto.UsuarioEs.FirstOrDefaultAsync(u => u.IdUsuario == fila.IdUsuario);
            if (usuario is null || usuario.Suspendido) throw ReglaNegocioException.Validacion(EnlaceInvalido);

            usuario.PasswordHash = await _password.HashearPasswordAsync(nueva);
            _contexto.RestablecimientoEs.RemoveRange(await _contexto.RestablecimientoEs.Where(r => r.IdUsuario == usuario.IdUsuario).ToListAsync());
            await RevocarTodosAsync(usuario.IdUsuario, ahora);
            // Sesiones por cookie de la app Next.js, mientras convivan las dos.
            _contexto.SesionEs.RemoveRange(await _contexto.SesionEs.Where(s => s.IdUsuario == usuario.IdUsuario).ToListAsync());
            await _contexto.SaveChangesAsync();
            return new RespuestaDto { Respuesta = true, Mensaje = "Tu contraseña se cambió. Ya puedes entrar con la nueva." };
        }

        // ---------- apoyo ----------

        private async Task<InicioRespuestaDto> EmitirSesionAsync(UsuarioE usuario, RefrescoE? reemplaza = null)
        {
            DateTime ahora = Ahora;
            UsuarioDto datos = UsuarioDto.CreateDTO(usuario);
            var (acceso, expira) = _tokens.GenerarTokenAcceso(datos, ahora);
            var (refresco, hash) = _tokens.GenerarRefresco();
            _contexto.RefrescoEs.Add(new RefrescoE { TokenHash = hash, IdUsuario = usuario.IdUsuario, CreadoEn = ahora, ExpiraEn = ahora.AddDays(_tokens.DiasRefresco) });
            if (reemplaza is not null)
            {
                reemplaza.RevocadoEn = ahora;
                reemplaza.ReemplazadoPor = hash;
            }
            await _contexto.SaveChangesAsync();
            return new InicioRespuestaDto { Respuesta = true, Token = acceso, RefreshToken = refresco, ExpiraEnSegundos = (int)(expira - ahora).TotalSeconds, Datos = datos };
        }

        private async Task RevocarTodosAsync(Guid idUsuario, DateTime ahora)
        {
            foreach (RefrescoE token in await _contexto.RefrescoEs.Where(r => r.IdUsuario == idUsuario && r.RevocadoEn == null).ToListAsync())
                token.RevocadoEn = ahora;
        }

        // El nombre público es único sin importar mayúsculas, tildes ni espacios repetidos.
        // Se compara en memoria: el perfil es jsonb y Postgres no plega tildes sin una extensión. Revisar si la tabla crece mucho.
        private async Task AsegurarNombreLibreAsync(string nombre)
        {
            string clave = ReglasUsuario.ClaveNombre(nombre);
            foreach (string perfil in await _contexto.UsuarioEs.AsNoTracking().Select(u => u.Perfil).ToListAsync())
            {
                string? existente = new UsuarioE { Perfil = perfil }.NombreUsuario;
                if (existente is not null && ReglasUsuario.ClaveNombre(existente) == clave)
                    throw ReglaNegocioException.Conflicto("Ese nombre de usuario ya está en uso. Elige otro.");
            }
        }

        private Task EnviarEnlaceAsync(string para, string enlace)
        {
            string texto = $"Pediste restablecer tu contraseña de Pico Criollo.\n\nAbre este enlace (sirve 30 minutos y una sola vez):\n{enlace}\n\nSi no fuiste tú, ignora este mensaje: tu contraseña actual sigue igual.";
            string html = $"<div style=\"font-family:system-ui,Segoe UI,sans-serif;max-width:480px;margin:auto;padding:28px;color:#12261b\"><h2 style=\"margin:0 0 12px\">Restablece tu contraseña</h2><p style=\"line-height:1.55\">Pediste cambiar la contraseña de tu cuenta de <strong>Pico Criollo</strong>. El enlace sirve <strong>30 minutos</strong> y una sola vez.</p><p style=\"margin:24px 0\"><a href=\"{enlace}\" style=\"background:#2c7048;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:600;display:inline-block\">Crear contraseña nueva</a></p><p style=\"font-size:13px;color:#5a6b60;line-height:1.5\">Si el botón no abre, copia este enlace en tu navegador:<br>{enlace}</p><p style=\"font-size:13px;color:#5a6b60\">Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue igual.</p></div>";
            return _correo.EnviarAsync(para, "Pico Criollo · Restablece tu contraseña", texto, html);
        }

        private static bool EsViolacionDeUnico(DbUpdateException ex) => ex.InnerException is Npgsql.PostgresException { SqlState: "23505" };
    }
}
