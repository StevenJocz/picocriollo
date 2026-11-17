using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.API.Controllers
{
    /// <summary>
    /// «Mi granja» de la persona que inició sesión. El documento se lee entero (GET) y se cambia con órdenes por registro:
    /// cada una se valida en el servidor y devuelve la nueva versión del documento.
    /// </summary>
    [Authorize]
    [Route("api/granja")]
    [ApiController]
    public class GranjaController : ControllerBase
    {
        private readonly IGranjaQueries _queries;
        private readonly IGranjaCommands _commands;

        public GranjaController(IGranjaQueries queries, IGranjaCommands commands)
        {
            _queries = queries;
            _commands = commands;
        }

        private Guid Usuario => Guid.TryParse(User.FindFirst("sub")?.Value, out Guid id)
            ? id
            : throw ReglaNegocioException.NoAutorizado("Tu sesión ya no es válida. Inicia sesión de nuevo.");

        [HttpGet]
        public async Task<ActionResult<GranjaDto>> Obtener() => Ok(await _queries.ObtenerGranjaAsync(Usuario));

        /// <summary>De dónde sale algo y qué se hizo con él: se busca por código (AVE-…, FER-…, VEN-…).</summary>
        [HttpGet("trazabilidad")]
        public async Task<ActionResult<List<FilaDeTrazaDto>>> Trazar([FromQuery] string codigo) => Ok(await _queries.TrazarAsync(Usuario, codigo));

        [HttpGet("resumen-comercial")]
        public async Task<ActionResult<ResumenComercialDto>> ResumenComercial([FromQuery] string? desde, [FromQuery] string? hasta) => Ok(await _queries.ResumenComercialAsync(Usuario, desde, hasta));

        // Gallineros
        [HttpPost("gallineros")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearGallinero([FromBody] GallineroDto dto) => Ok(await _commands.CrearGallineroAsync(Usuario, dto));
        [HttpPut("gallineros/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarGallinero(string id, [FromBody] GallineroDto dto) => Ok(await _commands.ActualizarGallineroAsync(Usuario, id, dto));
        [HttpDelete("gallineros/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarGallinero(string id) => Ok(await _commands.EliminarGallineroAsync(Usuario, id));

        // Aves
        [HttpPost("aves")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearAve([FromBody] AveDto dto) => Ok(await _commands.CrearAveAsync(Usuario, dto));
        [HttpPut("aves/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarAve(string id, [FromBody] AveDto dto) => Ok(await _commands.ActualizarAveAsync(Usuario, id, dto));
        [HttpDelete("aves/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarAve(string id) => Ok(await _commands.EliminarAveAsync(Usuario, id));

        // Recolección de huevos
        [HttpPost("recolecciones")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearRecoleccion([FromBody] RecoleccionDto dto) => Ok(await _commands.CrearRecoleccionAsync(Usuario, dto));
        [HttpPut("recolecciones/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarRecoleccion(string id, [FromBody] RecoleccionDto dto) => Ok(await _commands.ActualizarRecoleccionAsync(Usuario, id, dto));
        [HttpDelete("recolecciones/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarRecoleccion(string id) => Ok(await _commands.EliminarRecoleccionAsync(Usuario, id));

        // Incubación
        [HttpPost("incubaciones")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearIncubacion([FromBody] IncubacionDto dto) => Ok(await _commands.CrearIncubacionAsync(Usuario, dto));
        [HttpPut("incubaciones/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarIncubacion(string id, [FromBody] IncubacionDto dto) => Ok(await _commands.ActualizarIncubacionAsync(Usuario, id, dto));
        [HttpDelete("incubaciones/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarIncubacion(string id) => Ok(await _commands.EliminarIncubacionAsync(Usuario, id));

        // Compras e inventario
        [HttpPost("compras")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearCompra([FromBody] CompraDto dto) => Ok(await _commands.CrearCompraAsync(Usuario, dto));
        [HttpPut("compras/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarCompra(string id, [FromBody] CompraDto dto) => Ok(await _commands.ActualizarCompraAsync(Usuario, id, dto));
        [HttpDelete("compras/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarCompra(string id) => Ok(await _commands.EliminarCompraAsync(Usuario, id));
        [HttpPost("consumos")]
        public async Task<ActionResult<RegistroGuardadoDto>> RegistrarConsumo([FromBody] ConsumoDto dto) => Ok(await _commands.RegistrarConsumoAsync(Usuario, dto));

        // Agenda (limpieza y mantenimiento)
        [HttpPost("tareas")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearTarea([FromBody] TareaDto dto) => Ok(await _commands.CrearTareaAsync(Usuario, dto));
        [HttpPut("tareas/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarTarea(string id, [FromBody] TareaDto dto) => Ok(await _commands.ActualizarTareaAsync(Usuario, id, dto));
        [HttpDelete("tareas/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarTarea(string id) => Ok(await _commands.EliminarTareaAsync(Usuario, id));
        [HttpPost("tareas/{id}/completar")]
        public async Task<ActionResult<RegistroGuardadoDto>> CompletarTarea(string id, [FromBody] CompletarTareaDto? dto) => Ok(await _commands.CompletarTareaAsync(Usuario, id, dto ?? new CompletarTareaDto()));

        // Nacimientos
        [HttpPost("nacimientos")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearNacimiento([FromBody] NacimientoDto dto) => Ok(await _commands.CrearNacimientoAsync(Usuario, dto));
        [HttpPut("nacimientos/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarNacimiento(string id, [FromBody] NacimientoDto dto) => Ok(await _commands.ActualizarNacimientoAsync(Usuario, id, dto));
        [HttpDelete("nacimientos/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarNacimiento(string id) => Ok(await _commands.EliminarNacimientoAsync(Usuario, id));

        // Grupos reproductores
        [HttpPost("grupos-reproductores")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearGrupo([FromBody] GrupoReproductorDto dto) => Ok(await _commands.CrearGrupoReproductorAsync(Usuario, dto));
        [HttpPut("grupos-reproductores/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarGrupo(string id, [FromBody] GrupoReproductorDto dto) => Ok(await _commands.ActualizarGrupoReproductorAsync(Usuario, id, dto));
        [HttpDelete("grupos-reproductores/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarGrupo(string id) => Ok(await _commands.EliminarGrupoReproductorAsync(Usuario, id));

        // Anillos y eventos de cada ave
        [HttpPost("anillos/asignar")]
        public async Task<ActionResult<RegistroGuardadoDto>> AsignarAnillo([FromBody] AsignarAnilloDto dto) => Ok(await _commands.AsignarAnilloAsync(Usuario, dto));
        [HttpPost("anillos/retirar")]
        public async Task<ActionResult<RegistroGuardadoDto>> RetirarAnillo([FromBody] RetirarAnilloDto dto) => Ok(await _commands.RetirarAnilloAsync(Usuario, dto));
        [HttpPost("anillos/inhabilitar")]
        public async Task<ActionResult<RegistroGuardadoDto>> InhabilitarAnillo([FromBody] InhabilitarAnilloDto dto) => Ok(await _commands.InhabilitarAnilloAsync(Usuario, dto));
        [HttpPost("anillos/activar")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActivarAnillo([FromBody] ActivarAnilloDto dto) => Ok(await _commands.ActivarAnilloAsync(Usuario, dto));
        [HttpPost("eventos-ave")]
        public async Task<ActionResult<RegistroGuardadoDto>> RegistrarEventoAve([FromBody] EventoAveDto dto) => Ok(await _commands.RegistrarEventoAveAsync(Usuario, dto));

        // Clientes y productos propios
        [HttpPost("clientes")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearCliente([FromBody] ClienteDto dto) => Ok(await _commands.CrearClienteAsync(Usuario, dto));
        [HttpPut("clientes/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarCliente(string id, [FromBody] ClienteDto dto) => Ok(await _commands.ActualizarClienteAsync(Usuario, id, dto));
        [HttpDelete("clientes/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarCliente(string id) => Ok(await _commands.EliminarClienteAsync(Usuario, id));
        [HttpPost("productos")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearProducto([FromBody] ProductoDto dto) => Ok(await _commands.CrearProductoAsync(Usuario, dto));
        [HttpPut("productos/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarProducto(string id, [FromBody] ProductoDto dto) => Ok(await _commands.ActualizarProductoAsync(Usuario, id, dto));
        [HttpDelete("productos/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> EliminarProducto(string id) => Ok(await _commands.EliminarProductoAsync(Usuario, id));

        // Lotes de huevos
        [HttpPost("lotes-huevos")]
        public async Task<ActionResult<RegistroGuardadoDto>> CrearLoteHuevos([FromBody] LoteHuevosNuevoDto dto) => Ok(await _commands.CrearLoteHuevosAsync(Usuario, dto));
        [HttpPost("lotes-huevos/{id}/dividir")]
        public async Task<ActionResult<RegistroGuardadoDto>> DividirLote(string id, [FromBody] DividirLoteDto dto) => Ok(await _commands.DividirLoteHuevosAsync(Usuario, id, dto));
        [HttpPut("lotes-huevos/{id}")]
        public async Task<ActionResult<RegistroGuardadoDto>> ActualizarLote(string id, [FromBody] LoteHuevosCambioDto dto) => Ok(await _commands.ActualizarLoteHuevosAsync(Usuario, id, dto));

        // Ventas
        [HttpPost("ventas")]
        public async Task<ActionResult<RegistroGuardadoDto>> RegistrarVenta([FromBody] VentaNuevaDto dto) => Ok(await _commands.RegistrarVentaAsync(Usuario, dto));
        [HttpPost("ventas/{id}/anular")]
        public async Task<ActionResult<RegistroGuardadoDto>> AnularVenta(string id) => Ok(await _commands.AnularVentaAsync(Usuario, id));
        [HttpPost("ventas/{id}/abonos")]
        public async Task<ActionResult<RegistroGuardadoDto>> Abonar(string id, [FromBody] AbonoDto dto) => Ok(await _commands.RegistrarAbonoAsync(Usuario, id, dto));
        [HttpPost("ventas/{id}/devoluciones")]
        public async Task<ActionResult<RegistroGuardadoDto>> Devolver(string id, [FromBody] DevolucionDto dto) => Ok(await _commands.DevolverLineaAsync(Usuario, id, dto));
    }
}
