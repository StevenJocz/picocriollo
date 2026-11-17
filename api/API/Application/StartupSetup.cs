using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PicoCriollo.Domain.DTOs;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure;
using PicoCriollo.Infrastructure.Correo;
using PicoCriollo.Infrastructure.Push;
using PicoCriollo.Infrastructure.Seguridad;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Mercado;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.API.Application
{
    public static class StartupSetup
    {
        public static IServiceCollection AddStartupSetup(this IServiceCollection service, IConfiguration configuration, IHostEnvironment entorno)
        {
            // Base de datos: un contexto por petición. Sin cadena de conexión solo se arranca en Development, con una base en memoria
            // (para probar clientes sin PostgreSQL); en cualquier otro entorno es un error, nunca datos que se pierden en silencio.
            string? conexion = configuration.GetConnectionString("Conexion");
            if (string.IsNullOrWhiteSpace(conexion) && !entorno.IsDevelopment())
                throw new InvalidOperationException("Configura ConnectionStrings__Conexion.");
            service.AddDbContext<DBContext>(opciones =>
            {
                if (string.IsNullOrWhiteSpace(conexion)) opciones.UseInMemoryDatabase("pico-desarrollo");
                else opciones.UseNpgsql(conexion);
            });
            service.AddSingleton(TimeProvider.System);

            // Opciones
            service.Configure<JwtOpciones>(configuration.GetSection(JwtOpciones.Seccion));
            service.Configure<CorreoOpciones>(configuration.GetSection(CorreoOpciones.Seccion));
            service.Configure<AppOpciones>(configuration.GetSection(AppOpciones.Seccion));
            service.Configure<PushOpciones>(configuration.GetSection(PushOpciones.Seccion));
            service.AddHttpClient<IEnviadorPush, ExpoPush>(c => c.Timeout = TimeSpan.FromSeconds(15));

            // Queries
            service.AddTransient<IUsuarioQueries, UsuarioQueries>();
            service.AddTransient<IGranjaQueries, GranjaQueries>();
            service.AddTransient<IMercadoQueries, MercadoQueries>();
            service.AddTransient<INotificacionQueries, NotificacionQueries>();
            service.AddTransient<ISocialQueries, SocialQueries>();

            // Commands
            service.AddTransient<IUsuarioCommands, UsuarioCommands>();
            service.AddTransient<IGranjaCommands, GranjaCommands>();
            service.AddTransient<IPublicacionCommands, PublicacionCommands>();
            service.AddTransient<ISubastaCommands, SubastaCommands>();
            service.AddTransient<IOperacionCommands, OperacionCommands>();
            service.AddTransient<IMensajeCommands, MensajeCommands>();
            service.AddTransient<INotificacionCommands, NotificacionCommands>();
            service.AddTransient<ISocialCommands, SocialCommands>();
            service.AddTransient<IModeracionCommands, ModeracionCommands>();
            service.AddTransient<IMercadoGuardia, MercadoGuardia>();
            // Una sola instancia por petición: las colecciones y el contexto de la granja son los mismos.
            service.AddScoped<AlmacenMercado>();
            if (configuration.GetValue("Mercado:CierreAutomatico", true)) service.AddHostedService<CierreSubastasServicio>();
            if (configuration.GetValue("Notificaciones:Automaticas", true)) service.AddHostedService<NotificacionesServicio>();

            // Utilidades
            service.AddSingleton<IPassword, Password>();

            // Servicios
            service.AddSingleton<IGenerarToken, GenerarToken>();
            service.AddSingleton<ICorreoServicio, CorreoServicio>();

            AgregarAutenticacion(service, configuration);
            AgregarLimites(service);

            // El frontend (Expo web) vive en otro origen. Con tokens en la cabecera no hace falta permitir credenciales.
            string[] origenes = configuration.GetSection("Web:Origenes").Get<string[]>() ?? [];
            service.AddCors(opciones => opciones.AddDefaultPolicy(politica => politica.WithOrigins(origenes).AllowAnyHeader().AllowAnyMethod()));

            service.Configure<ForwardedHeadersOptions>(opciones =>
            {
                opciones.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
                // La API no se publica hacia afuera: solo la alcanza el proxy dentro de la red de Docker.
                opciones.KnownIPNetworks.Clear();
                opciones.KnownProxies.Clear();
            });

            return service;
        }

        private static void AgregarAutenticacion(IServiceCollection service, IConfiguration configuration)
        {
            var jwt = configuration.GetSection(JwtOpciones.Seccion).Get<JwtOpciones>() ?? new JwtOpciones();
            if (Encoding.UTF8.GetByteCount(jwt.Key) < 32)
                throw new InvalidOperationException("Configura Jwt__Key con al menos 32 caracteres (variable de entorno o secretos de usuario).");

            service.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(opciones =>
            {
                opciones.MapInboundClaims = false;
                opciones.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Emisor,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audiencia,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "nombre",
                    RoleClaimType = "role",
                };
            });
            service.AddAuthorization();
        }

        private static void AgregarLimites(IServiceCollection service)
        {
            static string Ip(HttpContext contexto) => contexto.Connection.RemoteIpAddress?.ToString() ?? "desconocida";

            service.AddRateLimiter(opciones =>
            {
                opciones.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
                opciones.OnRejected = async (contexto, cancelar) =>
                    await contexto.HttpContext.Response.WriteAsJsonAsync(
                        new RespuestaDto { Respuesta = false, Mensaje = "Demasiados intentos. Espera unos minutos antes de volver a probar." }, cancelar);
                opciones.AddPolicy("auth", contexto => RateLimitPartition.GetFixedWindowLimiter(Ip(contexto),
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
                opciones.AddPolicy("olvido", contexto => RateLimitPartition.GetFixedWindowLimiter(Ip(contexto),
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(15), QueueLimit = 0 }));
            });
        }

        /// <summary>
        /// En el contrato, todo lo que no admite null es obligatorio: el cliente generado deja de tratar cada campo como «quizá no venga».
        /// (ASP.NET no lo hace solo con los tipos de referencia no nulos.)
        /// </summary>
        public static Task MarcarObligatorios(Microsoft.OpenApi.OpenApiSchema esquema, Microsoft.AspNetCore.OpenApi.OpenApiSchemaTransformerContext contexto, CancellationToken cancelar)
        {
            if (esquema.Properties is not { Count: > 0 }) return Task.CompletedTask;
            esquema.Required ??= new HashSet<string>();
            foreach (var (nombre, propiedad) in esquema.Properties)
            {
                bool admiteNulo = propiedad.Type is { } tipo && tipo.HasFlag(Microsoft.OpenApi.JsonSchemaType.Null)
                    || propiedad.OneOf?.Any(o => o.Type is { } t && t.HasFlag(Microsoft.OpenApi.JsonSchemaType.Null)) == true
                    || propiedad.AnyOf?.Any(o => o.Type is { } t2 && t2.HasFlag(Microsoft.OpenApi.JsonSchemaType.Null)) == true;
                if (!admiteNulo) esquema.Required.Add(nombre);
            }
            return Task.CompletedTask;
        }

        /// <summary>Los errores de validación de los DTO salen con el mismo formato que el resto: { respuesta, mensaje }.</summary>
        public static void RespuestaDeValidacion(ApiBehaviorOptions opciones) =>
            opciones.InvalidModelStateResponseFactory = contexto =>
            {
                string mensaje = contexto.ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).FirstOrDefault(m => !string.IsNullOrWhiteSpace(m))
                    ?? "Los datos enviados no son válidos.";
                return new BadRequestObjectResult(new RespuestaDto { Respuesta = false, Mensaje = mensaje });
            };
    }
}
