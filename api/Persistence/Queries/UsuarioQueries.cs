using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.Infrastructure;

namespace PicoCriollo.Persistence.Queries
{
    public interface IUsuarioQueries
    {
        Task<UsuarioDto?> ObtenerUsuarioAsync(Guid idUsuario);
    }

    public class UsuarioQueries : IUsuarioQueries
    {
        private readonly DBContext _contexto;

        public UsuarioQueries(DBContext contexto) => _contexto = contexto;

        public async Task<UsuarioDto?> ObtenerUsuarioAsync(Guid idUsuario)
        {
            var usuario = await _contexto.UsuarioEs.AsNoTracking().FirstOrDefaultAsync(u => u.IdUsuario == idUsuario);
            return usuario is null ? null : UsuarioDto.CreateDTO(usuario);
        }
    }
}
