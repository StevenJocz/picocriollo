using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using PicoCriollo.Domain.DTOs.UsuarioD;

namespace PicoCriollo.Infrastructure.Seguridad
{
    public class JwtOpciones
    {
        public const string Seccion = "Jwt";
        /// <summary>Clave de firma, de al menos 32 caracteres. Se entrega por variable de entorno (Jwt__Key), nunca en el repositorio.</summary>
        public string Key { get; set; } = string.Empty;
        public string Emisor { get; set; } = "pico-criollo-api";
        public string Audiencia { get; set; } = "pico-criollo-app";
        public int MinutosAcceso { get; set; } = 15;
        public int DiasRefresco { get; set; } = 30;
    }

    public interface IGenerarToken
    {
        int DiasRefresco { get; }
        (string Token, DateTime ExpiraEn) GenerarTokenAcceso(UsuarioDto usuario, DateTime ahoraUtc);
        /// <summary>Token de refresco aleatorio (256 bits) y su hash, que es lo único que se guarda.</summary>
        (string Token, string Hash) GenerarRefresco();
        /// <summary>SHA-256 en hexadecimal. Sirve para tokens de refresco y de restablecimiento.</summary>
        string HashearToken(string token);
    }

    public class GenerarToken : IGenerarToken
    {
        private readonly JwtOpciones _opciones;
        private readonly SigningCredentials _firma;

        public GenerarToken(IOptions<JwtOpciones> opciones)
        {
            _opciones = opciones.Value;
            if (string.IsNullOrEmpty(_opciones.Key) || Encoding.UTF8.GetByteCount(_opciones.Key) < 32)
                throw new InvalidOperationException("Jwt:Key debe tener al menos 32 caracteres.");
            _firma = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opciones.Key)), SecurityAlgorithms.HmacSha256);
        }

        public int DiasRefresco => _opciones.DiasRefresco;

        public (string Token, DateTime ExpiraEn) GenerarTokenAcceso(UsuarioDto usuario, DateTime ahoraUtc)
        {
            DateTime expira = ahoraUtc.AddMinutes(_opciones.MinutosAcceso);
            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, usuario.Id.ToString()),
                new(JwtRegisteredClaimNames.Email, usuario.Correo),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
                new("role", usuario.Rol),
            };
            if (!string.IsNullOrEmpty(usuario.NombreUsuario)) claims.Add(new Claim("nombre", usuario.NombreUsuario));

            var descriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Issuer = _opciones.Emisor,
                Audience = _opciones.Audiencia,
                IssuedAt = ahoraUtc,
                NotBefore = ahoraUtc,
                Expires = expira,
                SigningCredentials = _firma,
            };
            return (new JsonWebTokenHandler().CreateToken(descriptor), expira);
        }

        public (string Token, string Hash) GenerarRefresco()
        {
            string token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            return (token, HashearToken(token));
        }

        public string HashearToken(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }
}
