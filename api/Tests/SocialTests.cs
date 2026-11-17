using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.DTOs.SocialD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Persistence.Queries;

namespace PicoCriollo.Tests
{
    public class SocialTests
    {
        private static async Task<ReglaNegocioException> Falla(Task tarea, int estado)
        {
            var ex = await Assert.ThrowsAsync<ReglaNegocioException>(() => tarea);
            Assert.Equal(estado, ex.Estado);
            return ex;
        }

        private static async Task<string> Publicar(EntornoMercado e, Guid autor, string texto, string? video = null) =>
            await e.Social.CrearPublicacionAsync(autor, new PublicacionPerfilNuevaDto { Text = texto, VideoUrl = video });

        // 1x1 PNG válido
        private static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

        [Fact]
        public async Task Seguir_CuentaSeguidoresYNoPermiteSeguirseASiMisma()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            await Falla(e.Social.SeguirAsync(ana, ana.ToString(), true), 400);
            var r = await e.Social.SeguirAsync(beto, ana.ToString(), true);
            Assert.True(r.Following);
            Assert.Equal(1, r.Followers);
            Assert.Equal(1, (await e.Social.SeguirAsync(beto, ana.ToString(), true)).Followers);

            var perfil = await e.Perfiles.PerfilAsync(ana.ToString(), beto);
            Assert.Equal(1, perfil.Followers);
            Assert.True(perfil.IsFollowing);
            Assert.False(perfil.IsMe);
            Assert.True((await e.Perfiles.PerfilAsync(ana.ToString(), ana)).IsMe);

            var fin = await e.Social.SeguirAsync(beto, ana.ToString(), false);
            Assert.False(fin.Following);
            Assert.Equal(0, fin.Followers);
            Assert.False((await e.Perfiles.PerfilAsync(ana.ToString(), beto)).IsFollowing);
            await Falla(e.Social.SeguirAsync(beto, Guid.NewGuid().ToString(), true), 404);
        }

        [Fact]
        public async Task Publicar_ValidaTextoContactoYEnlacesDeVideo()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana");
            await Falla(e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto()), 400);
            await Falla(e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto { Text = "Escríbeme al 300 123 4567" }), 400);
            await Falla(e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto { Text = "mi correo es ana@correo.co" }), 400);
            await Falla(e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto { Text = new string('a', 601) }), 400);
            await Falla(e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto { VideoUrl = "https://www.tiktok.com/@alguien/video/1234567890123" }), 400);

            string id = await Publicar(e, ana, "Mis gallos #criollos", "https://youtu.be/dQw4w9WgXcQ");
            var post = await e.Perfiles.PostAsync(id, ana);
            Assert.Equal("youtube", post.Embed!.Provider);
            Assert.Equal("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1", post.Embed.EmbedUrl);
            Assert.True(post.Mine);

            // Un enlace de YouTube dentro del texto también se reconoce.
            string otro = await Publicar(e, ana, "Mira esto https://www.youtube.com/watch?v=abcdefghijk.");
            Assert.Equal("abcdefghijk", (await e.Perfiles.PostAsync(otro, ana)).Embed!.Id);
        }

        [Fact]
        public async Task Editar_BorrarYVerSoloLoPropio()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await Publicar(e, ana, "Primera");
            await Falla(e.Social.EditarPublicacionAsync(beto, id, "robada"), 403);
            await Falla(e.Social.BorrarPublicacionAsync(beto, id), 403);
            await Falla(e.Social.EditarPublicacionAsync(ana, id, ""), 400);
            await e.Social.EditarPublicacionAsync(ana, id, "Editada");
            var post = await e.Perfiles.PostAsync(id, beto);
            Assert.Equal("Editada", post.Text);
            Assert.NotNull(post.EditedAt);
            Assert.False(post.Mine);

            await e.Social.BorrarPublicacionAsync(ana, id);
            await Falla(e.Perfiles.PostAsync(id, ana), 404);
            Assert.Empty((await e.Perfiles.MuroAsync(ana.ToString(), null, null, ana)).Items);
        }

        [Fact]
        public async Task MeGusta_EsIdempotenteYAvisaAlAutorUnaVez()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string id = await Publicar(e, ana, "Una gallina bonita");
            Assert.Equal(1, (await e.Social.PonerMeGustaAsync(beto, id, true)).Likes);
            Assert.Equal(1, (await e.Social.PonerMeGustaAsync(beto, id, true)).Likes);
            Assert.True((await e.Perfiles.PostAsync(id, beto)).Liked);
            Assert.Equal(1, (await e.Perfiles.QuienDioMeGustaAsync(id)).Total);

            await e.Notificaciones.ProcesarSalidaAsync();
            var avisos = (await e.Avisos.ListarAsync(ana, null, null, null, null)).Where(a => a.Type == "profile.post.liked").ToList();
            Assert.Single(avisos);
            Assert.Contains("Beto le dio me gusta a tu publicación", avisos[0].Title);
            Assert.Equal($"{ana}#{id}", avisos[0].Link.Id);

            Assert.Equal(0, (await e.Social.PonerMeGustaAsync(beto, id, false)).Likes);
            Assert.Equal(0, (await e.Social.PonerMeGustaAsync(beto, id, false)).Likes);
            // Darle me gusta a lo propio no avisa.
            await e.Social.PonerMeGustaAsync(ana, id, true);
            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Single((await e.Avisos.ListarAsync(ana, null, null, null, null)).Where(a => a.Type == "profile.post.liked"));
        }

        [Fact]
        public async Task Comentarios_TienenDosNivelesYSeBorranConReglas()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto"), carla = await e.Persona("Carla");
            string post = await Publicar(e, ana, "Hablemos de razas");
            string raiz = await e.Social.ComentarAsync(beto, post, new ComentarioNuevoDto { Text = "¿Cuál recomiendas?" });
            string respuesta = await e.Social.ComentarAsync(ana, post, new ComentarioNuevoDto { Text = "La Brahma", ParentId = raiz });
            // Responder a una respuesta se une al comentario principal y recuerda a quién se contestó.
            string anidada = await e.Social.ComentarAsync(carla, post, new ComentarioNuevoDto { Text = "Yo prefiero la criolla", ParentId = respuesta });

            var pagina = await e.Perfiles.ComentariosAsync(post, null, null, carla);
            Assert.Single(pagina.Items);
            Assert.Equal(2, pagina.Items[0].RepliesTotal);
            var respuestas = await e.Perfiles.RespuestasAsync(raiz, carla);
            Assert.Equal(raiz, respuestas.Single(r => r.Id == anidada).ParentId);
            Assert.Equal("Ana", respuestas.Single(r => r.Id == anidada).ReplyTo!.Alias);
            Assert.Equal(3, (await e.Perfiles.PostAsync(post, carla)).CommentCount);

            await e.Notificaciones.ProcesarSalidaAsync();
            Assert.Contains(await e.Avisos.ListarAsync(ana, null, null, null, null), a => a.Type == "profile.post.commented" && a.Body == "¿Cuál recomiendas?");
            Assert.Contains(await e.Avisos.ListarAsync(beto, null, null, null, null), a => a.Type == "profile.comment.replied" && a.Body == "La Brahma");

            await Falla(e.Social.EditarComentarioAsync(ana, raiz, "no es tuyo"), 403);
            await Falla(e.Social.BorrarComentarioAsync(carla, raiz), 403);
            // La dueña de la publicación puede borrar el de otra persona; con respuestas queda un hueco.
            await e.Social.BorrarComentarioAsync(ana, raiz);
            var conHueco = await e.Perfiles.ComentariosAsync(post, null, null, carla);
            Assert.True(conHueco.Items[0].Deleted);
            Assert.Equal(string.Empty, conHueco.Items[0].Text);
            Assert.Equal(2, conHueco.Items[0].RepliesTotal);
            await e.Social.BorrarComentarioAsync(carla, anidada);
            await e.Social.BorrarComentarioAsync(ana, respuesta);
            Assert.Equal(0, (await e.Perfiles.PostAsync(post, ana)).CommentCount);
            await Falla(e.Social.ComentarAsync(beto, post, new ComentarioNuevoDto { Text = "mi cel 3001234567" }), 400);
        }

        [Fact]
        public async Task Compartir_GuardaSoloLaReferenciaYNoPermiteRepetirNiCompartirLoPropio()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            string original = await Publicar(e, ana, "Original");
            await Falla(e.Social.CompartirAsync(ana, original, null), 400);
            string copia = await e.Social.CompartirAsync(beto, original, "Miren esto");
            await Falla(e.Social.CompartirAsync(beto, original, null), 409);

            var post = await e.Perfiles.PostAsync(copia, beto);
            Assert.Equal("Miren esto", post.Text);
            Assert.True(post.Shared!.Available);
            Assert.Equal("Ana", post.Shared.AuthorAlias);
            Assert.Equal("Original", post.Shared.Text);

            await e.Social.BorrarPublicacionAsync(ana, original);
            var sinOriginal = await e.Perfiles.PostAsync(copia, beto);
            Assert.False(sinOriginal.Shared!.Available);
            Assert.Null(sinOriginal.Shared.Text);
        }

        [Fact]
        public async Task Reels_UnaPaginaNuncaRepiteYElModoCronologicoFiltra()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto"), carla = await e.Persona("Carla");
            for (int i = 0; i < 5; i++) { await Publicar(e, ana, $"Gallos criollos número {i} #gallos"); e.Base.Reloj.Avanzar(TimeSpan.FromMinutes(1)); }
            await Publicar(e, beto, "Mis patos nadando #patos");
            e.Base.Reloj.Avanzar(TimeSpan.FromMinutes(1));
            string ave = await e.Ave(beto);
            await e.Publicar(beto, ave);

            var cronologico = await e.Perfiles.ReelsAsync(new FiltroReels { Q = "patos" }, carla);
            Assert.Single(cronologico.Items, i => i.Kind == "post");
            Assert.DoesNotContain(cronologico.Items, i => i.Kind == "advertisement");
            Assert.Equal(5, (await e.Perfiles.ReelsAsync(new FiltroReels { Etiqueta = "gallos" }, carla)).Items.Count);

            // Para ti: dos páginas seguidas con lo ya visto no se repiten y mezclan avisos del mercado.
            var primera = await e.Perfiles.ReelsAsync(new FiltroReels { Limite = 4, Semilla = "abc" }, carla);
            Assert.Equal(4, primera.Items.Count);
            Assert.Equal("more", primera.NextBefore);
            var vistos = primera.Items.Select(i => (i.Kind == "post" ? "p:" : "a:") + i.Id[..8]).ToList();
            var segunda = await e.Perfiles.ReelsAsync(new FiltroReels { Limite = 4, Semilla = "abc", Vistos = vistos }, carla);
            Assert.Empty(primera.Items.Select(i => i.Id).Intersect(segunda.Items.Select(i => i.Id)));
            Assert.Equal(7, primera.Items.Count + segunda.Items.Count);
            Assert.Contains(primera.Items.Concat(segunda.Items), i => i.Kind == "advertisement" && i.Listing!.Snapshot.Name == "Luna");
            Assert.Null(segunda.NextBefore);
        }

        [Fact]
        public async Task Senales_AfinanElOrdenSegunLoQueSeMira()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto"), carla = await e.Persona("Carla");
            string patos = await Publicar(e, ana, "Patos en el estanque #patos");
            string gallos = await Publicar(e, beto, "Gallos de pelea #gallos");
            Assert.Equal(0, await e.Social.RegistrarSenalesAsync(carla, [new SenalDto { Key = "p:zzzzzzzz", Type = "view", Ms = 9000 }]));
            for (int i = 0; i < 3; i++)
                Assert.Equal(1, await e.Social.RegistrarSenalesAsync(carla, [new SenalDto { Key = $"p:{patos[..8]}", Type = "view", Ms = 9000 }]));

            var feed = await e.Perfiles.ReelsAsync(new FiltroReels { Limite = 2, Semilla = "x" }, carla);
            Assert.Equal(patos, feed.Items[0].Id);
            Assert.Equal(gallos, feed.Items[1].Id);
        }

        [Fact]
        public async Task Perfil_NombreUnicoRedesUbicacionYFoto()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            await Falla(e.Social.ActualizarPerfilAsync(beto, new PerfilCambioDto { DisplayName = "ana" }), 409);
            await Falla(e.Social.ActualizarPerfilAsync(beto, new PerfilCambioDto { DisplayName = "http://mal" }), 400);
            await Falla(e.Social.ActualizarPerfilAsync(beto, new PerfilCambioDto { ContactPhone = "abc" }), 400);
            await Falla(e.Social.ActualizarPerfilAsync(beto, new PerfilCambioDto { TimeZone = "Marte/Olympus" }), 400);
            await e.Social.ActualizarPerfilAsync(beto, new PerfilCambioDto { DisplayName = "Beto Criador", ContactPhone = "+57 300 111 2233" });
            var mio = await e.Perfiles.MiPerfilAsync(beto);
            Assert.Equal("Beto Criador", mio.DisplayName);
            Assert.Equal("+57 300 111 2233", mio.ContactPhone);

            var redes = await e.Social.GuardarRedesAsync(beto, new RedesDto { Tiktok = "@beto.gallos", Instagram = "https://instagram.com/beto_gallos/?igsh=abc", Youtube = "youtube.com/@betogallos" });
            Assert.Equal("https://www.tiktok.com/@beto.gallos", redes.Tiktok);
            Assert.Equal("https://www.instagram.com/beto_gallos/", redes.Instagram);
            Assert.Equal("https://www.youtube.com/@betogallos", redes.Youtube);
            await Falla(e.Social.GuardarRedesAsync(beto, new RedesDto { Instagram = "https://instagram.com/p/ABCDE12345/" }), 400);
            Assert.Null((await e.Social.GuardarRedesAsync(beto, new RedesDto { Tiktok = "" })).Tiktok);

            await e.Social.GuardarUbicacionAsync(beto, new UbicacionDto { City = "Rionegro", Region = "Antioquia" });
            Assert.Equal("Rionegro", (await e.Perfiles.MiPerfilAsync(beto)).Location!.City);
            await e.Social.GuardarUbicacionAsync(beto, new UbicacionDto());
            Assert.Null((await e.Perfiles.MiPerfilAsync(beto)).Location);

            await Falla(e.Social.SubirMedioAsync(beto, [1, 2, 3, 4], "image/png", "avatar", null, null), 400);
            await Falla(e.Social.SubirMedioAsync(beto, Png, "image/jpeg", "avatar", null, null), 400);
            await Falla(e.Social.SubirMedioAsync(beto, Png, "image/png", "otro", null, null), 400);
            var foto = await e.Social.SubirMedioAsync(beto, Png, "image/png", "avatar", 1, 1);
            Assert.Equal(foto.Url, (await e.Perfiles.MiPerfilAsync(beto)).AvatarUrl);
            Assert.Equal("image/png", (await e.Perfiles.MedioAsync(foto.Id))!.Value.Mime);
            Assert.Null(await e.Perfiles.MedioAsync("no-existe"));

            // Cambiar la foto borra la anterior.
            var nueva = await e.Social.SubirMedioAsync(beto, Png, "image/png", "avatar", 1, 1);
            Assert.Null(await e.Perfiles.MedioAsync(foto.Id));
            Assert.NotNull(await e.Perfiles.MedioAsync(nueva.Id));
        }

        [Fact]
        public async Task PublicarConFotoYBorrarLimpiaLosArchivos()
        {
            using var e = new EntornoMercado();
            Guid ana = await e.Persona("Ana"), beto = await e.Persona("Beto");
            var foto = await e.Social.SubirMedioAsync(ana, Png, "image/png", "post", 1, 1);
            await Falla(e.Social.CrearPublicacionAsync(beto, new PublicacionPerfilNuevaDto { MediaIds = [foto.Id] }), 403);
            string id = await e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto { Text = "Con foto", MediaIds = [foto.Id] });
            Assert.Equal($"/api/media/{foto.Id}.webp", (await e.Perfiles.PostAsync(id, beto)).Media.Single().Url);
            await Falla(e.Social.CrearPublicacionAsync(ana, new PublicacionPerfilNuevaDto { MediaIds = [foto.Id] }), 409);
            await e.Social.BorrarPublicacionAsync(ana, id);
            Assert.Null(await e.Perfiles.MedioAsync(foto.Id));
        }
    }
}
