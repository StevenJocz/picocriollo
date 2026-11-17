using PicoCriollo.Domain.Entities.UsuarioE;

namespace PicoCriollo.Domain.DTOs.UsuarioD
{
    public class UsuarioDto
    {
        public Guid Id { get; set; }
        public string Correo { get; set; } = null!;
        public string? NombreUsuario { get; set; }
        public string Rol { get; set; } = "user";

        public static UsuarioDto CreateDTO(UsuarioE usuario) => new()
        {
            Id = usuario.IdUsuario,
            Correo = usuario.Correo,
            NombreUsuario = usuario.NombreUsuario,
            Rol = usuario.Rol,
        };
    }
}
