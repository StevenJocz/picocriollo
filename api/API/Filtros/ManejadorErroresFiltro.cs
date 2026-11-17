using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using PicoCriollo.Domain.DTOs;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.API.Filtros
{
    /// <summary>Traduce los errores de negocio a su código HTTP y oculta los detalles de los errores inesperados.</summary>
    public class ManejadorErroresFiltro : IExceptionFilter
    {
        private readonly ILogger<ManejadorErroresFiltro> _logger;

        public ManejadorErroresFiltro(ILogger<ManejadorErroresFiltro> logger) => _logger = logger;

        public void OnException(ExceptionContext contexto)
        {
            switch (contexto.Exception)
            {
                case ReglaNegocioException regla:
                    contexto.Result = Responder(regla.Estado, regla.Message);
                    break;
                case Npgsql.NpgsqlException or TimeoutException:
                    _logger.LogError(contexto.Exception, "Base de datos no disponible");
                    contexto.Result = Responder(StatusCodes.Status503ServiceUnavailable, "El servicio no está disponible por ahora. Inténtalo en unos minutos.");
                    break;
                default:
                    _logger.LogError(contexto.Exception, "Error no controlado en {Ruta}", contexto.HttpContext.Request.Path);
                    contexto.Result = Responder(StatusCodes.Status500InternalServerError, "No se pudo completar la operación.");
                    break;
            }
            contexto.ExceptionHandled = true;
        }

        private static ObjectResult Responder(int estado, string mensaje) =>
            new(new RespuestaDto { Respuesta = false, Mensaje = mensaje }) { StatusCode = estado };
    }
}
