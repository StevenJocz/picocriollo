using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using PicoCriollo.Domain.DTOs;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.API.Controllers
{
    [Route("api/auth")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IUsuarioCommands _usuarioCommands;
        private readonly IUsuarioQueries _usuarioQueries;

        public AuthController(IUsuarioCommands usuarioCommands, IUsuarioQueries usuarioQueries)
        {
            _usuarioCommands = usuarioCommands;
            _usuarioQueries = usuarioQueries;
        }

        [HttpPost("login")]
        [EnableRateLimiting("auth")]
        public async Task<ActionResult<InicioRespuestaDto>> Login([FromBody] UsuarioInicioDto dto) =>
            Ok(await _usuarioCommands.IniciarSesionAsync(dto));

        [HttpPost("registro")]
        [EnableRateLimiting("auth")]
        public async Task<ActionResult<InicioRespuestaDto>> Registro([FromBody] RegistroDto dto) =>
            Ok(await _usuarioCommands.RegistrarAsync(dto));

        [HttpPost("refrescar")]
        [EnableRateLimiting("auth")]
        public async Task<ActionResult<InicioRespuestaDto>> Refrescar([FromBody] RefrescarDto dto) =>
            Ok(await _usuarioCommands.RefrescarAsync(dto));

        [HttpPost("salir")]
        public async Task<ActionResult<RespuestaDto>> Salir([FromBody] RefrescarDto dto) =>
            Ok(await _usuarioCommands.CerrarSesionAsync(dto));

        [HttpPost("olvido-password")]
        [EnableRateLimiting("olvido")]
        public async Task<ActionResult<RespuestaDto>> OlvidoPassword([FromBody] OlvidoPasswordDto dto) =>
            Ok(await _usuarioCommands.OlvidoPasswordAsync(dto));

        [HttpPost("restablecer-password")]
        [EnableRateLimiting("auth")]
        public async Task<ActionResult<RespuestaDto>> RestablecerPassword([FromBody] RestablecerPasswordDto dto) =>
            Ok(await _usuarioCommands.RestablecerPasswordAsync(dto));

        [Authorize]
        [HttpGet("yo")]
        public async Task<ActionResult<UsuarioDto>> Yo()
        {
            if (!Guid.TryParse(User.FindFirst("sub")?.Value, out Guid id)) return Unauthorized();
            UsuarioDto? usuario = await _usuarioQueries.ObtenerUsuarioAsync(id);
            return usuario is null ? Unauthorized() : Ok(usuario);
        }
    }
}
