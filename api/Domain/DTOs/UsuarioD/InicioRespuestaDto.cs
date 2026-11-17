namespace PicoCriollo.Domain.DTOs.UsuarioD
{
    /// <summary>Respuesta de ingreso, registro y refresco. Token es el de acceso (corto); RefreshToken sirve para pedir otro.</summary>
    public class InicioRespuestaDto
    {
        public bool Respuesta { get; set; }
        public string? Mensaje { get; set; }
        public string Token { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public int ExpiraEnSegundos { get; set; }
        public UsuarioDto? Datos { get; set; }
    }
}
