using System.Text.Json.Nodes;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Mercado;
namespace PicoCriollo.Persistence.Commands;

public interface IModeracionCommands
{
    Task<Denuncia> DenunciarAsync(Guid usuario, DenunciaNuevaDto dto);
    Task<List<DenunciaVista>> ListarAsync(Guid usuario);
    Task<Denuncia> ResolverAsync(Guid usuario, string id, DecisionModeracionDto dto);
    Task ModerarPublicacionAsync(Guid usuario, string id, DecisionModeracionDto dto);
    Task<List<Operacion>> DisputasAsync(Guid usuario);
    Task ResolverDisputaAsync(Guid usuario, string id, DecisionModeracionDto dto);
}
public class ModeracionCommands(AlmacenMercado a) : IModeracionCommands
{
    private static bool Abierta(Denuncia d) => d.Status is "abierta" or "en_revision";
    private static string Texto(string? valor, int minimo) => valor?.Trim() is { } t && t.Length >= minimo && t.Length <= 500 ? t : throw ReglaNegocioException.Validacion($"Escribe entre {minimo} y 500 caracteres.");
    private async Task Staff(Guid usuario)
    {
        var u = await a.UsuarioAsync(usuario.ToString());
        if (u is null || u.Suspendido || u.Rol is not ("admin" or "moderator")) throw ReglaNegocioException.Prohibido("Solo moderadores pueden realizar esta acción.");
    }
    private async Task<(string Dueno, string Texto)> Objetivo(string tipo, string id, string? denunciante = null)
    {
        switch (tipo)
        {
            case "listing":
                var l = await a.Publicaciones.ObtenerAsync(id, true);
                if (l is not null && l.Status != "borrador") return (l.SellerId, l.Snapshot.Name);
                break;
            case "user":
                var u = await a.UsuarioAsync(id);
                if (u is not null) return (id, u.NombreUsuario ?? "Criador");
                break;
            case "post":
                var p = await a.PublicacionesPerfil.ObtenerAsync(id, true);
                if (p is not null && (denunciante is null || p.HiddenAt is null)) return (p.AuthorId, p.Text);
                break;
            case "comment":
                var c = await a.Comentarios.ObtenerAsync(id, true);
                if (c is not null && (denunciante is null || c.HiddenAt is null && c.DeletedAt is null)) return (c.AuthorId, c.Text);
                break;
            case "message":
                var m = await a.Mensajes.ObtenerAsync(id, true);
                var hilo = m is null ? null : await a.Conversaciones.ObtenerAsync(m.ThreadId);
                if (m is not null && hilo is not null && (denunciante is null || hilo.Participants.Contains(denunciante))) return (m.SenderId, m.Body);
                break;
            default: throw ReglaNegocioException.Validacion("Tipo de denuncia no válido.");
        }
        throw ReglaNegocioException.NoEncontrado("Contenido no encontrado.");
    }
    public Task<Denuncia> DenunciarAsync(Guid usuario, DenunciaNuevaDto dto) => a.EjecutarAsync(async () =>
    {
        string yo = usuario.ToString(), motivo = Texto(dto.Reason, 10);
        await a.AsegurarActivaAsync(yo);
        var objetivo = await Objetivo(dto.TargetType, dto.TargetId, yo);
        if (objetivo.Dueno == yo) throw ReglaNegocioException.Prohibido("No puedes denunciar tu propio contenido.");
        await a.LimitarUsoAsync(yo, "report.create", 20, TimeSpan.FromHours(1), "denuncias por hora");
        var existentes = await a.Denuncias.ListarAsync(("targetType", dto.TargetType), ("targetId", dto.TargetId));
        if (existentes.Any(d => d.ReporterId == yo && Abierta(d))) throw ReglaNegocioException.Conflicto("Ya tienes una denuncia abierta sobre este contenido.");
        var d = new Denuncia { Id = Guid.NewGuid().ToString(), TargetType = dto.TargetType, TargetId = dto.TargetId, ReporterId = yo, Reason = motivo, CreatedAt = JsonMercado.Iso(a.Ahora), UpdatedAt = JsonMercado.Iso(a.Ahora) };
        a.Denuncias.Insertar(d);
        a.Auditar(yo, "report.create", d.TargetType, d.TargetId, new { reportId = d.Id });
        await a.EmitirAsync("moderation.report.created", "report", d.Id, new { reportId = d.Id, reporterId = yo }, $"report:{d.Id}");
        if (d.TargetType == "listing" && existentes.Where(Abierta).Select(x => x.ReporterId).Append(yo).Distinct().Count() >= 3)
        {
            var p = (await a.Publicaciones.ObtenerAsync(d.TargetId, true))!;
            if (p.Status == "publicada" && !(await a.Ofertas.ListarAsync("listingId", p.Id)).Any(b => b.Status == "valida"))
                await AplicarPublicacion("sistema", p.Id, "pause", "Varias denuncias: pendiente de revisión.");
        }
        return d;
    });
    public Task<List<DenunciaVista>> ListarAsync(Guid usuario) => a.EjecutarAsync(async () =>
    {
        await Staff(usuario);
        var resultado = new List<DenunciaVista>();
        foreach (var d in (await a.Denuncias.ListarAsync()).OrderByDescending(x => x.CreatedAt))
        {
            string objetivo;
            try { objetivo = (await Objetivo(d.TargetType, d.TargetId)).Texto; }
            catch (ReglaNegocioException e) when (e.Estado == 404) { objetivo = "Contenido eliminado"; }
            resultado.Add(new(d, await a.AliasAsync(d.ReporterId), objetivo));
        }
        return resultado;
    });
    public Task<Denuncia> ResolverAsync(Guid usuario, string id, DecisionModeracionDto dto) => a.EjecutarAsync(async () =>
    {
        await Staff(usuario);
        string yo = usuario.ToString(), nota = Texto(dto.Note, 5), en = JsonMercado.Iso(a.Ahora);
        var d = await a.Denuncias.ObtenerAsync(id, true) ?? throw ReglaNegocioException.NoEncontrado("Denuncia no encontrada.");
        if (!Abierta(d)) throw ReglaNegocioException.Conflicto("La denuncia ya fue resuelta.");
        if (d.ReporterId == yo) throw ReglaNegocioException.Prohibido("No puedes resolver tu propia denuncia.");
        if (dto.Action != "dismiss")
        {
            if ((await Objetivo(d.TargetType, d.TargetId)).Dueno == yo) throw ReglaNegocioException.Prohibido("No puedes moderar tu propio contenido.");
            if (d.TargetType == "listing") await AplicarPublicacion(yo, d.TargetId, dto.Action, nota);
            else if (d.TargetType == "user" && dto.Action is "warn" or "suspend" or "unsuspend")
            {
                var u = (await a.UsuarioAsync(d.TargetId))!;
                var perfil = JsonNode.Parse(u.Perfil)!.AsObject();
                if (dto.Action == "suspend") { perfil["suspendedAt"] = en; perfil["suspendedReason"] = nota; }
                if (dto.Action == "unsuspend") { perfil.Remove("suspendedAt"); perfil.Remove("suspendedReason"); }
                u.Perfil = perfil.ToJsonString();
                string evento = dto.Action == "warn" ? "warned" : dto.Action == "suspend" ? "suspended" : "restored";
                await a.EmitirAsync($"moderation.account.{evento}", "user", d.TargetId, new { userId = d.TargetId, note = nota }, $"mod-account:{d.Id}");
            }
            else if (dto.Action == "hide" && d.TargetType == "post") { var p = (await a.PublicacionesPerfil.ObtenerAsync(d.TargetId))!; p.HiddenAt = en; p.HiddenBy = yo; a.PublicacionesPerfil.Actualizar(p); }
            else if (dto.Action == "hide" && d.TargetType == "comment") { var c = (await a.Comentarios.ObtenerAsync(d.TargetId))!; c.HiddenAt = en; c.HiddenBy = yo; a.Comentarios.Actualizar(c); }
            else if (dto.Action == "hide" && d.TargetType == "message") { var m = (await a.Mensajes.ObtenerAsync(d.TargetId))!; m.Hidden = true; a.Mensajes.Actualizar(m); }
            else throw ReglaNegocioException.Validacion("La acción no corresponde a este contenido.");
        }
        foreach (var gemela in (await a.Denuncias.ListarAsync(("targetType", d.TargetType), ("targetId", d.TargetId))).Where(Abierta))
        {
            gemela.Status = dto.Action == "dismiss" ? "descartada" : "resuelta"; gemela.Resolution = $"{dto.Action}: {nota}"; gemela.UpdatedAt = en; a.Denuncias.Actualizar(gemela);
        }
        a.Auditar(yo, "moderation.report.resolve", d.TargetType, d.TargetId, new { reportId = id, action = dto.Action, note = nota });
        return (await a.Denuncias.ObtenerAsync(id))!;
    });
    public Task ModerarPublicacionAsync(Guid usuario, string id, DecisionModeracionDto dto) => a.EjecutarAsync(async () => { await Staff(usuario); await AplicarPublicacion(usuario.ToString(), id, dto.Action, Texto(dto.Note, 5)); });
    private async Task AplicarPublicacion(string actor, string id, string accion, string nota)
    {
        var p = await a.Publicaciones.ObtenerAsync(id, true) ?? throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
        if (p.SellerId == actor) throw ReglaNegocioException.Prohibido("No puedes moderar tu propia publicación.");
        if (accion is not ("pause" or "restore" or "reject" or "withdraw")) throw ReglaNegocioException.Validacion("Acción no válida.");
        if (accion == "restore" ? p.Status != "pausada" : accion == "pause" ? p.Status != "publicada" : p.Status is not ("publicada" or "pausada")) throw ReglaNegocioException.Conflicto("El estado de la publicación no permite esta acción.");
        if (accion is "reject" or "withdraw")
        {
            await a.LiberarAsync(id);
            var ofertas = await a.Ofertas.ListarAsync("listingId", id);
            foreach (var oferta in ofertas) { oferta.Status = "no_ganadora"; a.Ofertas.Actualizar(oferta); }
            if (ofertas.Count > 0) await a.EmitirAsync("market.auction.cancelled", "listing", id, new { listingId = id, bidderIds = ofertas.Select(x => x.BidderId).Distinct(), reason = nota }, $"auction-cancelled:{id}");
            p.ClosedReason = accion == "reject" ? "rechazada_por_moderacion" : "retirada_por_moderacion";
        }
        p.Status = accion switch { "pause" => "pausada", "restore" => "publicada", "reject" => "rechazada", _ => "retirada" };
        p.Version++; p.UpdatedAt = JsonMercado.Iso(a.Ahora); a.Publicaciones.Actualizar(p);
        string evento = accion switch { "pause" => "paused", "restore" => "restored", "reject" => "rejected", _ => "withdrawn" };
        await a.EmitirAsync($"moderation.listing.{evento}", "listing", id, new { listingId = id, note = nota }, $"mod:{id}:{p.Version}");
        a.Auditar(actor, $"moderation.listing.{accion}", "listing", id, new { note = nota });
    }
    public Task<List<Operacion>> DisputasAsync(Guid usuario) => a.EjecutarAsync(async () => { await Staff(usuario); return await a.Operaciones.ListarAsync("status", "disputada"); });
    public Task ResolverDisputaAsync(Guid usuario, string id, DecisionModeracionDto dto) => a.EjecutarAsync(async () =>
    {
        await Staff(usuario);
        string yo = usuario.ToString(), nota = Texto(dto.Note, 5);
        if (dto.Action is not ("cancel" or "resume")) throw ReglaNegocioException.Validacion("Decisión no válida.");
        var op = await a.Operaciones.ObtenerAsync(id, true) ?? throw ReglaNegocioException.NoEncontrado("Operación no encontrada.");
        if (op.BuyerId == yo || op.SellerId == yo) throw ReglaNegocioException.Prohibido("No puedes resolver una operación en la que participas.");
        if (op.Status != "disputada") throw ReglaNegocioException.Conflicto("La operación no está en disputa.");
        string estado = op.History.LastOrDefault(h => h.Status != "disputada")?.Status ?? "pago_pendiente";
        if (dto.Action == "cancel")
        {
            var p = await a.Publicaciones.ObtenerAsync(op.ListingId, true);
            if (p is not null && (await a.ActivosAsync(p.Id)).Any(b => b.OperationId == id))
            {
                if (op.Origin == "directa") { await a.SoltarDeOperacionAsync(p.Id, id); if (p.Status == "en_operacion") p.Status = "publicada"; }
                else { await a.LiberarAsync(p.Id); p.Status = "cerrada_sin_ofertas"; p.ClosedReason = "operacion_cancelada"; }
                p.Version++; p.UpdatedAt = JsonMercado.Iso(a.Ahora); a.Publicaciones.Actualizar(p);
            }
            op.CancelReason = $"Cancelada por moderación: {nota}"; estado = "cancelada";
        }
        AyudasOperacion.Paso(op, estado, yo, a.Ahora, nota); a.Operaciones.Actualizar(op);
        a.Auditar(yo, $"moderation.dispute.{dto.Action}", "operation", id, new { note = nota });
        await a.EmitirAsync("moderation.dispute.resolved", "operation", id, new { operationId = id, decision = dto.Action, note = nota }, $"dispute-resolved:{id}:{op.Version}");
    });
}
