using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.Domain.Utilidades
{
    /// <summary>Mismas reglas que la app actual (src/server/accounts.ts y features/profile/service/location.ts).</summary>
    public static partial class ReglasUsuario
    {
        public const int NombreMinimo = 2, NombreMaximo = 40, PasswordMinimo = 12, PasswordMaximo = 128;

        [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")] private static partial Regex PatronCorreo();
        [GeneratedRegex(@"[\u0000-\u001f\u007f]")] private static partial Regex PatronControl();
        [GeneratedRegex(@"[@<>]|https?:|www\.", RegexOptions.IgnoreCase)] private static partial Regex PatronProhibido();
        [GeneratedRegex(@" {2,}")] private static partial Regex PatronEspacios();
        [GeneratedRegex(@"\s+")] private static partial Regex PatronBlancos();
        [GeneratedRegex(@"^[\p{L}\p{N}][\p{L}\p{N} .,'()-]*$")] private static partial Regex PatronLugar();

        public static string NormalizarCorreo(string? correo)
        {
            string limpio = (correo ?? string.Empty).Trim().ToLowerInvariant();
            if (limpio.Length > 254 || !PatronCorreo().IsMatch(limpio)) throw ReglaNegocioException.Validacion("Escribe un correo válido.");
            return limpio;
        }

        public static string ValidarPassword(string? password)
        {
            if (password is null || password.Length < PasswordMinimo || password.Length > PasswordMaximo)
                throw ReglaNegocioException.Validacion($"La contraseña debe tener entre {PasswordMinimo} y {PasswordMaximo} caracteres.");
            return password;
        }

        /// <summary>Limpia y valida el nombre público (el que ven los demás en el mercado y los chats).</summary>
        public static string ValidarNombreUsuario(string? bruto)
        {
            if (bruto is null) throw ReglaNegocioException.Validacion("Escribe un nombre de usuario.");
            if (PatronControl().IsMatch(bruto)) throw ReglaNegocioException.Validacion("El nombre de usuario no puede tener saltos de línea ni caracteres de control.");
            string nombre = PatronEspacios().Replace(bruto.Normalize(NormalizationForm.FormC), " ").Trim();
            if (nombre.Length < NombreMinimo || nombre.Length > NombreMaximo)
                throw ReglaNegocioException.Validacion($"El nombre de usuario debe tener entre {NombreMinimo} y {NombreMaximo} caracteres.");
            if (PatronProhibido().IsMatch(nombre))
                throw ReglaNegocioException.Validacion("El nombre de usuario no puede parecerse a un correo ni incluir enlaces o símbolos como @ < >.");
            return nombre;
        }

        /// <summary>Clave de comparación: ignora mayúsculas, tildes y espacios repetidos («José» y «Jose» son el mismo nombre).</summary>
        public static string ClaveNombre(string nombre) => Plegar(nombre);

        public static string Plegar(string texto)
        {
            var sinMarcas = new StringBuilder();
            foreach (char c in texto.Normalize(NormalizationForm.FormD))
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sinMarcas.Append(c);
            return PatronBlancos().Replace(sinMarcas.ToString(), " ").Trim().ToLower(new CultureInfo("es-CO"));
        }

        /// <summary>Ciudad y departamento limpios. La ciudad es obligatoria si se envía algo; el departamento es opcional.</summary>
        public static (string Ciudad, string? Departamento)? NormalizarUbicacion(string? ciudad, string? departamento)
        {
            if (string.IsNullOrWhiteSpace(ciudad)) return null;
            string c = PatronBlancos().Replace(ciudad, " ").Trim();
            string d = PatronBlancos().Replace(departamento ?? string.Empty, " ").Trim();
            if (c.Length < 2 || c.Length > 60 || !PatronLugar().IsMatch(c))
                throw ReglaNegocioException.Validacion("Escribe el nombre de tu ciudad o municipio (entre 2 y 60 letras).");
            if (d.Length > 0 && (d.Length > 60 || !PatronLugar().IsMatch(d)))
                throw ReglaNegocioException.Validacion("El departamento no es válido.");
            return (c, d.Length > 0 ? d : null);
        }
    }
}
