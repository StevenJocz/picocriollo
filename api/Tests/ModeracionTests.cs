using System.Text.Json.Nodes;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Commands;
namespace PicoCriollo.Tests;
public class ModeracionTests
{
    private static async Task<Guid> Moderador(EntornoMercado e, string nombre)
    {
        var id = await e.Persona(nombre);
        var u = (await e.Almacen.UsuarioAsync(id.ToString()))!;
        var perfil = JsonNode.Parse(u.Perfil)!.AsObject(); perfil["role"] = "moderator"; u.Perfil = perfil.ToJsonString();
        await e.Base.Contexto.SaveChangesAsync(); return id;
    }
    [Fact]
    public async Task SoloStaffPuedeListarYUnDenuncianteNoResuelveSuCaso()
    {
        using var e = new EntornoMercado(); var comandos = new ModeracionCommands(e.Almacen);
        var autor = await e.Persona("Autor"); var mod = await Moderador(e,"Moderador");
        string post = await e.Social.CrearPublicacionAsync(autor, new() { Text = "Publicación de prueba" });
        var error = await Assert.ThrowsAsync<ReglaNegocioException>(() => comandos.ListarAsync(autor)); Assert.Equal(403,error.Estado);
        var denuncia = await comandos.DenunciarAsync(mod,new() { TargetType="post",TargetId=post,Reason="Contenido para revisar" });
        error = await Assert.ThrowsAsync<ReglaNegocioException>(() => comandos.ResolverAsync(mod,denuncia.Id,new(){Action="hide",Note="Ocultar publicación"})); Assert.Equal(403,error.Estado);
        Assert.Null((await e.Almacen.PublicacionesPerfil.ObtenerAsync(post))!.HiddenAt);
    }
    [Fact]
    public async Task OcultarPostCierraDenunciasDelMismoTipoYSeAudita()
    {
        using var e = new EntornoMercado(); var comandos = new ModeracionCommands(e.Almacen);
        var autor = await e.Persona("Autor"); var reporta = await e.Persona("Reporta"); var mod = await Moderador(e,"Moderador");
        string post = await e.Social.CrearPublicacionAsync(autor,new(){Text="Contenido para revisar"});
        var d = await comandos.DenunciarAsync(reporta,new(){TargetType="post",TargetId=post,Reason="Motivo suficientemente detallado"});
        await Assert.ThrowsAsync<ReglaNegocioException>(()=>comandos.DenunciarAsync(reporta,new(){TargetType="post",TargetId=post,Reason="Denuncia duplicada"}));
        await comandos.ResolverAsync(mod,d.Id,new(){Action="hide",Note="Retirada tras revisión"});
        Assert.NotNull((await e.Almacen.PublicacionesPerfil.ObtenerAsync(post))!.HiddenAt);
        Assert.Equal("resuelta",(await e.Almacen.Denuncias.ObtenerAsync(d.Id))!.Status);
        Assert.Contains(await e.Almacen.Registro.ListarAsync(), x=>x.Action=="moderation.report.resolve");
        await Assert.ThrowsAsync<ReglaNegocioException>(()=>comandos.ResolverAsync(mod,d.Id,new(){Action="hide",Note="Repetir resolución"}));
    }
    [Fact]
    public async Task TresReporterosPausanPublicacionSinLiberarElAve()
    {
        using var e = new EntornoMercado(); var comandos = new ModeracionCommands(e.Almacen);
        var vendedor=await e.Persona("Vendedor"); var ave=await e.Ave(vendedor); var id=await e.Publicar(vendedor,ave);
        foreach(string nombre in new[]{"Uno","Dos","Tres"}) { var u=await e.Persona(nombre); await comandos.DenunciarAsync(u,new(){TargetType="listing",TargetId=id,Reason="Revisar datos de esta publicación"}); }
        Assert.Equal("pausada",(await e.Pub(id)).Status);
        Assert.Single(await e.Almacen.Bloqueos.ListarAsync(("listingId",id),("status","active")));
    }
    [Fact]
    public async Task NoPermiteDenunciarMensajesDeOtraConversacion()
    {
        using var e = new EntornoMercado(); var comandos = new ModeracionCommands(e.Almacen);
        var intruso=await e.Persona("Intruso");
        await e.Almacen.EjecutarAsync(()=>{ e.Almacen.Conversaciones.Insertar(new(){Id="hilo",Participants=["otra-persona"]}); e.Almacen.Mensajes.Insertar(new(){Id="mensaje",ThreadId="hilo",SenderId="otra-persona",Body="Privado"}); return Task.CompletedTask; });
        var error=await Assert.ThrowsAsync<ReglaNegocioException>(()=>comandos.DenunciarAsync(intruso,new(){TargetType="message",TargetId="mensaje",Reason="No debería ver este mensaje"}));
        Assert.Equal(404,error.Estado); Assert.Empty(await e.Almacen.Denuncias.ListarAsync());
    }
}
