using PicoCriollo.Domain.DTOs.NotificacionesD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Commands;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Queries
{
    public class CanalDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")] public string Id { get; set; } = null!;
        [System.Text.Json.Serialization.JsonPropertyName("label")] public string Label { get; set; } = null!;
        [System.Text.Json.Serialization.JsonPropertyName("configured")] public bool Configured { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("detail")] public string Detail { get; set; } = null!;
    }

    public interface INotificacionQueries
    {
        Task<List<NotificacionDto>> ListarAsync(Guid usuario, string? estado, string? categoria, int? limite, string? antes);
        Task<ResumenNotificacionesDto> ResumenAsync(Guid usuario);
        Task<PreferenciasDto> PreferenciasAsync(Guid usuario);
        List<CanalDto> Canales();
    }

    public class NotificacionQueries : INotificacionQueries
    {
        private const string TipoMensaje = "market.message.created";
        private readonly AlmacenMercado _a;

        public NotificacionQueries(AlmacenMercado almacen) => _a = almacen;

        public static NotificacionDto Vista(Notificacion n) => new()
        {
            Id = n.Id, Category = n.Category, Priority = n.Priority, Critical = n.Critical, Type = n.Type, Title = n.Title, Body = n.Body,
            Link = new EnlaceDto { View = n.Link.View, Id = n.Link.Id }, CreatedAt = n.CreatedAt, ReadAt = n.ReadAt,
        };

        // Toda consulta se limita a quien tiene la sesión: nunca se acepta el id de otra persona.
        public async Task<List<NotificacionDto>> ListarAsync(Guid usuario, string? estado, string? categoria, int? limite, string? antes)
        {
            if (!string.IsNullOrEmpty(categoria) && !ReglasNotificaciones.Categorias.ContainsKey(categoria)) throw ReglaNegocioException.Validacion("Categoría no válida.");
            if (!string.IsNullOrEmpty(estado) && estado is not ("todas" or "no_leidas" or "leidas")) throw ReglaNegocioException.Validacion("Estado no válido.");
            int tope = Math.Clamp(limite ?? 30, 1, 100);
            return (await _a.Notificaciones.ListarAsync("userId", usuario.ToString()))
                .Where(n => string.IsNullOrEmpty(categoria) || n.Category == categoria)
                .Where(n => estado == "no_leidas" ? n.ReadAt is null : estado != "leidas" || n.ReadAt is not null)
                .Where(n => string.IsNullOrEmpty(antes) || string.CompareOrdinal(n.CreatedAt, antes) < 0)
                .OrderByDescending(n => n.CreatedAt, StringComparer.Ordinal).ThenByDescending(n => n.Id, StringComparer.Ordinal)
                .Take(tope).Select(Vista).ToList();
        }

        public async Task<ResumenNotificacionesDto> ResumenAsync(Guid usuario)
        {
            List<Notificacion> todas = await _a.Notificaciones.ListarAsync("userId", usuario.ToString());
            List<Notificacion> sinLeer = todas.Where(n => n.ReadAt is null).ToList();
            List<Notificacion> mensajes = sinLeer.Where(n => n.Type == TipoMensaje).ToList();
            return new ResumenNotificacionesDto
            {
                Unread = sinLeer.Count - mensajes.Count, UnreadMessages = mensajes.Count,
                MessageThreads = mensajes.Select(n => n.Link.Id).OfType<string>().Distinct().ToList(),
                Critical = sinLeer.Count(n => n.Critical || n.Priority is "critica" or "alta"),
                Latest = todas.OrderByDescending(n => n.CreatedAt, StringComparer.Ordinal).Take(8).Select(Vista).ToList(),
            };
        }

        public async Task<PreferenciasDto> PreferenciasAsync(Guid usuario) =>
            NotificacionCommands.Vista(ReglasNotificaciones.Completar(await _a.Preferencias.ObtenerAsync(usuario.ToString()), usuario.ToString(), _a.Ahora));

        /// <summary>Lo que ve la pantalla de preferencias: el correo y el navegador los atiende todavía la app web; el push móvil sí está aquí.</summary>
        public List<CanalDto> Canales() =>
        [
            new() { Id = "inApp", Label = ReglasNotificaciones.Canales["inApp"], Configured = true, Detail = "Siempre disponible." },
            new() { Id = "push", Label = ReglasNotificaciones.Canales["push"], Configured = true, Detail = "Avisos en tu teléfono. Se activan al permitirlo en la app." },
            new() { Id = "email", Label = ReglasNotificaciones.Canales["email"], Configured = false, Detail = "Todavía no está en la app nueva." },
            new() { Id = "browser", Label = ReglasNotificaciones.Canales["browser"], Configured = false, Detail = "Solo en la versión web anterior." },
        ];
    }
}
