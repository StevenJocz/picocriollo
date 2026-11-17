using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace PicoCriollo.Domain.Entities.UsuarioE
{
    /// <summary>Tabla app_users de la app actual. El perfil (nombre público, rol, ubicación…) vive en una columna jsonb.</summary>
    [Table("app_users")]
    public class UsuarioE
    {
        [Key]
        [Column("id")]
        public Guid IdUsuario { get; set; }

        [Column("email")]
        public string Correo { get; set; } = null!;

        [Column("password_hash")]
        public string PasswordHash { get; set; } = null!;

        [Column("created_at")]
        public DateTime FechaCreacion { get; set; }

        [Column("profile", TypeName = "jsonb")]
        public string Perfil { get; set; } = "{}";

        [NotMapped] public string? NombreUsuario => TextoDelPerfil("displayName");
        [NotMapped] public string Rol => TextoDelPerfil("role") ?? "user";
        [NotMapped] public bool Suspendido => TextoDelPerfil("suspendedAt") != null;
        [NotMapped] public bool EsDemo => ValorDelPerfil("demo") is { ValueKind: JsonValueKind.True };

        private string? TextoDelPerfil(string campo)
        {
            JsonElement? valor = ValorDelPerfil(campo);
            return valor is { ValueKind: JsonValueKind.String } v && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;
        }

        private JsonElement? ValorDelPerfil(string campo)
        {
            try
            {
                using JsonDocument documento = JsonDocument.Parse(string.IsNullOrWhiteSpace(Perfil) ? "{}" : Perfil);
                return documento.RootElement.ValueKind == JsonValueKind.Object && documento.RootElement.TryGetProperty(campo, out JsonElement valor) ? valor.Clone() : null;
            }
            catch (JsonException) { return null; }
        }
    }
}
