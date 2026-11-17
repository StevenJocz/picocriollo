using Microsoft.EntityFrameworkCore;
using PicoCriollo.API.Application;
using PicoCriollo.API.Filtros;
using PicoCriollo.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers(opciones => opciones.Filters.Add<ManejadorErroresFiltro>())
    .ConfigureApiBehaviorOptions(StartupSetup.RespuestaDeValidacion)
    // Números solo como números: el contrato (OpenAPI) dice `integer`, no `integer | string`, y el cliente generado queda limpio.
    .AddJsonOptions(opciones => opciones.JsonSerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict);
// El generador del contrato lee estas opciones (las de MVC solo valen para los controladores).
builder.Services.ConfigureHttpJsonOptions(opciones => opciones.SerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.Strict);
builder.Services.AddOpenApi(opciones => opciones.AddSchemaTransformer(StartupSetup.MarcarObligatorios));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddStartupSetup(builder.Configuration, builder.Environment);
builder.Services.AddSingleton<ProcesadorMedia>();
builder.Services.AddSingleton<ColaVideos>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ColaVideos>());

var app = builder.Build();

// Detrás de Nginx Proxy Manager / Cloudflare la dirección real llega en X-Forwarded-For (los límites de intentos la usan).
app.UseForwardedHeaders();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("OpenApi:Publicar"))
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.MapGet("/api/health", async (DBContext contexto) =>
    await contexto.Database.CanConnectAsync()
        ? Results.Ok(new { status = "ok", database = "connected" })
        : Results.Json(new { status = "unavailable" }, statusCode: StatusCodes.Status503ServiceUnavailable));

if (app.Configuration.GetValue("Base:AplicarEsquema", true))
{
    using var alcance = app.Services.CreateScope();
    var contexto = alcance.ServiceProvider.GetRequiredService<DBContext>();
    if (contexto.Database.IsNpgsql()) await Esquema.AplicarAsync(contexto);
}


app.Run();

// Permite que las pruebas de integración arranquen la aplicación.
public partial class Program { }
