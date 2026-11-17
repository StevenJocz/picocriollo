using PicoCriollo.Persistence.Commands;

namespace PicoCriollo.API.Application
{
    /// <summary>Cierra cada minuto las subastas vencidas (adjudica o libera el ave) y avisa de las que están por cerrar. Cada pasada es idempotente.</summary>
    public class CierreSubastasServicio : BackgroundService
    {
        private static readonly TimeSpan Cada = TimeSpan.FromMinutes(1);

        private readonly IServiceScopeFactory _alcances;
        private readonly ILogger<CierreSubastasServicio> _logger;

        public CierreSubastasServicio(IServiceScopeFactory alcances, ILogger<CierreSubastasServicio> logger)
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
                    var cierre = await alcance.ServiceProvider.GetRequiredService<ISubastaCommands>().CerrarVencidasAsync();
                    if (cierre.Closed > 0) _logger.LogInformation("Subastas cerradas: {Cerradas}", cierre.Closed);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "No se pudieron cerrar las subastas vencidas; se reintenta en un minuto");
                }
            }
            while (await reloj.WaitForNextTickAsync(parar));
        }
    }
}
