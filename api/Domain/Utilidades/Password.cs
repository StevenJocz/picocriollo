using System.Security.Cryptography;
using System.Text;

namespace PicoCriollo.Domain.Utilidades
{
    public interface IPassword
    {
        Task<string> HashearPasswordAsync(string password);
        Task<bool> VerificarPasswordAsync(string passwordIngresado, string passwordGuardado);
        /// <summary>Gasta el mismo tiempo que una verificación real, para que no se note si el correo existe.</summary>
        Task GastarTiempoAsync(string passwordIngresado);
    }

    /// <summary>
    /// Formato compartido con la app Node: scrypt$N$r$p$sal$hash (base64url, clave derivada de 64 bytes).
    /// Los hashes nuevos usan los mismos parámetros que hoy (N=16384) para que ambos sistemas se entiendan durante la migración.
    /// </summary>
    public class Password : IPassword
    {
        public const int N = 16_384, R = 8, P = 1, LongitudClave = 64, LongitudSal = 16;
        // Tope de lo que se acepta de un hash guardado, para que un registro alterado no agote la memoria.
        private const int NMaximo = 1 << 20, RMaximo = 16, PMaximo = 4;

        public Task<string> HashearPasswordAsync(string password) => Task.Run(() =>
        {
            byte[] sal = RandomNumberGenerator.GetBytes(LongitudSal);
            byte[] hash = Scrypt.Derivar(Encoding.UTF8.GetBytes(password), sal, N, R, P, LongitudClave);
            return $"scrypt${N}${R}${P}${Base64Url(sal)}${Base64Url(hash)}";
        });

        public Task<bool> VerificarPasswordAsync(string passwordIngresado, string passwordGuardado) => Task.Run(() =>
        {
            string[] partes = passwordGuardado.Split('$');
            if (partes.Length != 6 || partes[0] != "scrypt") return false;
            if (!int.TryParse(partes[1], out int n) || !int.TryParse(partes[2], out int r) || !int.TryParse(partes[3], out int p)) return false;
            if (n < 2 || n > NMaximo || (n & (n - 1)) != 0 || r < 1 || r > RMaximo || p < 1 || p > PMaximo) return false;
            byte[] sal, esperado;
            try { sal = DesdeBase64Url(partes[4]); esperado = DesdeBase64Url(partes[5]); }
            catch (FormatException) { return false; }
            if (esperado.Length == 0) return false;
            byte[] actual = Scrypt.Derivar(Encoding.UTF8.GetBytes(passwordIngresado), sal, n, r, p, esperado.Length);
            return CryptographicOperations.FixedTimeEquals(esperado, actual);
        });

        public Task GastarTiempoAsync(string passwordIngresado) => Task.Run(() =>
            Scrypt.Derivar(Encoding.UTF8.GetBytes(passwordIngresado), new byte[LongitudSal], N, R, P, LongitudClave));

        private static string Base64Url(byte[] datos) => Convert.ToBase64String(datos).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        private static byte[] DesdeBase64Url(string texto)
        {
            string base64 = texto.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            return Convert.FromBase64String(base64);
        }
    }
}
