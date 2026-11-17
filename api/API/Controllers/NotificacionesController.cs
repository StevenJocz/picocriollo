using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PicoCriollo.Domain.DTOs.NotificacionesD;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.API.Controllers
{
    /// <summary>La bandeja de notificaciones de quien tiene la sesión, sus preferencias y los teléfonos que reciben avisos push.</summary>
    [Authorize]
    [Route("api/notificaciones")]
    [ApiController]
    public class NotificacionesController : MercadoBaseController
    {
        private readonly INotificacionQueries _queries;
        private readonly INotificacionCommands _comandos;

        public NotificacionesController(INotificacionQueries queries, INotificacionCommands comandos)
        {
            _queries = queries;
            _comandos = comandos;
        }

        [HttpGet]
        public async Task<ActionResult<List<NotificacionDto>>> Listar([FromQuery] string? estado, [FromQuery] string? categoria, [FromQuery] int? limite, [FromQuery] string? antes) =>
            Ok(await _queries.ListarAsync(Usuario, estado, categoria, limite, antes));

        [HttpGet("resumen")]
        public async Task<ActionResult<ResumenNotificacionesDto>> Resumen() => Ok(await _queries.ResumenAsync(Usuario));

        [HttpPost("leer")]
        public async Task<ActionResult<CambiosDto>> Leer([FromBody] LeerDto dto) => Ok(new CambiosDto { Changed = await _comandos.LeerAsync(Usuario, dto.Ids) });

        [HttpPost("leer-todas")]
        public async Task<ActionResult<CambiosDto>> LeerTodas() => Ok(new CambiosDto { Changed = await _comandos.LeerTodasAsync(Usuario) });

        [HttpPost("leer-enlace")]
        public async Task<ActionResult<CambiosDto>> LeerEnlace([FromBody] LeerEnlaceDto dto) => Ok(new CambiosDto { Changed = await _comandos.LeerEnlaceAsync(Usuario, dto.Type, dto.LinkId) });

        [HttpGet("preferencias")]
        public async Task<ActionResult<PreferenciasDto>> Preferencias() => Ok(await _queries.PreferenciasAsync(Usuario));

        [HttpPut("preferencias")]
        public async Task<ActionResult<PreferenciasDto>> ActualizarPreferencias([FromBody] PreferenciasCambioDto dto) => Ok(await _comandos.ActualizarPreferenciasAsync(Usuario, dto));

        [HttpGet("canales")]
        public ActionResult<List<CanalDto>> Canales() => Ok(_queries.Canales());

        [HttpPost("dispositivos")]
        public async Task<IActionResult> RegistrarDispositivo([FromBody] DispositivoDto dto) { await _comandos.RegistrarDispositivoAsync(Usuario, dto); return NoContent(); }

        [HttpDelete("dispositivos")]
        public async Task<IActionResult> QuitarDispositivo([FromQuery] string token) { await _comandos.QuitarDispositivoAsync(Usuario, token); return NoContent(); }
    }
}
