using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.DTOs.NotificacionesD;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.Tests
{
    public class NotificacionesTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        private static async Task<List<NotificacionDto>> De(EntornoMercado e, Guid persona, string? estado = null) => await e.Avisos.ListarAsync(persona, estado, null, null, null);

        [Fact]
        public async Task LosEventosDelMercadoSeConviertenEnAvisosUnaSolaVez()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await e.Publicar(ana, await e.Ave(ana));

            var r = await e.Notificaciones.ProcesarSalidaAsync();
            Assert.True(r.Procesados >= 1);
            var avisos = await De(e, ana);
            Assert.Contains(avisos, a => a.Title == "Publicación creada" && a.Link.View == "publicaciones" && a.Link.Id == id);
            Assert.Equal(0, (await e.Notificaciones.ProcesarSalidaAsync()).Procesados);

            await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto { Message = "¿Sigue disponible?" });
            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Contains(await De(e, ana), a => a.Title.StartsWith("Solicitud de compra por «Luna»") && a.Body.Contains("Beto") && a.Body.Contains("$150.000"));
            Assert.Contains(await De(e, ana), a => a.Title.StartsWith("Mensaje nuevo") && a.Body.StartsWith("Beto: ¿Sigue disponible?"));
            Assert.DoesNotContain(await De(e, beto), a => a.Type == "market.purchase.requested");
        }

        [Fact]
        public async Task LasPreferenciasSilencianLoNoCriticoPeroNoLoCritico()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            await e.Notificaciones.ActualizarPreferenciasAsync(beto, new PreferenciasCambioDto { Categories = new() { ["comercial"] = false } });
            string id = await e.Publicar(ana, await e.Ave(ana));
            var op = await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto());
            await e.Operaciones.ResponderAsync(ana, op.Id, false);
            await e.Notificaciones.ProcesarSalidaAsync();
            // «Tu solicitud no prosperó» es comercial y no crítico: silenciado.
            Assert.DoesNotContain(await De(e, beto), a => a.Type == "market.purchase.rejected");

            var segunda = await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto());
            await e.Operaciones.ResponderAsync(ana, segunda.Id, true);
            await e.Notificaciones.ProcesarSalidaAsync();
            // «El vendedor aceptó tu solicitud» es crítico: llega aunque la categoría esté apagada.
            Assert.Contains(await De(e, beto), a => a.Type == "market.purchase.accepted");
        }

        [Fact]
        public async Task LeerSoloFuncionaConLasPropiasYElResumenSeparaLosMensajes()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await e.Publicar(ana, await e.Ave(ana));
            await e.Mensajes.EnviarAsync(beto, new MensajeNuevoDto { ListingId = id, Body = "Hola" });
            await e.Notificaciones.ProcesarSalidaAsync();

            var resumen = await e.Avisos.ResumenAsync(ana);
            Assert.Equal(1, resumen.UnreadMessages);
            Assert.Single(resumen.MessageThreads);
            Assert.Equal(1, resumen.Unread);

            var propia = (await De(e, ana)).Single(a => a.Type == "market.listing.published");
            await Falla(e.Notificaciones.LeerAsync(beto, [propia.Id]), 403);
            await Falla(e.Notificaciones.LeerAsync(ana, []), 400);
            Assert.Equal(1, await e.Notificaciones.LeerAsync(ana, [propia.Id]));
            Assert.Equal(0, await e.Notificaciones.LeerAsync(ana, [propia.Id]));

            var mensaje = (await De(e, ana, "no_leidas")).Single(a => a.Type == "market.message.created");
            Assert.Equal(1, await e.Notificaciones.LeerEnlaceAsync(ana, "market.message.created", mensaje.Link.Id!));
            Assert.Equal(0, (await e.Avisos.ResumenAsync(ana)).UnreadMessages);
            Assert.Equal(0, await e.Notificaciones.LeerTodasAsync(beto));
        }

        [Fact]
        public async Task LasPreferenciasSeValidanYLaBandejaInternaNoSeApaga()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            var inicial = await e.Avisos.PreferenciasAsync(ana);
            Assert.True(inicial.Categories["comercial"]);
            Assert.False(inicial.Channels["push"]);

            var cambiada = await e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto
            {
                Channels = new() { ["inApp"] = false, ["push"] = true }, QuietHours = new SilencioDto { Enabled = true, Start = "21:30", End = "06:00" }, TaskLeadDays = 5,
                Commercial = new ComercialDto { Offers = false },
            });
            Assert.True(cambiada.Channels["inApp"]);
            Assert.True(cambiada.Channels["push"]);
            Assert.Equal("21:30", cambiada.QuietHours.Start);
            Assert.Equal(5, cambiada.TaskLeadDays);
            Assert.False(cambiada.Commercial.Offers);
            Assert.True(cambiada.Commercial.Interests);
            Assert.Equal(5, (await e.Avisos.PreferenciasAsync(ana)).TaskLeadDays);

            await Falla(e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { Categories = new() { ["inventada"] = true } }), 400);
            await Falla(e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { QuietHours = new SilencioDto { Enabled = true, Start = "25:00", End = "06:00" } }), 400);
            await Falla(e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { TimeZone = "Marte/Olympus" }), 400);
            await Falla(e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { IncubationLeadDays = 99 }), 400);
            await Falla(e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { Digest = "cada minuto" }), 400);
        }

        [Fact]
        public async Task Push_SoloConElCanalActivoYRespetaElSilencio()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            await Falla(e.Notificaciones.RegistrarDispositivoAsync(ana, new DispositivoDto { Token = "token-que-no-es-de-expo", Plataforma = "ios" }), 400);
            await e.Notificaciones.RegistrarDispositivoAsync(ana, new DispositivoDto { Token = "ExponentPushToken[abc123]", Plataforma = "ios" });
            string id = await e.Publicar(ana, await e.Ave(ana));

            // Canal apagado: nada sale al teléfono, la notificación igual queda en la bandeja.
            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Empty(e.Push.Enviados);
            Assert.NotEmpty(await De(e, ana));

            await e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { Channels = new() { ["push"] = true } });
            await e.Operaciones.SolicitarCompraAsync(beto, id, new SolicitudCompraDto());
            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Contains(e.Push.Enviados, m => m.Token == "ExponentPushToken[abc123]" && m.Titulo.StartsWith("Solicitud de compra"));

            // En horas de silencio lo no urgente espera; sigue en la bandeja.
            e.Push.Enviados.Clear();
            await e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { QuietHours = new SilencioDto { Enabled = true, Start = "00:00", End = "23:59" } });
            await e.Mensajes.EnviarAsync(beto, new MensajeNuevoDto { ListingId = id, Body = "¿Hablamos?" });
            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Empty(e.Push.Enviados);

            // Expo avisa que el teléfono ya no existe: se olvida su token.
            e.Push.Olvidar.Add("ExponentPushToken[abc123]");
            await e.Notificaciones.ActualizarPreferenciasAsync(ana, new PreferenciasCambioDto { QuietHours = new SilencioDto { Enabled = false, Start = "22:00", End = "06:00" } });
            await e.Mensajes.EnviarAsync(beto, new MensajeNuevoDto { ListingId = id, Body = "Otro mensaje" });
            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Single(e.Push.Enviados);
            Assert.Empty(e.Base.Contexto.DispositivoEs);
        }

        [Fact]
        public async Task Recordatorios_SeGeneranUnaSolaVezYLleganComoAviso()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            string gallinero = (await e.Granja.CrearGallineroAsync(ana, new GallineroDto { Name = "Corral", Capacity = 10 })).Id;
            // El reloj de prueba está en 2026-10-22: la tarea vence al día siguiente.
            await e.Granja.CrearTareaAsync(ana, new TareaDto { Title = "Vacunar contra Newcastle", CoopId = gallinero, FrequencyDays = 30, NextDue = "2026-10-23" });
            await e.Granja.CrearCompraAsync(ana, new CompraDto { Date = "2026-10-20", Product = "Maíz", Category = "Alimento ponedoras", Quantity = 1, Unit = "kg", UnitPrice = 1000, CoopId = gallinero });

            Assert.True(await e.Notificaciones.EscanearRecordatoriosAsync(ana.ToString()) >= 1);
            Assert.Equal(0, await e.Notificaciones.EscanearRecordatoriosAsync(ana.ToString()));

            await e.Notificaciones.ProcesarSalidaAsync();
            var avisos = await De(e, ana);
            Assert.Contains(avisos, a => a.Type == "health.due_soon" && a.Category == "salud" && a.Body.Contains("no sustituye la evaluación de un veterinario"));
            Assert.Contains(avisos, a => a.Type == "stock.low" && a.Title == "Existencia baja: Maíz");
        }

        [Fact]
        public async Task LosEventosQueEstaApiNoConoceSeDejanPendientes()
        {
            using var e = new EntornoMercado();
            await e.Persona("Ana");
            await e.Almacen.EjecutarAsync(async () => { await e.Almacen.EmitirAsync("future.event.unknown", "report", "r1", new { reportId = "r1" }, "moderacion:r1"); });
            var r = await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Equal(0, r.Procesados);
            Assert.Equal("pending", (await e.Almacen.Salida.ListarAsync("dedupeKey", "moderacion:r1")).Single().Status);
        }
    }
}
