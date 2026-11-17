using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Commands;
namespace PicoCriollo.API.Controllers;

[Authorize, ApiController, Route("api/moderacion")]
public class ModeracionController(IModeracionCommands comandos) : MercadoBaseController
{
    [HttpPost("denuncias")]
    public async Task<ActionResult<Denuncia>> Denunciar(DenunciaNuevaDto dto) => Ok(await comandos.DenunciarAsync(Usuario, dto));
    [HttpGet("denuncias")]
    public async Task<ActionResult<List<DenunciaVista>>> Listar() => Ok(await comandos.ListarAsync(Usuario));
    [HttpPost("denuncias/{id}/resolver")]
    public async Task<ActionResult<Denuncia>> Resolver(string id, DecisionModeracionDto dto) => Ok(await comandos.ResolverAsync(Usuario, id, dto));
    [HttpPost("publicaciones/{id}")]
    public async Task<IActionResult> Publicacion(string id, DecisionModeracionDto dto) { await comandos.ModerarPublicacionAsync(Usuario, id, dto); return NoContent(); }
    [HttpGet("disputas")]
    public async Task<ActionResult<List<Operacion>>> Disputas() => Ok(await comandos.DisputasAsync(Usuario));
    [HttpPost("disputas/{id}/resolver")]
    public async Task<IActionResult> Disputa(string id, DecisionModeracionDto dto) { await comandos.ResolverDisputaAsync(Usuario, id, dto); return NoContent(); }
}
