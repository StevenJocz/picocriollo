using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.DTOs.SocialD;
using PicoCriollo.Domain.Entities.UsuarioE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Queries
{
    public interface ISocialQueries
    {
        Task<List<PerfilDestacadoDto>> DestacadosAsync(string categoria = "todos");
        Task<MiPerfilDto> MiPerfilAsync(Guid usuario);
        Task<PerfilPublicoDto> PerfilAsync(string id, Guid? quienMira);
        Task<PaginaPostsDto> MuroAsync(string autorId, string? antes, int? limite, Guid? quienMira);
        Task<PostDto> PostAsync(string id, Guid? quienMira);
        Task<PaginaComentariosDto> ComentariosAsync(string postId, string? despues, int? limite, Guid? quienMira);
        Task<List<ComentarioDto>> RespuestasAsync(string comentarioId, Guid? quienMira);
        Task<QuienDioMeGustaDto> QuienDioMeGustaAsync(string postId);
        Task<PaginaReelsDto> ReelsAsync(FiltroReels filtro, Guid quienMira);
        Task<(string Mime, byte[] Bytes)?> MedioAsync(string id);
    }

    public class FiltroReels
    {
        public string? Antes { get; set; }
        public int? Limite { get; set; }
        public string? Etiqueta { get; set; }
        public string? Q { get; set; }
        /// <summary>Claves cortas de lo ya visto (modo «Para ti»).</summary>
        public List<string> Vistos { get; set; } = [];
        /// <summary>Cambia en cada visita: mueve un poco el orden para que no sea siempre igual.</summary>
        public string? Semilla { get; set; }
    }

    public class SocialQueries : ISocialQueries
    {
        private const int PaginaPorDefecto = 10, PaginaMaxima = 30, ComentariosPagina = 10, RespuestasVistaPrevia = 2, MeGustaPagina = 50;

        private readonly AlmacenMercado _a;
        private readonly IMercadoQueries _mercado;

        public SocialQueries(AlmacenMercado almacen, IMercadoQueries mercado)
        {
            _a = almacen;
            _mercado = mercado;
        }

        // ---------- datos del perfil de una cuenta ----------

        public async Task<List<PerfilDestacadoDto>> DestacadosAsync(string categoria = "todos")
        {
            if (categoria is not ("todos" or "ventas" or "publicaciones" or "seguidores"))
                throw ReglaNegocioException.Validacion("Categoría no válida.");
            var usuarios = (await _a.Contexto.UsuarioEs.AsNoTracking().ToListAsync())
                .Where(u => !u.Suspendido).ToDictionary(u => u.IdUsuario.ToString());
            var salida = new List<PerfilDestacadoDto>();
            void Agregar(string tipo, IEnumerable<string> ids)
            {
                salida.AddRange(ids.Where(usuarios.ContainsKey).GroupBy(id => id)
                    .OrderByDescending(g => g.Count()).ThenBy(g => g.Key, StringComparer.Ordinal).Take(3)
                    .Select(g => new PerfilDestacadoDto { Id = g.Key, Alias = ReglasMercado.Alias(g.Key, usuarios[g.Key].NombreUsuario),
                        AvatarUrl = UrlAvatar(usuarios[g.Key]), Category = tipo, Count = g.Count() }));
            }
            if (categoria is "todos" or "ventas")
                Agregar("ventas", (await _a.Operaciones.ListarAsync("status", EstadoOperacion.Completada)).Select(o => o.SellerId));
            if (categoria is "todos" or "publicaciones")
                Agregar("publicaciones", (await _a.PublicacionesPerfil.ListarAsync()).Where(p => p.HiddenAt is null && p.SharedFromId is null).Select(p => p.AuthorId));
            if (categoria is "todos" or "seguidores")
                Agregar("seguidores", (await _a.Seguimientos.ListarAsync()).Where(f => usuarios.ContainsKey(f.FollowerId)).Select(f => f.FollowingId));
            return salida;
        }

        private static string? Texto(UsuarioE u, string campo)
        {
            try
            {
                using JsonDocument d = JsonDocument.Parse(string.IsNullOrWhiteSpace(u.Perfil) ? "{}" : u.Perfil);
                return d.RootElement.TryGetProperty(campo, out JsonElement e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;
            }
            catch (JsonException) { return null; }
        }

        private static LugarDto? Lugar(UsuarioE u)
        {
            try
            {
                using JsonDocument d = JsonDocument.Parse(string.IsNullOrWhiteSpace(u.Perfil) ? "{}" : u.Perfil);
                if (!d.RootElement.TryGetProperty("location", out JsonElement l) || l.ValueKind != JsonValueKind.Object) return null;
                string? ciudad = l.TryGetProperty("city", out JsonElement c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
                string? region = l.TryGetProperty("region", out JsonElement r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null;
                return string.IsNullOrEmpty(ciudad) ? null : new LugarDto { City = ciudad, Region = region };
            }
            catch (JsonException) { return null; }
        }

        private static RedesVistaDto Redes(UsuarioE u)
        {
            try
            {
                using JsonDocument d = JsonDocument.Parse(string.IsNullOrWhiteSpace(u.Perfil) ? "{}" : u.Perfil);
                if (!d.RootElement.TryGetProperty("social", out JsonElement s) || s.ValueKind != JsonValueKind.Object) return new RedesVistaDto();
                string? Red(string k) => s.TryGetProperty(k, out JsonElement e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;
                return new RedesVistaDto { Tiktok = Red("tiktok"), Instagram = Red("instagram"), Youtube = Red("youtube") };
            }
            catch (JsonException) { return new RedesVistaDto(); }
        }

        private static string? UrlAvatar(UsuarioE? u) => u is not null && Texto(u, "avatarId") is { Length: > 0 } id ? $"/api/media/{id}" : null;

        public async Task<MiPerfilDto> MiPerfilAsync(Guid usuario)
        {
            UsuarioE u = await _a.UsuarioAsync(usuario.ToString()) ?? throw ReglaNegocioException.NoEncontrado("Cuenta no encontrada.");
            return new MiPerfilDto
            {
                Id = usuario.ToString(), Email = u.Correo, DisplayName = u.NombreUsuario ?? string.Empty, AvatarUrl = UrlAvatar(u), TimeZone = Texto(u, "timeZone") ?? ReglasNotificaciones.ZonaPorDefecto,
                Role = u.Rol, ContactPhone = Texto(u, "contactPhone") ?? string.Empty, Location = Lugar(u), Social = Redes(u),
            };
        }

        private async Task<(int Seguidores, int Siguiendo, int Publicaciones, bool Sigue)> EstadisticasAsync(string perfilId, string? quienMira)
        {
            int seguidores = (await _a.Seguimientos.ListarAsync("followingId", perfilId)).Count;
            int siguiendo = (await _a.Seguimientos.ListarAsync("followerId", perfilId)).Count;
            int publicaciones = (await _a.PublicacionesPerfil.ListarAsync("authorId", perfilId)).Count(p => p.HiddenAt is null);
            bool sigue = quienMira is not null && quienMira != perfilId && await _a.Seguimientos.ObtenerAsync($"{quienMira}:{perfilId}") is not null;
            return (seguidores, siguiendo, publicaciones, sigue);
        }

        public async Task<PerfilPublicoDto> PerfilAsync(string id, Guid? quienMira)
        {
            UsuarioE u = await _a.UsuarioAsync(id) ?? throw ReglaNegocioException.NoEncontrado("Criador no encontrado.");
            var (seguidores, siguiendo, publicaciones, sigue) = await EstadisticasAsync(id, quienMira?.ToString());
            int avisos = (await _a.Publicaciones.ListarAsync("sellerId", id)).Count(p => p.Status == EstadoPublicacion.Publicada);
            return new PerfilPublicoDto
            {
                Id = id, Alias = ReglasMercado.Alias(id, u.NombreUsuario), AvatarUrl = UrlAvatar(u), Location = Lugar(u), Social = Redes(u),
                Followers = seguidores, Following = siguiendo, Publications = publicaciones, IsFollowing = sigue, IsMe = quienMira?.ToString() == id,
                Reputation = await _mercado.ReputacionAsync(id), Listings = avisos,
            };
        }

        // ---------- publicaciones ----------

        private async Task<List<MedioDto>> MediosAsync(IEnumerable<string> ids)
        {
            var salida = new List<MedioDto>();
            foreach (string id in ids)
            {
                ArchivoMedia? a = await _a.Archivos.ObtenerAsync(id);
                if (a is null) continue;
                ArchivoMedia? miniatura = (await _a.Archivos.ListarAsync("thumbOf", id)).FirstOrDefault();
                string extension = a.Kind == "video" ? ".mp4" : ".webp";
                salida.Add(new MedioDto { Id = id, Kind = a.Kind, Mime = a.Mime, Size = a.Size, Width = a.Width, Height = a.Height, Url = $"/api/media/{id}{extension}", ThumbUrl = miniatura is null ? null : $"/api/media/{miniatura.Id}.webp" });
            }
            return salida;
        }

        /// <summary>Datos alterados (el id no corresponde a su enlace): no se muestra.</summary>
        private static VideoDto? Video(VideoEnlazado? e)
        {
            VideoLink? link = e is null ? null : ReglasSociales.ReconocerVideo(e.Url);
            if (e is null || link is null || link.Provider != e.Provider || link.Id != e.Id) return null;
            return new VideoDto { Provider = link.Provider, Label = ReglasSociales.EtiquetasDeProveedor[link.Provider], Id = link.Id, Kind = link.Kind, Url = link.Url, EmbedUrl = ReglasSociales.UrlDeReproductor(link.Provider, link.Id, link.Kind), Aspect = link.Aspect };
        }

        private async Task<CompartidoDto?> CompartidoAsync(PublicacionPerfil post)
        {
            if (post.SharedFromId is null) return null;
            PublicacionPerfil? original = await _a.PublicacionesPerfil.ObtenerAsync(post.SharedFromId);
            UsuarioE? autor = original is null || original.HiddenAt is not null ? null : await _a.UsuarioAsync(original.AuthorId);
            if (original is null || autor is null || autor.Suspendido) return new CompartidoDto { Id = post.SharedFromId, Available = false };
            return new CompartidoDto
            {
                Id = original.Id, Available = true, AuthorId = original.AuthorId, AuthorAlias = ReglasMercado.Alias(original.AuthorId, autor.NombreUsuario), AuthorAvatarUrl = UrlAvatar(autor),
                Text = original.Text, CreatedAt = original.CreatedAt, Embed = Video(original.Embed), Media = await MediosAsync(original.MediaIds),
            };
        }

        private async Task<PostDto> VistaAsync(PublicacionPerfil post, string? quienMira)
        {
            UsuarioE? autor = await _a.UsuarioAsync(post.AuthorId);
            var (seguidores, _, _, sigue) = await EstadisticasAsync(post.AuthorId, quienMira);
            var gustos = await _a.MeGustas.ListarAsync("postId", post.Id);
            var comentarios = await _a.Comentarios.ListarAsync("postId", post.Id);
            return new PostDto
            {
                Id = post.Id, AuthorId = post.AuthorId, AuthorAlias = ReglasMercado.Alias(post.AuthorId, autor?.NombreUsuario), AuthorAvatarUrl = UrlAvatar(autor), AuthorFollowers = seguidores, FollowedByViewer = sigue,
                Text = post.Text, CreatedAt = post.CreatedAt, EditedAt = post.EditedAt, Mine = quienMira == post.AuthorId, Hidden = post.HiddenAt is not null && quienMira == post.AuthorId ? true : null,
                Media = await MediosAsync(post.MediaIds), Embed = Video(post.Embed), Shared = await CompartidoAsync(post),
                Likes = gustos.Count, Liked = quienMira is not null && gustos.Any(g => g.UserId == quienMira), CommentCount = comentarios.Count(c => c.DeletedAt is null && c.HiddenAt is null),
            };
        }

        private static (string? En, string? Id) Cursor(string? texto)
        {
            string[] partes = (texto ?? string.Empty).Split('|');
            return (string.IsNullOrEmpty(partes[0]) ? null : partes[0], partes.Length > 1 ? partes[1] : null);
        }

        /// <summary>Muro público de una persona, de la más nueva a la más vieja. <c>antes</c> es el cursor opaco que devolvió <c>nextBefore</c>.</summary>
        public async Task<PaginaPostsDto> MuroAsync(string autorId, string? antes, int? limite, Guid? quienMira)
        {
            if (await _a.UsuarioAsync(autorId) is null) throw ReglaNegocioException.NoEncontrado("Usuario no encontrado.");
            int tope = Math.Clamp(limite ?? PaginaPorDefecto, 1, PaginaMaxima);
            var (cuando, idCursor) = Cursor(antes);
            List<PublicacionPerfil> filas = (await _a.PublicacionesPerfil.ListarAsync("authorId", autorId))
                .Where(p => p.HiddenAt is null || quienMira?.ToString() == autorId)
                .Where(p => cuando is null || string.CompareOrdinal(p.CreatedAt, cuando) < 0 || (p.CreatedAt == cuando && string.CompareOrdinal(p.Id, idCursor ?? "") < 0))
                .OrderByDescending(p => p.CreatedAt, StringComparer.Ordinal).ThenByDescending(p => p.Id, StringComparer.Ordinal).ToList();
            var pagina = filas.Take(tope).ToList();
            var items = new List<PostDto>();
            foreach (PublicacionPerfil p in pagina) items.Add(await VistaAsync(p, quienMira?.ToString()));
            return new PaginaPostsDto { Items = items, NextBefore = filas.Count > tope && pagina.Count > 0 ? $"{pagina[^1].CreatedAt}|{pagina[^1].Id}" : null };
        }

        public async Task<PostDto> PostAsync(string id, Guid? quienMira)
        {
            PublicacionPerfil? p = await _a.PublicacionesPerfil.ObtenerAsync(id);
            if (p is null || (p.HiddenAt is not null && quienMira?.ToString() != p.AuthorId)) throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
            return await VistaAsync(p, quienMira?.ToString());
        }

        // ---------- me gusta y comentarios ----------

        private async Task<PublicacionPerfil> VisibleAsync(string id) =>
            await _a.PublicacionesPerfil.ObtenerAsync(id) is { HiddenAt: null } p ? p : throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");

        public async Task<QuienDioMeGustaDto> QuienDioMeGustaAsync(string postId)
        {
            await VisibleAsync(postId);
            var filas = (await _a.MeGustas.ListarAsync("postId", postId)).OrderByDescending(g => g.CreatedAt, StringComparer.Ordinal).ThenByDescending(g => g.Id, StringComparer.Ordinal).ToList();
            var personas = new List<PersonaDto>();
            foreach (MeGusta g in filas.Take(MeGustaPagina))
                if (await _a.UsuarioAsync(g.UserId) is { } u) personas.Add(new PersonaDto { Id = g.UserId, Alias = ReglasMercado.Alias(g.UserId, u.NombreUsuario), AvatarUrl = UrlAvatar(u) });
            return new QuienDioMeGustaDto { Total = filas.Count, Users = personas };
        }

        private async Task<ComentarioDto> VistaAsync(ComentarioPerfil c, PublicacionPerfil post, string? quienMira)
        {
            UsuarioE? autor = await _a.UsuarioAsync(c.AuthorId);
            bool mio = quienMira == c.AuthorId;
            ResponderADto? responde = null;
            if (c.ReplyToUserId is not null) responde = new ResponderADto { Id = c.ReplyToUserId, Alias = ReglasMercado.Alias(c.ReplyToUserId, (await _a.UsuarioAsync(c.ReplyToUserId))?.NombreUsuario) };
            return new ComentarioDto
            {
                Id = c.Id, PostId = c.PostId, ParentId = c.ParentId, AuthorId = c.AuthorId, AuthorAlias = ReglasMercado.Alias(c.AuthorId, autor?.NombreUsuario), AuthorAvatarUrl = UrlAvatar(autor), ReplyTo = responde,
                Text = c.DeletedAt is not null ? string.Empty : c.Text, CreatedAt = c.CreatedAt, EditedAt = c.EditedAt, Mine = mio,
                CanDelete = quienMira is not null && (mio || quienMira == post.AuthorId) && c.DeletedAt is null,
                Hidden = c.HiddenAt is not null && mio ? true : null, Deleted = c.DeletedAt is not null ? true : null,
            };
        }

        private static bool Muestra(ComentarioPerfil c, string? quienMira) => c.DeletedAt is null && (c.HiddenAt is null || c.AuthorId == quienMira);
        private static int PorHora(ComentarioPerfil a, ComentarioPerfil b) { int r = string.CompareOrdinal(a.CreatedAt, b.CreatedAt); return r != 0 ? r : string.CompareOrdinal(a.Id, b.Id); }

        /// <summary>Comentarios principales, del más viejo al más nuevo, cada uno con una vista previa de sus respuestas.</summary>
        public async Task<PaginaComentariosDto> ComentariosAsync(string postId, string? despues, int? limite, Guid? quienMira)
        {
            string? yo = quienMira?.ToString();
            PublicacionPerfil post = await VisibleAsync(postId);
            int tope = Math.Clamp(limite ?? ComentariosPagina, 1, PaginaMaxima);
            var (cuando, idCursor) = Cursor(despues);
            List<ComentarioPerfil> todos = await _a.Comentarios.ListarAsync("postId", postId);
            List<ComentarioPerfil> Respuestas(string id) { var r = todos.Where(x => x.ParentId == id && Muestra(x, yo)).ToList(); r.Sort(PorHora); return r; }
            // Un comentario principal borrado solo se muestra si aún tiene respuestas visibles (para no perder el hilo).
            var principales = todos.Where(c => c.ParentId is null && (c.DeletedAt is not null ? Respuestas(c.Id).Count > 0 : Muestra(c, yo))).ToList();
            principales.Sort(PorHora);
            var elegibles = principales.Where(c => cuando is null || string.CompareOrdinal(c.CreatedAt, cuando) > 0 || (c.CreatedAt == cuando && string.CompareOrdinal(c.Id, idCursor ?? "") > 0)).ToList();
            var pagina = elegibles.Take(tope).ToList();
            var items = new List<ComentarioDto>();
            foreach (ComentarioPerfil c in pagina)
            {
                var respuestas = Respuestas(c.Id);
                ComentarioDto vista = await VistaAsync(c, post, yo);
                vista.RepliesTotal = respuestas.Count;
                vista.Replies = [];
                foreach (ComentarioPerfil r in respuestas.Take(RespuestasVistaPrevia)) vista.Replies.Add(await VistaAsync(r, post, yo));
                items.Add(vista);
            }
            return new PaginaComentariosDto { Items = items, Total = principales.Count, NextAfter = elegibles.Count > tope && pagina.Count > 0 ? $"{pagina[^1].CreatedAt}|{pagina[^1].Id}" : null };
        }

        public async Task<List<ComentarioDto>> RespuestasAsync(string comentarioId, Guid? quienMira)
        {
            string? yo = quienMira?.ToString();
            ComentarioPerfil raiz = await _a.Comentarios.ObtenerAsync(comentarioId) is { ParentId: null } c ? c : throw ReglaNegocioException.NoEncontrado("Comentario no encontrado.");
            PublicacionPerfil post = await VisibleAsync(raiz.PostId);
            var respuestas = (await _a.Comentarios.ListarAsync("postId", raiz.PostId)).Where(x => x.ParentId == comentarioId && Muestra(x, yo)).ToList();
            respuestas.Sort(PorHora);
            var salida = new List<ComentarioDto>();
            foreach (ComentarioPerfil r in respuestas) salida.Add(await VistaAsync(r, post, yo));
            return salida;
        }

        // ---------- reels ----------

        private static int Cercania(LugarDto? yo, LugarDto? otro)
        {
            if (yo is null) return 0;
            if (otro is null) return 2;
            if (ReglasSociales.Plegar(otro.City) == ReglasSociales.Plegar(yo.City)) return 0;
            return yo.Region is { Length: > 0 } && otro.Region is { Length: > 0 } && ReglasSociales.Plegar(yo.Region) == ReglasSociales.Plegar(otro.Region) ? 1 : 2;
        }

        private record Fila(string Tipo, string Id, string En, string Clave, int Cubeta, PublicacionPerfil? Post, Publicacion? Aviso);

        /// <summary>
        /// Reels de la comunidad mezclados con avisos del mercado. Sin búsqueda ni etiqueta es el orden «Para ti» (reciente, tendencia, cercano, seguidos
        /// y gustos aprendidos, con variedad), que se pide con <c>vistos</c> y <c>semilla</c> y nunca repite; con búsqueda o etiqueta, lo más nuevo
        /// primero (con lo cercano por delante si la persona dijo dónde está).
        /// </summary>
        public async Task<PaginaReelsDto> ReelsAsync(FiltroReels f, Guid quienMira)
        {
            string yo = quienMira.ToString();
            int tope = Math.Clamp(f.Limite ?? PaginaPorDefecto, 1, PaginaMaxima);
            string etiqueta = string.IsNullOrWhiteSpace(f.Etiqueta) ? "" : ReglasSociales.Plegar((f.Etiqueta.TrimStart('#').Length > 50 ? f.Etiqueta.TrimStart('#')[..50] : f.Etiqueta.TrimStart('#')));
            List<string> terminos = ReglasSociales.Terminos(f.Q ?? string.Empty);
            bool paraTi = etiqueta.Length == 0 && terminos.Count == 0;
            DateTime ahora = _a.Ahora;

            var autores = new Dictionary<string, UsuarioE>();
            foreach (UsuarioE u in await _a.Contexto.UsuarioEs.AsNoTracking().ToListAsync()) if (!u.Suspendido) autores[u.IdUsuario.ToString()] = u;
            LugarDto? aqui = autores.TryGetValue(yo, out UsuarioE? mio) ? Lugar(mio) : (await _a.UsuarioAsync(yo)) is { } m ? Lugar(m) : null;
            bool conUbicacion = aqui is not null;

            string[] cursor = (f.Antes ?? "").Split('|');
            int cubetaAntes = cursor.Length >= 3 ? int.TryParse(cursor[0], out int cb) ? cb : 0 : 0;
            string? cuandoAntes = cursor.Length >= 3 ? cursor[1] : string.IsNullOrEmpty(cursor[0]) ? null : cursor[0];
            string claveAntes = cursor.Length >= 3 ? cursor[2] : cursor.Length > 1 ? cursor[1] : "";

            var todos = await _a.PublicacionesPerfil.ListarAsync();
            var porId = todos.ToDictionary(p => p.Id);
            bool OriginalVisible(PublicacionPerfil p) => p.SharedFromId is null || (porId.TryGetValue(p.SharedFromId, out PublicacionPerfil? o) && o.HiddenAt is null && autores.ContainsKey(o.AuthorId));
            bool TieneEtiqueta(string texto) => System.Text.RegularExpressions.Regex.Matches(texto, @"#([\p{L}\p{N}_]+)").Any(x => ReglasSociales.Plegar(x.Groups[1].Value) == etiqueta);

            var posts = todos.Where(p => p.HiddenAt is null && autores.ContainsKey(p.AuthorId) && OriginalVisible(p) && (etiqueta.Length == 0 || TieneEtiqueta(p.Text))
                    && ReglasSociales.Coincide($"{p.Text} {autores[p.AuthorId].NombreUsuario}{(p.Embed is not null ? " video YouTube" : "")}", terminos))
                .Select(p => new Fila("post", p.Id, p.CreatedAt, $"p:{p.Id}", Cercania(aqui, Lugar(autores[p.AuthorId])), p, null)).ToList();
            var avisos = etiqueta.Length > 0 ? [] : (await _a.Publicaciones.ListarAsync("status", EstadoPublicacion.Publicada))
                .Where(l => autores.ContainsKey(l.SellerId) && l.PublishedAt is not null && ReglasSociales.Coincide(TextoDeAviso(l, autores[l.SellerId].NombreUsuario), terminos))
                .Select(l => new Fila("advertisement", l.Id, l.PublishedAt!, $"a:{l.Id}", Cercania(aqui, Lugar(autores[l.SellerId])), null, l)).ToList();
            var universo = posts.Concat(avisos).Select(r => conUbicacion ? r : r with { Cubeta = 0 }).ToList();
            if (paraTi)
                universo = universo.GroupBy(r => r.Post is { } p ? $"p:{p.SharedFromId ?? p.Id}" : r.Clave)
                    .Select(g => g.OrderBy(r => r.Post?.SharedFromId is not null).ThenBy(r => r.Clave).First()).ToList();

            int Orden(Fila a, (int Cubeta, string En, string Clave) b)
            {
                int c = a.Cubeta.CompareTo(b.Cubeta); if (c != 0) return c;
                c = string.CompareOrdinal(b.En, a.En); if (c != 0) return c;
                return string.CompareOrdinal(b.Clave, a.Clave);
            }
            var filas = universo.Where(r => cuandoAntes is null || Orden(r, (conUbicacion ? cubetaAntes : 0, cuandoAntes, claveAntes)) > 0).ToList();
            filas.Sort((a, b) => Orden(a, (b.Cubeta, b.En, b.Clave)));
            var pagina = filas.Take(tope).ToList();
            bool hayMas = filas.Count > tope && pagina.Count > 0;
            string? siguiente = null;

            if (paraTi)
            {
                var medios = (await _a.Archivos.ListarAsync()).ToDictionary(a => a.Id);
                var likes = new Dictionary<string, int>(); var mios = new HashSet<string>();
                foreach (MeGusta g in await _a.MeGustas.ListarAsync()) { likes[g.PostId] = likes.GetValueOrDefault(g.PostId) + 1; if (g.UserId == yo) mios.Add(g.PostId); }
                var comentarios = new Dictionary<string, int>();
                foreach (ComentarioPerfil c in await _a.Comentarios.ListarAsync()) if (c.HiddenAt is null && c.DeletedAt is null) comentarios[c.PostId] = comentarios.GetValueOrDefault(c.PostId) + 1;
                var sigo = (await _a.Seguimientos.ListarAsync("followerId", yo)).Select(s => s.FollowingId).ToHashSet();
                var candidatos = universo.Select(r =>
                {
                    if (r.Post is { } p)
                    {
                        PublicacionPerfil? original = p.SharedFromId is null ? null : porId.GetValueOrDefault(p.SharedFromId);
                        string autor = original?.AuthorId ?? p.AuthorId;
                        return new CandidatoReel(r.Clave, r.En, autor, ReglasSociales.EtiquetasDePublicacion(p, medios, original), likes.GetValueOrDefault(p.Id), comentarios.GetValueOrDefault(p.Id), conUbicacion ? r.Cubeta : 0, sigo.Contains(autor) || sigo.Contains(p.AuthorId), mios.Contains(p.Id), false);
                    }
                    Publicacion l = r.Aviso!;
                    return new CandidatoReel(r.Clave, r.En, l.SellerId, ReglasSociales.EtiquetasDeAviso(l), 0, 0, conUbicacion ? r.Cubeta : 0, sigo.Contains(l.SellerId), false, true);
                }).ToList();
                var vistas = f.Vistos.Where(k => System.Text.RegularExpressions.Regex.IsMatch(k, @"^[pas]:[\w-]{1,8}$")).TakeLast(200).ToHashSet();
                var disponibles = candidatos.Where(c => !vistas.Contains(ReglasSociales.ClaveCorta(c.Key))).ToList();
                var recientes = f.Vistos.TakeLast(3).Select(k => candidatos.FirstOrDefault(c => ReglasSociales.ClaveCorta(c.Key) == k)).OfType<CandidatoReel>().ToList();
                InteresDeReels gustos = await _a.InteresesReels.ObtenerAsync(yo) ?? new InteresDeReels { Id = yo };
                var porClave = universo.ToDictionary(r => r.Clave);
                DateTime UltimaVista(CandidatoReel candidato)
                {
                    var post = porClave[candidato.Key].Post;
                    var original = post is null ? candidato.Key : $"p:{post.SharedFromId ?? post.Id}";
                    return gustos.Seen.TryGetValue(original, out var fecha) ? JsonMercado.Fecha(fecha) : DateTime.MinValue;
                }
                var corte = ahora.AddDays(-7);
                var nuevos = disponibles.Where(c => UltimaVista(c) <= corte).ToList();
                string semilla = new string((f.Semilla ?? "").Where(char.IsLetterOrDigit).Take(16).ToArray());
                var elegidos = ReglasSociales.Ordenar(nuevos, gustos, ahora, semilla, tope, new HashSet<string>(), recientes);
                if (elegidos.Count < tope)
                {
                    int faltan = tope - elegidos.Count;
                    var anteriores = disponibles.Where(c => UltimaVista(c) > corte)
                        .OrderBy(UltimaVista).ThenBy(c => c.Key, StringComparer.Ordinal).Take(faltan).ToList();
                    elegidos.AddRange(anteriores);
                }
                pagina = elegidos.Select(c => porClave[c.Key]).ToList();
                hayMas = disponibles.Count > elegidos.Count;
                siguiente = hayMas ? "more" : null;
            }
            else if (hayMas) siguiente = conUbicacion ? $"{pagina[^1].Cubeta}|{pagina[^1].En}|{pagina[^1].Clave}" : $"{pagina[^1].En}|{pagina[^1].Clave}";

            var listados = (await _mercado.VistasPublicasAsync(pagina.Where(r => r.Aviso is not null).Select(r => r.Aviso!).ToList())).ToDictionary(v => v.Id);
            var elementos = new List<ElementoReelDto>();
            foreach (Fila r in pagina)
            {
                if (r.Post is { } p) elementos.Add(new ElementoReelDto { Kind = "post", Id = r.Id, CreatedAt = r.En, Post = await VistaAsync(p, yo) });
                else if (listados.TryGetValue(r.Id, out PublicacionVistaDto? vista))
                {
                    var (seguidores, _, _, sigue) = await EstadisticasAsync(r.Aviso!.SellerId, yo);
                    elementos.Add(new ElementoReelDto { Kind = "advertisement", Id = r.Id, CreatedAt = r.En, Listing = vista, SellerAvatarUrl = UrlAvatar(autores[r.Aviso.SellerId]), SellerFollowers = seguidores, FollowedByViewer = sigue });
                }
            }
            return new PaginaReelsDto { Items = elementos, NextBefore = siguiente };
        }

        private static string TextoDeAviso(Publicacion l, string? vendedor)
        {
            FichaPublica s = l.Snapshot;
            var partes = new List<string?> { s.Title, s.Name, s.Breed, s.Species, s.Sex, s.Code, s.AgeLabel, s.Description, s.DeliveryZone, s.HealthNote, s.Breeder, l.Kind == TipoPublicacion.Subasta ? "subasta oferta puja" : l.Kind == TipoPublicacion.PrecioFijo ? "precio fijo venta" : "consultar", "mercado", vendedor };
            if (s.LotBirds is not null) foreach (AveDeLote a in s.LotBirds) { partes.Add(a.Name); partes.Add(a.Breed); partes.Add(a.Sex); }
            return string.Join(' ', partes.Where(p => !string.IsNullOrEmpty(p)));
        }

        // ---------- archivos ----------

        public async Task<(string Mime, byte[] Bytes)?> MedioAsync(string id)
        {
            var m = await _a.Contexto.MediaEs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (m is null || !System.Text.RegularExpressions.Regex.IsMatch(m.Mime, @"^(image/(png|jpeg|webp)|video/(mp4|webm|quicktime))$")) return null;
            return (m.Mime, m.Bytes);
        }
    }
}
