using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PicoCriollo.Domain.DTOs.SocialD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.API.Controllers
{
    /// <summary>Mi perfil y los perfiles públicos de los criadores: datos, redes, ubicación, seguir y el muro de publicaciones.</summary>
    [Authorize]
    [Route("api")]
    [ApiController]
    public class PerfilController : MercadoBaseController
    {
        private readonly ISocialQueries _queries;
        private readonly ISocialCommands _comandos;

        public PerfilController(ISocialQueries queries, ISocialCommands comandos)
        {
            _queries = queries;
            _comandos = comandos;
        }

        [HttpGet("perfil")]
        public async Task<ActionResult<MiPerfilDto>> MiPerfil() => Ok(await _queries.MiPerfilAsync(Usuario));

        [HttpGet("perfiles/destacados")]
        public async Task<ActionResult<List<PerfilDestacadoDto>>> Destacados() => Ok(await _queries.DestacadosAsync());

        [HttpPut("perfil")]
        public async Task<ActionResult<MiPerfilDto>> Actualizar([FromBody] PerfilCambioDto dto) { await _comandos.ActualizarPerfilAsync(Usuario, dto); return Ok(await _queries.MiPerfilAsync(Usuario)); }

        [HttpPut("perfil/redes")]
        public async Task<ActionResult<RedesVistaDto>> Redes([FromBody] RedesDto dto) => Ok(await _comandos.GuardarRedesAsync(Usuario, dto));

        [HttpPut("perfil/ubicacion")]
        public async Task<IActionResult> Ubicacion([FromBody] UbicacionDto dto) { await _comandos.GuardarUbicacionAsync(Usuario, dto); return NoContent(); }

        [HttpGet("perfiles/{id}")]
        public async Task<ActionResult<PerfilPublicoDto>> Perfil(string id) => Ok(await _queries.PerfilAsync(id, Usuario));

        [HttpGet("perfiles/{id}/publicaciones")]
        public async Task<ActionResult<PaginaPostsDto>> Muro(string id, [FromQuery] string? antes, [FromQuery] int? limite) => Ok(await _queries.MuroAsync(id, antes, limite, Usuario));

        [HttpPost("perfiles/{id}/seguir")]
        public async Task<ActionResult<SeguirResultadoDto>> Seguir(string id) => Ok(await _comandos.SeguirAsync(Usuario, id, true));

        [HttpDelete("perfiles/{id}/seguir")]
        public async Task<ActionResult<SeguirResultadoDto>> DejarDeSeguir(string id) => Ok(await _comandos.SeguirAsync(Usuario, id, false));
    }

    /// <summary>Publicaciones del perfil: crear, editar, borrar, compartir, me gusta y comentarios.</summary>
    [Authorize]
    [Route("api/publicaciones-perfil")]
    [ApiController]
    public class PublicacionesPerfilController : MercadoBaseController
    {
        private readonly ISocialQueries _queries;
        private readonly ISocialCommands _comandos;

        public PublicacionesPerfilController(ISocialQueries queries, ISocialCommands comandos)
        {
            _queries = queries;
            _comandos = comandos;
        }

        [HttpPost]
        public async Task<ActionResult<PostDto>> Crear([FromBody] PublicacionPerfilNuevaDto dto) => Ok(await _queries.PostAsync(await _comandos.CrearPublicacionAsync(Usuario, dto), Usuario));

        [HttpGet("{id}")]
        public async Task<ActionResult<PostDto>> Obtener(string id) => Ok(await _queries.PostAsync(id, Usuario));

        [HttpPut("{id}")]
        public async Task<ActionResult<PostDto>> Editar(string id, [FromBody] TextoDto dto) { await _comandos.EditarPublicacionAsync(Usuario, id, dto.Text); return Ok(await _queries.PostAsync(id, Usuario)); }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Borrar(string id) { await _comandos.BorrarPublicacionAsync(Usuario, id); return NoContent(); }

        [HttpPost("{id}/compartir")]
        public async Task<ActionResult<PostDto>> Compartir(string id, [FromBody] TextoDto dto) => Ok(await _queries.PostAsync(await _comandos.CompartirAsync(Usuario, id, dto.Text), Usuario));

        [HttpPut("{id}/me-gusta")]
        public async Task<ActionResult<MeGustaResultadoDto>> MeGusta(string id, [FromBody] MeGustaDto dto) => Ok(await _comandos.PonerMeGustaAsync(Usuario, id, dto.Liked));

        [HttpGet("{id}/me-gusta")]
        public async Task<ActionResult<QuienDioMeGustaDto>> QuienDioMeGusta(string id) => Ok(await _queries.QuienDioMeGustaAsync(id));

        [HttpGet("{id}/comentarios")]
        public async Task<ActionResult<PaginaComentariosDto>> Comentarios(string id, [FromQuery] string? despues, [FromQuery] int? limite) => Ok(await _queries.ComentariosAsync(id, despues, limite, Usuario));

        [HttpPost("{id}/comentarios")]
        public async Task<ActionResult<ComentarioDto>> Comentar(string id, [FromBody] ComentarioNuevoDto dto)
        {
            string comentarioId = await _comandos.ComentarAsync(Usuario, id, dto);
            var pagina = await _queries.ComentariosAsync(id, null, 30, Usuario);
            // El comentario nuevo puede ser una respuesta: se busca en su hilo.
            ComentarioDto? nuevo = pagina.Items.FirstOrDefault(c => c.Id == comentarioId) ?? pagina.Items.SelectMany(c => c.Replies ?? []).FirstOrDefault(c => c.Id == comentarioId);
            if (nuevo is null && dto.ParentId is not null) nuevo = (await _queries.RespuestasAsync(dto.ParentId, Usuario)).FirstOrDefault(c => c.Id == comentarioId);
            return Ok(nuevo ?? new ComentarioDto { Id = comentarioId, PostId = id, AuthorId = Usuario.ToString(), AuthorAlias = string.Empty, Text = dto.Text, CreatedAt = string.Empty, Mine = true, CanDelete = true });
        }

        [HttpGet("comentarios/{comentarioId}/respuestas")]
        public async Task<ActionResult<List<ComentarioDto>>> Respuestas(string comentarioId) => Ok(await _queries.RespuestasAsync(comentarioId, Usuario));

        [HttpPut("comentarios/{comentarioId}")]
        public async Task<IActionResult> EditarComentario(string comentarioId, [FromBody] TextoDto dto) { await _comandos.EditarComentarioAsync(Usuario, comentarioId, dto.Text); return NoContent(); }

        [HttpDelete("comentarios/{comentarioId}")]
        public async Task<IActionResult> BorrarComentario(string comentarioId) { await _comandos.BorrarComentarioAsync(Usuario, comentarioId); return NoContent(); }
    }

    /// <summary>El feed de reels (publicaciones de la comunidad y avisos del mercado) y las señales que lo afinan.</summary>
    [Authorize]
    [Route("api/reels")]
    [ApiController]
    public class ReelsController : MercadoBaseController
    {
        private readonly ISocialQueries _queries;
        private readonly ISocialCommands _comandos;

        public ReelsController(ISocialQueries queries, ISocialCommands comandos)
        {
            _queries = queries;
            _comandos = comandos;
        }

        [HttpGet]
        public async Task<ActionResult<PaginaReelsDto>> Reels([FromQuery] string? antes, [FromQuery] int? limite, [FromQuery] string? etiqueta, [FromQuery] string? q, [FromQuery] string? vistos, [FromQuery] string? semilla) =>
            Ok(await _queries.ReelsAsync(new FiltroReels { Antes = antes, Limite = limite, Etiqueta = etiqueta, Q = q, Vistos = (vistos ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(), Semilla = semilla }, Usuario));

        [HttpPost("senales")]
        public async Task<ActionResult<AceptadasDto>> Senales([FromBody] SenalesDto dto) => Ok(new AceptadasDto { Accepted = await _comandos.RegistrarSenalesAsync(Usuario, dto.Signals) });
    }

    /// <summary>
    /// Fotos del perfil y de las publicaciones. Ver una foto no exige sesión: el id es un UUID aleatorio (quien no tiene el enlace no la encuentra)
    /// y así la app web puede mostrarlas en una etiqueta de imagen, que no envía el token. Subirlas sí exige sesión.
    /// </summary>
    [Route("api/media")]
    [ApiController]
    public class MediaController : MercadoBaseController
    {
        private readonly ISocialQueries _queries;
        private readonly ISocialCommands _comandos;

        public MediaController(ISocialQueries queries, ISocialCommands comandos)
        {
            _queries = queries;
            _comandos = comandos;
        }

        [AllowAnonymous]
        [HttpGet("{id}")]
        public async Task<IActionResult> Ver(string id)
        {
            id = NormalizarId(id);
            var archivo = await _queries.MedioAsync(id) ?? throw ReglaNegocioException.NoEncontrado("Archivo no encontrado.");
            Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            return File(archivo.Bytes, archivo.Mime, enableRangeProcessing: true);
        }

        public static string NormalizarId(string id)
        {
            int punto = id.LastIndexOf('.');
            return punto > 0 && id[(punto + 1)..].ToLowerInvariant() is "mp4" or "webp" ? id[..punto] : id;
        }

        /// <summary>El cuerpo es el archivo tal cual y el tipo va en <c>Content-Type</c> (image/jpeg, image/png o image/webp).</summary>
        [Authorize]
        [HttpPost]
        [RequestSizeLimit(16 * 1024 * 1024)]
        [Consumes("image/jpeg", "image/png", "image/webp", "image/jpg")]
        public async Task<ActionResult<MedioSubidoDto>> Subir([FromQuery] string uso, [FromQuery] int? ancho, [FromQuery] int? alto, [FromServices] PicoCriollo.API.Application.ProcesadorMedia procesador)
        {
            if (uso is not ("post" or "avatar" or "bird")) throw ReglaNegocioException.Validacion("Uso de archivo no válido.");
            using var memoria = new MemoryStream();
            await Request.Body.CopyToAsync(memoria, HttpContext.RequestAborted);
            if (memoria.Length > (uso == "avatar" ? 3 : 12) * 1024 * 1024) throw new ReglaNegocioException(413, "La foto excede el tamaño permitido.");
            var temporal = Path.GetTempFileName();
            try
            {
                await System.IO.File.WriteAllBytesAsync(temporal, memoria.ToArray(), HttpContext.RequestAborted);
                var foto = await procesador.Procesar(temporal, false, HttpContext.RequestAborted);
                return Ok(await _comandos.SubirMedioAsync(Usuario, foto.Bytes, "image/webp", uso, foto.Ancho, foto.Alto));
            }
            finally { System.IO.File.Delete(temporal); }
        }

        [Authorize, HttpPost("videos")]
        [RequestSizeLimit(PicoCriollo.API.Application.ColaVideos.MaxBytes)]
        [Consumes("video/mp4", "video/quicktime", "video/webm", "application/octet-stream")]
        public async Task<IActionResult> SubirVideo([FromServices] PicoCriollo.API.Application.ColaVideos cola)
        {
            var j = await cola.Encolar(Usuario, Request.Body, HttpContext.RequestAborted);
            return Accepted(new { jobId = j.Id, status = j.Status });
        }

        [Authorize, HttpGet("videos/{id}")]
        public IActionResult EstadoVideo(string id, [FromServices] PicoCriollo.API.Application.ColaVideos cola)
        {
            var j = cola.Consultar(id, Usuario);
            return Ok(new { jobId = j.Id, status = j.Status, mediaId = j.MediaId, error = j.Error });
        }
    }
}
