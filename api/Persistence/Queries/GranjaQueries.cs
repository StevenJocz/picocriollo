using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure;

namespace PicoCriollo.Persistence.Queries
{
    public interface IGranjaQueries
    {
        Task<GranjaDto> ObtenerGranjaAsync(Guid idUsuario);
        /// <summary>El registro con ese código y todo lo que lo originó.</summary>
        Task<List<FilaDeTrazaDto>> TrazarAsync(Guid idUsuario, string codigo);
        Task<ResumenComercialDto> ResumenComercialAsync(Guid idUsuario, string? desde, string? hasta);
    }

    public class GranjaQueries : IGranjaQueries
    {
        private readonly DBContext _contexto;

        public GranjaQueries(DBContext contexto) => _contexto = contexto;

        public async Task<GranjaDto> ObtenerGranjaAsync(Guid idUsuario)
        {
            var granja = await _contexto.GranjaEs.AsNoTracking().FirstOrDefaultAsync(g => g.IdUsuario == idUsuario)
                ?? throw ReglaNegocioException.NoEncontrado("No existe el espacio de granja de esta cuenta.");
            using JsonDocument documento = JsonDocument.Parse(string.IsNullOrWhiteSpace(granja.Datos) ? "{}" : granja.Datos);
            return new GranjaDto { Datos = documento.RootElement.Clone(), Version = granja.Version };
        }

        private async Task<DocumentoGranja> DocumentoAsync(Guid idUsuario)
        {
            var granja = await _contexto.GranjaEs.AsNoTracking().FirstOrDefaultAsync(g => g.IdUsuario == idUsuario)
                ?? throw ReglaNegocioException.NoEncontrado("No existe el espacio de granja de esta cuenta.");
            return DocumentoGranja.Desde(granja.Datos);
        }

        public async Task<List<FilaDeTrazaDto>> TrazarAsync(Guid idUsuario, string codigo)
        {
            if (string.IsNullOrWhiteSpace(codigo)) throw ReglaNegocioException.Validacion("Escribe el código que quieres rastrear.");
            return ReglasTrazabilidad.Trazar(await DocumentoAsync(idUsuario), codigo);
        }

        public async Task<ResumenComercialDto> ResumenComercialAsync(Guid idUsuario, string? desde, string? hasta) =>
            ReglasTrazabilidad.Resumen(await DocumentoAsync(idUsuario), ReglasGranja.Fecha(desde, "Desde", false) is { Length: > 0 } d ? d : "0000-01-01", ReglasGranja.Fecha(hasta, "Hasta", false) is { Length: > 0 } h ? h : "9999-12-31");
    }
}
