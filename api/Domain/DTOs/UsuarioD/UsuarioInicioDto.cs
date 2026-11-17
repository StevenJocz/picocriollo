using System.ComponentModel.DataAnnotations;

namespace PicoCriollo.Domain.DTOs.UsuarioD
{
    public class UsuarioInicioDto
    {
        [Required, StringLength(254)] public string Correo { get; set; } = null!;
        [Required, StringLength(128, MinimumLength = 1)] public string Password { get; set; } = null!;
    }

    public class RegistroDto
    {
        [Required, StringLength(254)] public string Correo { get; set; } = null!;
        [Required, StringLength(128, MinimumLength = 12, ErrorMessage = "La contraseña debe tener entre 12 y 128 caracteres.")] public string Password { get; set; } = null!;
        [Required, StringLength(80)] public string NombreUsuario { get; set; } = null!;
        [StringLength(80)] public string? Ciudad { get; set; }
        [StringLength(80)] public string? Departamento { get; set; }
    }

    public class RefrescarDto
    {
        [Required, StringLength(200)] public string RefreshToken { get; set; } = null!;
    }

    public class OlvidoPasswordDto
    {
        [Required, StringLength(254)] public string Correo { get; set; } = null!;
    }

    public class RestablecerPasswordDto
    {
        [Required, StringLength(200)] public string Token { get; set; } = null!;
        [Required, StringLength(128, MinimumLength = 12, ErrorMessage = "La contraseña debe tener entre 12 y 128 caracteres.")] public string Password { get; set; } = null!;
    }
}
