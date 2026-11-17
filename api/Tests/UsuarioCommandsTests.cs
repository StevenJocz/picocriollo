using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PicoCriollo.Domain.DTOs.UsuarioD;
using PicoCriollo.Domain.Entities.UsuarioE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure;
using PicoCriollo.Infrastructure.Correo;
using PicoCriollo.Infrastructure.Seguridad;
using PicoCriollo.Persistence.Commands;

namespace PicoCriollo.Tests
{
    internal sealed class RelojPrueba : TimeProvider
    {
        private DateTimeOffset _ahora = new(2026, 10, 22, 15, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => _ahora;
        public void Avanzar(TimeSpan tiempo) => _ahora += tiempo;
    }

    internal sealed class CorreoFalso : ICorreoServicio
    {
        public TaskCompletionSource<(string Para, string Texto)> Enviado { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int Envios { get; private set; }

        public Task EnviarAsync(string para, string asunto, string texto, string html, CancellationToken cancelar = default)
        {
            Envios++;
            Enviado.TrySetResult((para, texto));
            return Task.CompletedTask;
        }

        public void Reiniciar() => Enviado = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    /// <summary>Entorno aislado: base en memoria, reloj controlable y correo falso.</summary>
    internal sealed class Entorno : IDisposable
    {
        public const string Clave = "una-clave-bien-larga-1";
        public DBContext Contexto { get; }
        public DbContextOptions<DBContext> Opciones { get; }
        public RelojPrueba Reloj { get; } = new();
        public CorreoFalso Correo { get; } = new();
        public GenerarToken Tokens { get; }
        public Password Password { get; } = new();
        public UsuarioCommands Comandos { get; }

        public Entorno()
        {
            Opciones = new DbContextOptionsBuilder<DBContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
            Contexto = new DBContext(Opciones);
            Tokens = new GenerarToken(Options.Create(new JwtOpciones { Key = "clave-de-pruebas-de-al-menos-32-caracteres!" }));
            Comandos = new UsuarioCommands(Contexto, Password, Tokens, Correo, Options.Create(new AppOpciones { Origen = "https://app.ejemplo.co" }), Reloj, NullLogger<UsuarioCommands>.Instance);
        }

        public Task<InicioRespuestaDto> Registrar(string correo = "ana@correo.test", string nombre = "Ana María", string? ciudad = "Medellín") =>
            Comandos.RegistrarAsync(new RegistroDto { Correo = correo, Password = Clave, NombreUsuario = nombre, Ciudad = ciudad, Departamento = "Antioquia" });

        public void Dispose() => Contexto.Dispose();
    }

    public class UsuarioCommandsTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        [Fact]
        public async Task Registrar_CreaUsuarioGranjaYSesion()
        {
            using var e = new Entorno();
            var r = await e.Registrar(" ANA@Correo.test ");

            Assert.True(r.Respuesta);
            Assert.False(string.IsNullOrEmpty(r.Token));
            Assert.False(string.IsNullOrEmpty(r.RefreshToken));
            Assert.Equal(15 * 60, r.ExpiraEnSegundos);
            Assert.Equal("ana@correo.test", r.Datos!.Correo);
            Assert.Equal("Ana María", r.Datos.NombreUsuario);

            var usuario = await e.Contexto.UsuarioEs.SingleAsync();
            Assert.StartsWith("scrypt$", usuario.PasswordHash);
            Assert.Contains("Medellín", usuario.Perfil);
            var granja = await e.Contexto.GranjaEs.SingleAsync();
            Assert.Equal(usuario.IdUsuario, granja.IdUsuario);
            Assert.Contains("\"incubations\":[]", granja.Datos);
            // Del token de refresco solo se guarda su hash.
            Assert.DoesNotContain(await e.Contexto.RefrescoEs.Select(x => x.TokenHash).ToListAsync(), h => h == r.RefreshToken);
        }

        [Fact]
        public async Task Registrar_RechazaCorreoNombreOClaveInvalidos()
        {
            using var e = new Entorno();
            await e.Registrar();
            await Falla(e.Registrar("ana@correo.test", "Otra Persona"), 409);
            foreach (string repetido in new[] { "ana maría", "ANA  MARIA", "Ana Maria" })
                await Falla(e.Registrar($"{Guid.NewGuid():N}@correo.test", repetido), 409);
            await Falla(e.Registrar("no-es-correo"), 400);
            await Falla(e.Registrar("b@correo.test", "ana@correo.com"), 400);
            await Falla(e.Registrar("c@correo.test", "x"), 400);
            await Falla(e.Comandos.RegistrarAsync(new RegistroDto { Correo = "d@correo.test", Password = "corta", NombreUsuario = "Dani" }), 400);
            Assert.Equal(1, await e.Contexto.UsuarioEs.CountAsync());
        }

        [Fact]
        public async Task IniciarSesion_AceptaLaClaveCorrectaYRechazaLasDemas()
        {
            using var e = new Entorno();
            await e.Registrar();
            var ok = await e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "ANA@correo.test", Password = Entorno.Clave });
            Assert.True(ok.Respuesta);
            await Falla(e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "ana@correo.test", Password = "otra-clave-larga-9" }), 401);
            var sinCuenta = await Falla(e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "nadie@correo.test", Password = Entorno.Clave }), 401);
            Assert.Equal(UsuarioCommands.CredencialesInvalidas, sinCuenta.Message);
        }

        [Fact]
        public async Task IniciarSesion_EntraConUnHashGeneradoPorLaAppNode()
        {
            using var e = new Entorno();
            e.Contexto.UsuarioEs.Add(new UsuarioE
            {
                IdUsuario = Guid.NewGuid(), Correo = "vieja@correo.test", FechaCreacion = e.Reloj.GetUtcNow().UtcDateTime,
                PasswordHash = "scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$ox8WxEyzWuSRELqW1COSLVg5HXAUoBeYymMKBXDBSXONkdE4G69HkU5LLpkhxq_xUHGzl26LoQyJrnQMOYvIrQ",
                Perfil = "{\"displayName\":\"Vieja\",\"role\":\"moderator\"}",
            });
            await e.Contexto.SaveChangesAsync();
            var r = await e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "vieja@correo.test", Password = "clave-de-prueba-uno-123" });
            Assert.Equal("moderator", r.Datos!.Rol);
        }

        [Fact]
        public async Task Refrescar_RotaElTokenYElViejoYaNoSirve()
        {
            using var e = new Entorno();
            var inicio = await e.Registrar();
            e.Reloj.Avanzar(TimeSpan.FromMinutes(20));

            var nuevo = await e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken });
            Assert.NotEqual(inicio.RefreshToken, nuevo.RefreshToken);
            Assert.NotEqual(inicio.Token, nuevo.Token);

            var viejo = await e.Contexto.RefrescoEs.SingleAsync(x => x.TokenHash == e.Tokens.HashearToken(inicio.RefreshToken));
            Assert.NotNull(viejo.RevocadoEn);
            Assert.Equal(e.Tokens.HashearToken(nuevo.RefreshToken), viejo.ReemplazadoPor);
        }

        [Fact]
        public async Task Refrescar_ReusarUnTokenViejoCierraTodasLasSesiones()
        {
            using var e = new Entorno();
            var inicio = await e.Registrar();
            var nuevo = await e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken });

            await Falla(e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken }), 401);
            // El token legítimo más reciente también queda anulado: no se sabe quién tiene la copia.
            await Falla(e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = nuevo.RefreshToken }), 401);
            Assert.All(await e.Contexto.RefrescoEs.ToListAsync(), x => Assert.NotNull(x.RevocadoEn));
        }

        [Fact]
        public async Task Refrescar_RechazaVencidosYDesconocidos()
        {
            using var e = new Entorno();
            var inicio = await e.Registrar();
            await Falla(e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = "no-existe-este-token" }), 401);
            e.Reloj.Avanzar(TimeSpan.FromDays(31));
            await Falla(e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken }), 401);
        }

        [Fact]
        public async Task CerrarSesion_RevocaElTokenYNoFallaSiYaNoExiste()
        {
            using var e = new Entorno();
            var inicio = await e.Registrar();
            Assert.True((await e.Comandos.CerrarSesionAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken })).Respuesta);
            await Falla(e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken }), 401);
            Assert.True((await e.Comandos.CerrarSesionAsync(new RefrescarDto { RefreshToken = "desconocido" })).Respuesta);
        }

        [Fact]
        public async Task Olvido_EnviaElEnlaceAlCorreoDeLaCuentaYGuardaSoloElHash()
        {
            using var e = new Entorno();
            await e.Registrar();
            var r = await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = " ANA@correo.test " });
            Assert.Equal(UsuarioCommands.MensajeOlvido, r.Mensaje);

            var (para, texto) = await e.Correo.Enviado.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Equal("ana@correo.test", para);
            Assert.Contains("https://app.ejemplo.co/restablecer?token=", texto);
            string token = texto.Split("token=")[1].Split('\n')[0].Trim();
            var fila = await e.Contexto.RestablecimientoEs.SingleAsync();
            Assert.Equal(e.Tokens.HashearToken(token), fila.TokenHash);
            Assert.Equal(fila.CreadoEn + UsuarioCommands.VigenciaRestablecer, fila.ExpiraEn);
        }

        [Fact]
        public async Task Olvido_ResponderLoMismoSiLaCuentaNoExisteYNoEnviaNada()
        {
            using var e = new Entorno();
            await e.Registrar();
            var existe = await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "ana@correo.test" });
            var noExiste = await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "nadie@correo.test" });
            Assert.Equal(existe.Mensaje, noExiste.Mensaje);
            Assert.Equal(existe.Respuesta, noExiste.Respuesta);
            await Falla(e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "no-es-correo" }), 400);
        }

        [Fact]
        public async Task Olvido_NoGeneraEnlacesSeguidosYUnoNuevoAnulaElAnterior()
        {
            using var e = new Entorno();
            await e.Registrar();
            await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "ana@correo.test" });
            string primero = (await e.Contexto.RestablecimientoEs.SingleAsync()).TokenHash;

            e.Reloj.Avanzar(UsuarioCommands.EsperaRestablecer - TimeSpan.FromSeconds(1));
            await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "ana@correo.test" });
            Assert.Equal(primero, (await e.Contexto.RestablecimientoEs.SingleAsync()).TokenHash);

            e.Reloj.Avanzar(TimeSpan.FromSeconds(2));
            await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "ana@correo.test" });
            Assert.NotEqual(primero, (await e.Contexto.RestablecimientoEs.SingleAsync()).TokenHash);
        }

        [Fact]
        public async Task Restablecer_CambiaLaClaveGastaElEnlaceYCierraTodasLasSesiones()
        {
            using var e = new Entorno();
            var inicio = await e.Registrar();
            var usuario = await e.Contexto.UsuarioEs.SingleAsync();
            e.Contexto.SesionEs.Add(new SesionE { TokenHash = new string('a', 64), IdUsuario = usuario.IdUsuario, CreadoEn = e.Reloj.GetUtcNow().UtcDateTime, ExpiraEn = e.Reloj.GetUtcNow().UtcDateTime.AddDays(1) });
            await e.Contexto.SaveChangesAsync();

            await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "ana@correo.test" });
            string token = (await e.Correo.Enviado.Task.WaitAsync(TimeSpan.FromSeconds(5))).Texto.Split("token=")[1].Split('\n')[0].Trim();

            const string nueva = "clave-nueva-y-larga-2";
            var r = await e.Comandos.RestablecerPasswordAsync(new RestablecerPasswordDto { Token = token, Password = nueva });
            Assert.True(r.Respuesta);

            Assert.True((await e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "ana@correo.test", Password = nueva })).Respuesta);
            await Falla(e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "ana@correo.test", Password = Entorno.Clave }), 401);
            await Falla(e.Comandos.RefrescarAsync(new RefrescarDto { RefreshToken = inicio.RefreshToken }), 401);
            Assert.Empty(await e.Contexto.SesionEs.ToListAsync());
            Assert.Empty(await e.Contexto.RestablecimientoEs.ToListAsync());
            await Falla(e.Comandos.RestablecerPasswordAsync(new RestablecerPasswordDto { Token = token, Password = nueva }), 400);
        }

        [Fact]
        public async Task Restablecer_RechazaVencidosFalsosYClavesFueraDeRango()
        {
            using var e = new Entorno();
            await e.Registrar();
            await e.Comandos.OlvidoPasswordAsync(new OlvidoPasswordDto { Correo = "ana@correo.test" });
            string token = (await e.Correo.Enviado.Task.WaitAsync(TimeSpan.FromSeconds(5))).Texto.Split("token=")[1].Split('\n')[0].Trim();

            await Falla(e.Comandos.RestablecerPasswordAsync(new RestablecerPasswordDto { Token = token, Password = "corta" }), 400);
            await Falla(e.Comandos.RestablecerPasswordAsync(new RestablecerPasswordDto { Token = new string('a', 43), Password = "clave-nueva-y-larga-2" }), 400);
            await Falla(e.Comandos.RestablecerPasswordAsync(new RestablecerPasswordDto { Token = "x", Password = "clave-nueva-y-larga-2" }), 400);

            // un intento fallido no gasta el enlace
            Assert.Single(await e.Contexto.RestablecimientoEs.ToListAsync());

            e.Reloj.Avanzar(UsuarioCommands.VigenciaRestablecer + TimeSpan.FromSeconds(1));
            await Falla(e.Comandos.RestablecerPasswordAsync(new RestablecerPasswordDto { Token = token, Password = "clave-nueva-y-larga-2" }), 400);
            Assert.True((await e.Comandos.IniciarSesionAsync(new UsuarioInicioDto { Correo = "ana@correo.test", Password = Entorno.Clave })).Respuesta);
        }
    }

    public class ReglasUsuarioTests
    {
        [Fact]
        public void NombreDeUsuario_SeLimpiaYSeValida()
        {
            Assert.Equal("Ana María", ReglasUsuario.ValidarNombreUsuario("  Ana   María  "));
            Assert.Equal("Granja_El-Pico.2", ReglasUsuario.ValidarNombreUsuario("Granja_El-Pico.2"));
            foreach (string malo in new[] { "", "   ", "a", new string('x', 41), "ana@correo.com", "visita www.sitio.co", "https://x.co", "<b>ana</b>", "ana\nbeto", "ana\0" })
                Assert.Throws<ReglaNegocioException>(() => ReglasUsuario.ValidarNombreUsuario(malo));
            Assert.Throws<ReglaNegocioException>(() => ReglasUsuario.ValidarNombreUsuario(null));
        }

        [Fact]
        public void ClaveNombre_IgnoraMayusculasTildesYEspacios()
        {
            Assert.Equal(ReglasUsuario.ClaveNombre("José  PÉREZ"), ReglasUsuario.ClaveNombre("jose perez"));
            Assert.NotEqual(ReglasUsuario.ClaveNombre("Jose Perez"), ReglasUsuario.ClaveNombre("Jose Perea"));
        }

        [Fact]
        public void Ubicacion_SeNormalizaYEsOpcional()
        {
            Assert.Null(ReglasUsuario.NormalizarUbicacion(null, null));
            Assert.Null(ReglasUsuario.NormalizarUbicacion("  ", "Antioquia"));
            Assert.Equal(("Rionegro", "Antioquia"), ReglasUsuario.NormalizarUbicacion("  Rionegro ", "Antioquia")!.Value);
            Assert.Equal(("Rionegro", null), ReglasUsuario.NormalizarUbicacion("Rionegro", null)!.Value);
            Assert.Throws<ReglaNegocioException>(() => ReglasUsuario.NormalizarUbicacion("x", null));
            Assert.Throws<ReglaNegocioException>(() => ReglasUsuario.NormalizarUbicacion("<script>", null));
        }

        [Theory]
        [InlineData("ana@correo.co", true)]
        [InlineData("sin-arroba", false)]
        [InlineData("a b@correo.co", false)]
        public void Correo_SeValida(string correo, bool valido)
        {
            if (valido) Assert.Equal(correo, ReglasUsuario.NormalizarCorreo(correo));
            else Assert.Throws<ReglaNegocioException>(() => ReglasUsuario.NormalizarCorreo(correo));
        }
    }
}
