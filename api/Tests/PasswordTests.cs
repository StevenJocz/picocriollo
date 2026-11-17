using System.Text;
using PicoCriollo.Domain.Utilidades;

namespace PicoCriollo.Tests
{
    public class PasswordTests
    {
        // Valores generados con crypto.scryptSync de Node (la implementación que usa la app actual).
        [Fact]
        public void Scrypt_VectorRfc7914_ClaveVacia()
        {
            byte[] dk = Scrypt.Derivar([], [], 16, 1, 1, 64);
            Assert.Equal("77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906", Convert.ToHexStringLower(dk));
        }

        [Fact]
        public void Scrypt_VectorRfc7914_PasswordNaCl()
        {
            byte[] dk = Scrypt.Derivar(Encoding.UTF8.GetBytes("password"), Encoding.UTF8.GetBytes("NaCl"), 1024, 8, 16, 64);
            Assert.Equal("fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640", Convert.ToHexStringLower(dk));
        }

        [Fact]
        public async Task Verifica_UnHashGeneradoPorLaAppNode()
        {
            const string hashNode = "scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$ox8WxEyzWuSRELqW1COSLVg5HXAUoBeYymMKBXDBSXONkdE4G69HkU5LLpkhxq_xUHGzl26LoQyJrnQMOYvIrQ";
            var password = new Password();
            Assert.True(await password.VerificarPasswordAsync("clave-de-prueba-uno-123", hashNode));
            Assert.False(await password.VerificarPasswordAsync("clave-de-prueba-uno-124", hashNode));
        }

        [Fact]
        public async Task Hashear_ProduceElFormatoCompartidoYSeVerifica()
        {
            var password = new Password();
            string hash = await password.HashearPasswordAsync("una-clave-bien-larga");
            string[] partes = hash.Split('$');
            Assert.Equal(["scrypt", "16384", "8", "1"], partes[..4]);
            Assert.Equal(6, partes.Length);
            Assert.True(await password.VerificarPasswordAsync("una-clave-bien-larga", hash));
            Assert.False(await password.VerificarPasswordAsync("otra-clave-distinta", hash));
            Assert.NotEqual(hash, await password.HashearPasswordAsync("una-clave-bien-larga"));
        }

        [Theory]
        [InlineData("")]
        [InlineData("no-es-un-hash")]
        [InlineData("scrypt$16384$8$1$sal")]
        [InlineData("bcrypt$16384$8$1$MDEy$MDEy")]
        [InlineData("scrypt$3$8$1$MDEy$MDEy")]
        [InlineData("scrypt$2147483648$8$1$MDEy$MDEy")]
        [InlineData("scrypt$16384$8$1$***$***")]
        public async Task Rechaza_HashesInvalidosOAlterados(string guardado)
        {
            Assert.False(await new Password().VerificarPasswordAsync("cualquiera", guardado));
        }
    }
}
