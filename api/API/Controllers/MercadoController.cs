using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.API.Controllers
{
    public abstract class MercadoBaseController : ControllerBase
    {
        protected Guid Usuario => QuienMira ?? throw ReglaNegocioException.NoAutorizado("Tu sesión ya no es válida. Inicia sesión de nuevo.");
        protected Guid? QuienMira => Guid.TryParse(User.FindFirst("sub")?.Value, out Guid id) ? id : null;
    }

    /// <summary>
    /// El mercado: explorar y ver publicaciones (abierto a todos), publicar aves, ofertar en subastas, mostrar interés,
    /// pedir una compra y escribirle al vendedor. Las reglas viven en los comandos, no aquí.
    /// </summary>
    [Authorize]
    [Route("api/mercado")]
    [ApiController]
    public class MercadoController : MercadoBaseController
    {
        private readonly IMercadoQueries _queries;
        private readonly IPublicacionCommands _publicaciones;
        private readonly ISubastaCommands _subastas;
        private readonly IOperacionCommands _operaciones;
        private readonly IMensajeCommands _mensajes;

        public MercadoController(IMercadoQueries queries, IPublicacionCommands publicaciones, ISubastaCommands subastas, IOperacionCommands operaciones, IMensajeCommands mensajes)
        {
            _queries = queries;
            _publicaciones = publicaciones;
            _subastas = subastas;
            _operaciones = operaciones;
            _mensajes = mensajes;
        }

        // Explorar
        [AllowAnonymous]
        [HttpGet]
        public async Task<ActionResult<ListadoMercadoDto>> Explorar([FromQuery] string? q, [FromQuery] string? type, [FromQuery] string? breed, [FromQuery] string? species, [FromQuery] string? sex,
            [FromQuery] string? kind, [FromQuery] long? min, [FromQuery] long? max, [FromQuery] int? limit, [FromQuery] int? offset) =>
            Ok(await _queries.ExplorarAsync(new FiltroMercado { Q = q, Type = type, Breed = breed, Species = species, Sex = sex, Kind = kind, Min = min, Max = max, Limit = limit, Offset = offset }, QuienMira));

        [AllowAnonymous]
        [HttpGet("{id}")]
        public async Task<ActionResult<DetallePublicacionDto>> Detalle(string id) => Ok(await _queries.DetalleAsync(id, QuienMira));

        [AllowAnonymous]
        [HttpGet("vendedores/{id}/reputacion")]
        public async Task<ActionResult<ReputacionPublicaDto>> Reputacion(string id) => Ok(await _queries.ReputacionAsync(id));

        // Mis publicaciones
        [HttpGet("mias")]
        public async Task<ActionResult<List<MiPublicacionDto>>> Mias([FromQuery] string? filtro) => Ok(await _queries.MisPublicacionesAsync(Usuario, filtro));

        [HttpPost("publicaciones")]
        public async Task<ActionResult<PublicacionGuardadaDto>> Crear([FromBody] PublicacionNuevaDto dto) => Ok(await _publicaciones.CrearAsync(Usuario, dto));
        [HttpPut("publicaciones/{id}")]
        public async Task<ActionResult<PublicacionGuardadaDto>> Actualizar(string id, [FromBody] PublicacionCambioDto dto) => Ok(await _publicaciones.ActualizarAsync(Usuario, id, dto));
        [HttpPost("publicaciones/{id}/publicar")]
        public async Task<ActionResult<PublicacionGuardadaDto>> Publicar(string id) => Ok(await _publicaciones.PublicarAsync(Usuario, id));
        [HttpPost("publicaciones/{id}/pausar")]
        public async Task<ActionResult<PublicacionGuardadaDto>> Pausar(string id) => Ok(await _publicaciones.PausarAsync(Usuario, id));
        [HttpPost("publicaciones/{id}/reanudar")]
        public async Task<ActionResult<PublicacionGuardadaDto>> Reanudar(string id) => Ok(await _publicaciones.ReanudarAsync(Usuario, id));
        [HttpPost("publicaciones/{id}/retirar")]
        public async Task<ActionResult<PublicacionGuardadaDto>> Retirar(string id) => Ok(await _publicaciones.RetirarAsync(Usuario, id));
        [HttpPost("publicaciones/{id}/actualizar-ficha")]
        public async Task<ActionResult<PublicacionGuardadaDto>> ActualizarFicha(string id) => Ok(await _publicaciones.ActualizarFichaAsync(Usuario, id));

        // Interesados
        [HttpGet("publicaciones/{id}/interesados")]
        public async Task<ActionResult<List<InteresadoDto>>> Interesados(string id) => Ok(await _queries.InteresadosAsync(Usuario, id));
        [HttpPost("publicaciones/{id}/interes")]
        public async Task<IActionResult> MostrarInteres(string id, [FromBody] InteresDto dto) { await _publicaciones.MostrarInteresAsync(Usuario, id, dto); return NoContent(); }
        [HttpDelete("publicaciones/{id}/interes")]
        public async Task<IActionResult> RetirarInteres(string id) { await _publicaciones.RetirarInteresAsync(Usuario, id); return NoContent(); }

        // Subastas
        [HttpPost("publicaciones/{id}/ofertas")]
        public async Task<ActionResult<OfertaPublicaDto>> Ofertar(string id, [FromBody] OfertaDto dto) => Ok(await _subastas.OfertarAsync(Usuario, id, dto));
        [HttpPost("publicaciones/{id}/cancelar-subasta")]
        public async Task<ActionResult<PublicacionGuardadaDto>> CancelarSubasta(string id, [FromBody] MotivoDto dto) => Ok(await _subastas.CancelarAsync(Usuario, id, dto));
        [HttpGet("mis-ofertas")]
        public async Task<ActionResult<List<MiOfertaDto>>> MisOfertas() => Ok(await _queries.MisOfertasAsync(Usuario));

        // Compra directa
        [HttpPost("publicaciones/{id}/solicitud")]
        public async Task<ActionResult<OperacionGuardadaDto>> SolicitarCompra(string id, [FromBody] SolicitudCompraDto dto) => Ok(await _operaciones.SolicitarCompraAsync(Usuario, id, dto));

        // Mensajes
        [HttpPost("mensajes")]
        public async Task<ActionResult<MensajeEnviadoDto>> Enviar([FromBody] MensajeNuevoDto dto) => Ok(await _mensajes.EnviarAsync(Usuario, dto));
        [HttpGet("conversaciones")]
        public async Task<ActionResult<List<ResumenConversacionDto>>> Conversaciones() => Ok(await _queries.ConversacionesAsync(Usuario));
        [HttpGet("conversaciones/{id}")]
        public async Task<ActionResult<ConversacionDto>> Conversacion(string id) => Ok(await _queries.ConversacionAsync(Usuario, id));
    }

    /// <summary>Operaciones de compraventa (de la solicitud a la transferencia), comprobantes, facturas y procedencia de las aves.</summary>
    [Authorize]
    [Route("api")]
    [ApiController]
    public class OperacionesController : MercadoBaseController
    {
        private readonly IMercadoQueries _queries;
        private readonly IOperacionCommands _comandos;

        public OperacionesController(IMercadoQueries queries, IOperacionCommands comandos)
        {
            _queries = queries;
            _comandos = comandos;
        }

        [HttpGet("operaciones")]
        public async Task<ActionResult<List<OperacionVistaDto>>> Listar([FromQuery] string? rol) => Ok(await _queries.OperacionesAsync(Usuario, rol));

        [HttpPost("operaciones/{id}/responder")]
        public async Task<ActionResult<OperacionGuardadaDto>> Responder(string id, [FromBody] RespuestaSolicitudDto dto) =>
            Ok(await _comandos.ResponderAsync(Usuario, id, dto.Decision switch { "accept" => true, "reject" => false, _ => throw ReglaNegocioException.Validacion("La decisión debe ser accept o reject.") }));
        [HttpPost("operaciones/{id}/retirar")]
        public async Task<ActionResult<OperacionGuardadaDto>> Retirar(string id) => Ok(await _comandos.RetirarSolicitudAsync(Usuario, id));
        [HttpPost("operaciones/{id}/pago")]
        public async Task<ActionResult<OperacionGuardadaDto>> DeclararPago(string id, [FromBody] PagoDto dto) => Ok(await _comandos.DeclararPagoAsync(Usuario, id, dto));
        [HttpPost("operaciones/{id}/confirmar-pago")]
        public async Task<ActionResult<OperacionGuardadaDto>> ConfirmarPago(string id) => Ok(await _comandos.ConfirmarPagoAsync(Usuario, id));
        [HttpPost("operaciones/{id}/entrega")]
        public async Task<ActionResult<OperacionGuardadaDto>> Entrega(string id) => Ok(await _comandos.MarcarEntregaAsync(Usuario, id));
        [HttpPost("operaciones/{id}/recepcion")]
        public async Task<ActionResult<RecepcionDto>> Recepcion(string id) => Ok(await _comandos.ConfirmarRecepcionAsync(Usuario, id));
        [HttpPost("operaciones/{id}/cancelar")]
        public async Task<ActionResult<OperacionGuardadaDto>> Cancelar(string id, [FromBody] MotivoDto dto) => Ok(await _comandos.CancelarAsync(Usuario, id, dto));
        [HttpPost("operaciones/{id}/disputa")]
        public async Task<ActionResult<OperacionGuardadaDto>> Disputar(string id, [FromBody] MotivoDto dto) => Ok(await _comandos.DisputarAsync(Usuario, id, dto));
        [HttpPost("operaciones/{id}/compartir-contacto")]
        public async Task<ActionResult<OperacionGuardadaDto>> CompartirContacto(string id) => Ok(await _comandos.CompartirContactoAsync(Usuario, id));
        [HttpGet("operaciones/{id}/contacto")]
        public async Task<ActionResult<ContactoDto>> Contacto(string id) => Ok(await _queries.ContactoAsync(Usuario, id));
        [HttpPost("operaciones/{id}/valoracion")]
        public async Task<IActionResult> Valorar(string id, [FromBody] ValoracionDto dto) { await _comandos.ValorarAsync(Usuario, id, dto); return NoContent(); }

        [HttpGet("comprobantes/{codigo}")]
        public async Task<ActionResult<ComprobanteDto>> Comprobante(string codigo) => Ok(await _queries.ComprobanteAsync(Usuario, codigo));
        [HttpGet("facturas")]
        public async Task<ActionResult<List<ResumenFacturaDto>>> Facturas([FromQuery] string? rol) => Ok(await _queries.FacturasAsync(Usuario, rol));
        [HttpGet("facturas/{numero}")]
        public async Task<ActionResult<FacturaDto>> Factura(string numero) => Ok(await _queries.FacturaAsync(Usuario, numero));
        [HttpGet("aves/{id}/procedencia")]
        public async Task<ActionResult<ProcedenciaDto>> Procedencia(string id) => Ok(await _queries.ProcedenciaAsync(Usuario, id));
    }
}
