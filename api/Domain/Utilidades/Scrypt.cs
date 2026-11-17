using System.Buffers.Binary;
using System.Security.Cryptography;

namespace PicoCriollo.Domain.Utilidades
{
    /// <summary>
    /// scrypt (RFC 7914). .NET no lo trae; la app actual guarda las contraseñas con scrypt,
    /// así que hace falta para verificarlas sin pedirle a nadie que cambie de clave.
    /// </summary>
    public static class Scrypt
    {
        public static byte[] Derivar(byte[] password, byte[] salt, int n, int r, int p, int longitud)
        {
            if (n < 2 || (n & (n - 1)) != 0) throw new ArgumentException("N debe ser una potencia de 2 mayor que 1.", nameof(n));
            if (r < 1 || p < 1) throw new ArgumentException("r y p deben ser positivos.");
            if ((long)p * r > (1 << 30) - 1) throw new ArgumentException("Parámetros demasiado grandes.");

            int tamanoBloque = 128 * r;
            byte[] b = Rfc2898DeriveBytes.Pbkdf2(password, salt, 1, HashAlgorithmName.SHA256, p * tamanoBloque);

            uint[] x = new uint[32 * r];
            uint[] y = new uint[32 * r];
            uint[] v = new uint[32 * r * n];

            for (int i = 0; i < p; i++)
            {
                int inicio = i * tamanoBloque;
                for (int k = 0; k < x.Length; k++) x[k] = BinaryPrimitives.ReadUInt32LittleEndian(b.AsSpan(inicio + k * 4, 4));
                RoMix(x, y, v, n, r);
                for (int k = 0; k < x.Length; k++) BinaryPrimitives.WriteUInt32LittleEndian(b.AsSpan(inicio + k * 4, 4), x[k]);
            }

            return Rfc2898DeriveBytes.Pbkdf2(password, b, 1, HashAlgorithmName.SHA256, longitud);
        }

        private static void RoMix(uint[] x, uint[] y, uint[] v, int n, int r)
        {
            int palabras = 32 * r;
            for (int i = 0; i < n; i++)
            {
                Array.Copy(x, 0, v, i * palabras, palabras);
                BloqueMix(x, y, r);
                Array.Copy(y, x, palabras);
            }
            for (int i = 0; i < n; i++)
            {
                int j = (int)(x[(2 * r - 1) * 16] & (uint)(n - 1));
                int desde = j * palabras;
                for (int k = 0; k < palabras; k++) x[k] ^= v[desde + k];
                BloqueMix(x, y, r);
                Array.Copy(y, x, palabras);
            }
        }

        private static void BloqueMix(uint[] b, uint[] y, int r)
        {
            uint[] x = new uint[16];
            Array.Copy(b, (2 * r - 1) * 16, x, 0, 16);
            for (int i = 0; i < 2 * r; i++)
            {
                for (int k = 0; k < 16; k++) x[k] ^= b[i * 16 + k];
                Salsa208(x);
                int destino = (i % 2 == 0 ? i / 2 : r + i / 2) * 16;
                Array.Copy(x, 0, y, destino, 16);
            }
        }

        private static uint Rotar(uint valor, int bits) => (valor << bits) | (valor >> (32 - bits));

        private static void Salsa208(uint[] b)
        {
            uint[] x = (uint[])b.Clone();
            for (int i = 0; i < 8; i += 2)
            {
                x[4] ^= Rotar(x[0] + x[12], 7); x[8] ^= Rotar(x[4] + x[0], 9); x[12] ^= Rotar(x[8] + x[4], 13); x[0] ^= Rotar(x[12] + x[8], 18);
                x[9] ^= Rotar(x[5] + x[1], 7); x[13] ^= Rotar(x[9] + x[5], 9); x[1] ^= Rotar(x[13] + x[9], 13); x[5] ^= Rotar(x[1] + x[13], 18);
                x[14] ^= Rotar(x[10] + x[6], 7); x[2] ^= Rotar(x[14] + x[10], 9); x[6] ^= Rotar(x[2] + x[14], 13); x[10] ^= Rotar(x[6] + x[2], 18);
                x[3] ^= Rotar(x[15] + x[11], 7); x[7] ^= Rotar(x[3] + x[15], 9); x[11] ^= Rotar(x[7] + x[3], 13); x[15] ^= Rotar(x[11] + x[7], 18);

                x[1] ^= Rotar(x[0] + x[3], 7); x[2] ^= Rotar(x[1] + x[0], 9); x[3] ^= Rotar(x[2] + x[1], 13); x[0] ^= Rotar(x[3] + x[2], 18);
                x[6] ^= Rotar(x[5] + x[4], 7); x[7] ^= Rotar(x[6] + x[5], 9); x[4] ^= Rotar(x[7] + x[6], 13); x[5] ^= Rotar(x[4] + x[7], 18);
                x[11] ^= Rotar(x[10] + x[9], 7); x[8] ^= Rotar(x[11] + x[10], 9); x[9] ^= Rotar(x[8] + x[11], 13); x[10] ^= Rotar(x[9] + x[8], 18);
                x[12] ^= Rotar(x[15] + x[14], 7); x[13] ^= Rotar(x[12] + x[15], 9); x[14] ^= Rotar(x[13] + x[12], 13); x[15] ^= Rotar(x[14] + x[13], 18);
            }
            for (int k = 0; k < 16; k++) b[k] += x[k];
        }
    }
}
