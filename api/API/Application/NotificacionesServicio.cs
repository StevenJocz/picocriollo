using PicoCriollo.Persistence.Commands;

namespace PicoCriollo.API.Application
{
    /// <summary>
    /// Cada 15 segundos convierte los eventos pendientes en notificaciones (y avisos push); cada hora genera los recordatorios de la granja
    /// (incubación, tareas, existencias y operaciones que esperan). Cada pasada es idempotente.
    /// </summary>
    public class NotificacionesServicio : BackgroundService
    {
        private static readonly TimeSpan Cada = TimeSpan.FromSeconds(15);
        private static readonly TimeSpan CadaRecordatorio = TimeSpan.FromHours(1);

        private readonly IServiceScopeFactory _alcances;
        private readonly ILogger<NotificacionesServicio> _logger;
        private DateTime _ultimoEscaneo = DateTime.MinValue;

        public NotificacionesServicio(IServiceScopeFactory alcances, ILogger<NotificacionesServicio> logger)
        {
            _alcances = alcances;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken parar)
        {
            using var reloj = new PeriodicTimer(Cada);
            do
            {
                try
                {
                    using IServiceScope alcance = _alcances.CreateScope();
                    var comandos = alcance.ServiceProvider.GetRequiredService<INotificacionCommands>();
                    ResultadoSalida r = await comandos.ProcesarSalidaAsync();
                    if (r.Creadas > 0 || r.Fallidos > 0) _logger.LogInformation("Notificaciones: {Procesados} eventos, {Creadas} avisos, {Fallidos} fallos", r.Procesados, r.Creadas, r.Fallidos);
                    if (DateTime.UtcNow - _ultimoEscaneo >= CadaRecordatorio)
                    {
                        _ultimoEscaneo = DateTime.UtcNow;
                        var (personas, emitidos) = await comandos.EscanearTodosAsync();
                        if (emitidos > 0) _logger.LogInformation("Recordatorios: {Emitidos} nuevos para {Personas} granjas", emitidos, personas);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "No se pudieron procesar las notificaciones; se reintenta en un momento");
                }
            }
            while (await reloj.WaitForNextTickAsync(parar));
        }
    }
}
