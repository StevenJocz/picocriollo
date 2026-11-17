using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.SocialD;
using PicoCriollo.Domain.Entities.MercadoE;
using PicoCriollo.Domain.Entities.UsuarioE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Commands
{
    public interface ISocialCommands
    {
        Task ActualizarPerfilAsync(Guid usuario, PerfilCambioDto dto);
        Task<RedesVistaDto> GuardarRedesAsync(Guid usuario, RedesDto dto);
        Task<LugarDto?> GuardarUbicacionAsync(Guid usuario, UbicacionDto dto);
        Task<SeguirResultadoDto> SeguirAsync(Guid usuario, string perfilId, bool seguir);
        Task<string> CrearPublicacionAsync(Guid usuario, PublicacionPerfilNuevaDto dto);
        Task EditarPublicacionAsync(Guid usuario, string id, string? texto);
        Task BorrarPublicacionAsync(Guid usuario, string id);
        Task<string> CompartirAsync(Guid usuario, string origenId, string? comentario);
        Task<MeGustaResultadoDto> PonerMeGustaAsync(Guid usuario, string postId, bool liked);
        Task<string> ComentarAsync(Guid usuario, string postId, ComentarioNuevoDto dto);
        Task EditarComentarioAsync(Guid usuario, string comentarioId, string? texto);
        Task BorrarComentarioAsync(Guid usuario, string comentarioId);
        Task<int> RegistrarSenalesAsync(Guid usuario, IReadOnlyList<SenalDto> senales);
        Task<MedioSubidoDto> SubirMedioAsync(Guid usuario, byte[] bytes, string mime, string uso, int? ancho, int? alto);
        Task<MedioSubidoDto> GuardarVideoAsync(Guid usuario, string trabajo, byte[] bytes, byte[] portada, int ancho, int alto, double segundos);
    }

    /// <summary>
    /// El perfil social: seguir, el muro (texto, fotos y un video de YouTube), compartir, me gusta, comentarios con hilos de dos niveles y
    /// los gustos que el feed «Para ti» aprende de lo que cada persona hace. Todo se valida aquí; los límites son los de la app Next.js.
    /// Pendiente: subir videos propios (compresión) y la comunidad de muestra.
    /// </summary>
    public class SocialCommands : ISocialCommands
    {
        public const long CupoPorPersona = 1024L * 1024 * 1024;
        private const int LimiteImagen = 12 * 1024 * 1024, LimiteAvatar = 3 * 1024 * 1024;

        private readonly AlmacenMercado _a;

        public SocialCommands(AlmacenMercado almacen) => _a = almacen;

        // ---------- perfil ----------

        private async Task<UsuarioE> CuentaAsync(Guid usuario) =>
            await _a.Contexto.UsuarioEs.FirstOrDefaultAsync(u => u.IdUsuario == usuario) ?? throw ReglaNegocioException.NoEncontrado("Cuenta no encontrada.");

        private static JsonObject PerfilDe(UsuarioE u) => JsonNode.Parse(string.IsNullOrWhiteSpace(u.Perfil) ? "{}" : u.Perfil) as JsonObject ?? new JsonObject();

        private static void Guardar(UsuarioE u, JsonObject perfil) => u.Perfil = perfil.ToJsonString(new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });

        public Task ActualizarPerfilAsync(Guid usuario, PerfilCambioDto dto) => _a.EjecutarAsync(async () =>
        {
            UsuarioE cuenta = await CuentaAsync(usuario);
            JsonObject perfil = PerfilDe(cuenta);
            if (!string.IsNullOrWhiteSpace(dto.DisplayName))
            {
                string nombre = ReglasUsuario.ValidarNombreUsuario(dto.DisplayName);
                string clave = ReglasUsuario.ClaveNombre(nombre);
                foreach (UsuarioE otra in await _a.Contexto.UsuarioEs.AsNoTracking().Where(u => u.IdUsuario != usuario).ToListAsync())
                    if (otra.NombreUsuario is { } existente && ReglasUsuario.ClaveNombre(existente) == clave)
                        throw ReglaNegocioException.Conflicto("Ese nombre de usuario ya está en uso. Elige otro.");
                perfil["displayName"] = nombre;
            }
            if (dto.ContactPhone is not null)
            {
                string telefono = dto.ContactPhone.Trim();
                if (telefono.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(telefono, @"^[+\d][\d\s().-]{6,28}$"))
                    throw ReglaNegocioException.Validacion("El teléfono solo admite números, espacios y los signos + ( ) - .");
                if (telefono.Length > 0) perfil["contactPhone"] = telefono; else perfil.Remove("contactPhone");
            }
            if (!string.IsNullOrWhiteSpace(dto.TimeZone))
            {
                if (!ReglasNotificaciones.ZonaValida(dto.TimeZone)) throw ReglaNegocioException.Validacion("Zona horaria no válida.");
                perfil["timeZone"] = dto.TimeZone;
            }
            Guardar(cuenta, perfil);
        });

        public Task<RedesVistaDto> GuardarRedesAsync(Guid usuario, RedesDto dto) => _a.EjecutarAsync(async () =>
        {
            await _a.AsegurarActivaAsync(usuario.ToString());
            var cambios = new Dictionary<string, string>();
            foreach (var (red, valor) in new[] { ("tiktok", dto.Tiktok), ("instagram", dto.Instagram), ("youtube", dto.Youtube) })
                if (valor is not null) cambios[red] = ReglasSociales.NormalizarRed(red, valor);
            UsuarioE cuenta = await CuentaAsync(usuario);
            JsonObject perfil = PerfilDe(cuenta);
            JsonObject redes = perfil["social"] as JsonObject ?? new JsonObject();
            foreach (var (red, enlace) in cambios)
            {
                if (enlace.Length > 0) redes[red] = enlace; else redes.Remove(red);
            }
            if (redes.Count > 0) perfil["social"] = redes; else perfil.Remove("social");
            Guardar(cuenta, perfil);
            return new RedesVistaDto { Tiktok = redes["tiktok"]?.GetValue<string>(), Instagram = redes["instagram"]?.GetValue<string>(), Youtube = redes["youtube"]?.GetValue<string>() };
        });

        public Task<LugarDto?> GuardarUbicacionAsync(Guid usuario, UbicacionDto dto) => _a.EjecutarAsync(async () =>
        {
            await _a.AsegurarActivaAsync(usuario.ToString());
            UsuarioE cuenta = await CuentaAsync(usuario);
            JsonObject perfil = PerfilDe(cuenta);
            var lugar = ReglasUsuario.NormalizarUbicacion(dto.City, dto.Region);
            if (lugar is null) { perfil.Remove("location"); Guardar(cuenta, perfil); return (LugarDto?)null; }
            perfil["location"] = lugar.Value.Departamento is null ? new JsonObject { ["city"] = lugar.Value.Ciudad } : new JsonObject { ["city"] = lugar.Value.Ciudad, ["region"] = lugar.Value.Departamento };
            Guardar(cuenta, perfil);
            return new LugarDto { City = lugar.Value.Ciudad, Region = lugar.Value.Departamento };
        });

        // ---------- seguir ----------

        public Task<SeguirResultadoDto> SeguirAsync(Guid usuario, string perfilId, bool seguir) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            await _a.AsegurarActivaAsync(yo);
            if (yo == perfilId) throw ReglaNegocioException.Validacion("No puedes seguir tu propia cuenta.");
            UsuarioE? perfil = await _a.UsuarioAsync(perfilId);
            if (perfil is null || perfil.Suspendido || perfil.EsDemo) throw ReglaNegocioException.NoEncontrado("Criador no encontrado.");
            await _a.LimitarUsoAsync(yo, "social.follow", 200, TimeSpan.FromHours(1), "acciones de seguimiento por hora");
            string id = $"{yo}:{perfilId}";
            Seguimiento? existente = await _a.Seguimientos.ObtenerAsync(id, true);
            if (seguir && existente is null)
            {
                _a.Seguimientos.Insertar(new Seguimiento { Id = id, FollowerId = yo, FollowingId = perfilId, CreatedAt = JsonMercado.Iso(_a.Ahora) });
                await AprenderAsync(yo, [new Senal([], perfilId, "follow")]);
                _a.Auditar(yo, "social.follow", "user", perfilId);
            }
            else if (!seguir && existente is not null)
            {
                _a.Seguimientos.Eliminar(existente);
                _a.Auditar(yo, "social.follow", "user", perfilId, new { unfollow = true });
            }
            return new SeguirResultadoDto
            {
                Following = seguir,
                Followers = (await _a.Seguimientos.ListarAsync("followingId", perfilId)).Count,
                FollowingCount = (await _a.Seguimientos.ListarAsync("followerId", yo)).Count,
            };
        });

        // ---------- publicaciones del perfil ----------

        private async Task<PublicacionPerfil> VisibleAsync(string id) =>
            await _a.PublicacionesPerfil.ObtenerAsync(id) is { HiddenAt: null } post ? post : throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");

        public Task<string> CrearPublicacionAsync(Guid usuario, PublicacionPerfilNuevaDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string texto = ReglasSociales.LimpiarTexto(dto.Text, ReglasSociales.TextoMaximo);
            List<string> ids = dto.MediaIds ?? [];
            if (ids.Any(string.IsNullOrWhiteSpace)) throw ReglaNegocioException.Validacion("Los archivos adjuntos no son válidos.");
            if (ids.Distinct().Count() != ids.Count) throw ReglaNegocioException.Validacion("Hay archivos repetidos.");
            if (ids.Count > ReglasSociales.MediosPorPublicacion) throw ReglaNegocioException.Validacion($"Una publicación admite como máximo {ReglasSociales.MediosPorPublicacion} archivos.");
            VideoLink? video = null;
            if (!string.IsNullOrEmpty(dto.VideoUrl))
            {
                video = ReglasSociales.VideoCompartible(dto.VideoUrl) ?? throw ReglaNegocioException.Validacion(ReglasSociales.ExplicarEnlaceNoCompartible(dto.VideoUrl));
                if (ids.Count > 0) throw ReglaNegocioException.Validacion("Publica un enlace de video o archivos subidos, no ambos.");
            }
            else if (ids.Count == 0) video = ReglasSociales.BuscarVideoEnTexto(texto);
            if (texto.Length == 0 && ids.Count == 0 && video is null) throw ReglaNegocioException.Validacion("Escribe algo o agrega una foto, un video o un enlace de video.");

            await _a.AsegurarActivaAsync(yo);
            await _a.LimitarUsoAsync(yo, "post.create", 30, TimeSpan.FromDays(1), "publicaciones del perfil por día");
            var archivos = new List<ArchivoMedia>();
            foreach (string mid in ids)
            {
                ArchivoMedia item = await _a.Archivos.ObtenerAsync(mid, true) ?? throw ReglaNegocioException.NoEncontrado("Uno de los archivos no existe. Vuelve a subirlo.");
                if (item.OwnerId != yo) throw ReglaNegocioException.Prohibido("Uno de los archivos no es tuyo.");
                if (item.Purpose != "post") throw ReglaNegocioException.Validacion("Ese archivo no se puede adjuntar a una publicación.");
                if (item.PostId is not null) throw ReglaNegocioException.Conflicto("Uno de los archivos ya está en otra publicación.");
                archivos.Add(item);
            }
            if (archivos.Any(a => a.Kind == "video") && archivos.Count != 1) throw ReglaNegocioException.Validacion("Publica un solo video o hasta cuatro fotos.");
            string en = JsonMercado.Iso(_a.Ahora), id = Guid.NewGuid().ToString();
            _a.PublicacionesPerfil.Insertar(new PublicacionPerfil
            {
                Id = id, AuthorId = yo, Text = texto, MediaIds = ids, CreatedAt = en, UpdatedAt = en,
                Embed = video is null ? null : new VideoEnlazado { Provider = video.Provider, Id = video.Id, Kind = video.Kind, Url = video.Url },
            });
            foreach (ArchivoMedia item in archivos)
            {
                item.PostId = id;
                _a.Archivos.Actualizar(item);
                foreach (ArchivoMedia miniatura in await _a.Archivos.ListarAsync("thumbOf", item.Id)) { miniatura.PostId = id; _a.Archivos.Actualizar(miniatura); }
            }
            _a.Auditar(yo, "post.create", "post", id, new { media = ids.Count, chars = texto.Length, embed = video?.Provider });
            return id;
        });

        /// <summary>Comparte en el perfil un reel de otra persona. Solo se guarda la referencia al original (más un comentario opcional); nunca se forman cadenas.</summary>
        public Task<string> CompartirAsync(Guid usuario, string origenId, string? comentario) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string texto = ReglasSociales.LimpiarTexto(comentario, ReglasSociales.TextoMaximo);
            await _a.AsegurarActivaAsync(yo);
            PublicacionPerfil elegida = await VisibleAsync(origenId);
            PublicacionPerfil? original = elegida.SharedFromId is null ? elegida : await _a.PublicacionesPerfil.ObtenerAsync(elegida.SharedFromId);
            UsuarioE? autor = original is null ? null : await _a.UsuarioAsync(original.AuthorId);
            if (original is null || original.HiddenAt is not null || autor is null || autor.Suspendido) throw ReglaNegocioException.NoEncontrado("La publicación original ya no está disponible.");
            if (original.Demo == true || autor.EsDemo) throw ReglaNegocioException.Prohibido("Las publicaciones de muestra no se pueden compartir.");
            if (original.AuthorId == yo) throw ReglaNegocioException.Validacion("Esta publicación ya es tuya: no hace falta compartirla.");
            if ((await _a.PublicacionesPerfil.ListarAsync("authorId", yo)).Any(p => p.SharedFromId == original.Id)) throw ReglaNegocioException.Conflicto("Ya compartiste este reel en tu perfil.");
            await _a.LimitarUsoAsync(yo, "post.share", 40, TimeSpan.FromDays(1), "reels compartidos por día");
            string en = JsonMercado.Iso(_a.Ahora), id = Guid.NewGuid().ToString();
            _a.PublicacionesPerfil.Insertar(new PublicacionPerfil { Id = id, AuthorId = yo, Text = texto, MediaIds = [], CreatedAt = en, UpdatedAt = en, SharedFromId = original.Id });
            await AprenderAsync(yo, [await SenalDePublicacionAsync(original, "share")]);
            _a.Auditar(yo, "post.share", "post", id, new { from = original.Id, chars = texto.Length });
            await _a.EmitirAsync("profile.post.shared", "post", original.Id, new { postId = original.Id, sharedPostId = id, authorId = original.AuthorId, sharerId = yo }, $"post-shared:{original.Id}:{yo}:{id}");
            return id;
        });

        private async Task<PublicacionPerfil> PropiaAsync(string id, Guid usuario)
        {
            PublicacionPerfil post = await _a.PublicacionesPerfil.ObtenerAsync(id, true) ?? throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
            if (post.AuthorId != usuario.ToString()) throw ReglaNegocioException.Prohibido("Esta publicación no es tuya.");
            return post;
        }

        public Task EditarPublicacionAsync(Guid usuario, string id, string? texto) => _a.EjecutarAsync(async () =>
        {
            string limpio = ReglasSociales.LimpiarTexto(texto, ReglasSociales.TextoMaximo);
            await _a.AsegurarActivaAsync(usuario.ToString());
            PublicacionPerfil post = await PropiaAsync(id, usuario);
            if (post.HiddenAt is not null) throw ReglaNegocioException.Prohibido("La moderación ocultó esta publicación y no se puede editar.");
            if (limpio.Length == 0 && post.MediaIds.Count == 0 && post.Embed is null && post.SharedFromId is null) throw ReglaNegocioException.Validacion("Una publicación sin fotos ni videos necesita texto.");
            post.Text = limpio;
            post.UpdatedAt = post.EditedAt = JsonMercado.Iso(_a.Ahora);
            _a.PublicacionesPerfil.Actualizar(post);
        });

        /// <summary>Borra la publicación con sus archivos, me gusta y comentarios.</summary>
        public Task BorrarPublicacionAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            PublicacionPerfil post = await PropiaAsync(id, usuario);
            var sobrantes = new List<string>();
            foreach (string mid in post.MediaIds)
            {
                foreach (ArchivoMedia miniatura in await _a.Archivos.ListarAsync("thumbOf", mid)) { _a.Archivos.Eliminar(miniatura); sobrantes.Add(miniatura.Id); }
                if (await _a.Archivos.ObtenerAsync(mid) is { } archivo) { _a.Archivos.Eliminar(archivo); sobrantes.Add(mid); }
            }
            foreach (MeGusta g in await _a.MeGustas.ListarAsync("postId", id)) _a.MeGustas.Eliminar(g);
            foreach (ComentarioPerfil c in await _a.Comentarios.ListarAsync("postId", id)) _a.Comentarios.Eliminar(c);
            _a.PublicacionesPerfil.Eliminar(post);
            _a.Contexto.MediaEs.RemoveRange(_a.Contexto.MediaEs.Where(m => sobrantes.Contains(m.Id)));
            _a.Auditar(usuario.ToString(), "post.delete", "post", id, new { media = post.MediaIds.Count });
        });

        // ---------- me gusta y comentarios ----------

        /// <summary>Pone o quita el «me gusta». Es idempotente: repetirlo no duplica ni resta de más; solo la primera vez avisa al autor.</summary>
        public Task<MeGustaResultadoDto> PonerMeGustaAsync(Guid usuario, string postId, bool liked) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            await _a.AsegurarActivaAsync(yo);
            PublicacionPerfil post = await VisibleAsync(postId);
            if (post.Demo == true) throw ReglaNegocioException.Prohibido("Las publicaciones de muestra son de solo lectura.");
            string id = $"{postId}:{yo}";
            MeGusta? existente = await _a.MeGustas.ObtenerAsync(id, true);
            if (liked && existente is null)
            {
                _a.MeGustas.Insertar(new MeGusta { Id = id, PostId = postId, UserId = yo, CreatedAt = JsonMercado.Iso(_a.Ahora) });
                await AprenderAsync(yo, [await SenalDePublicacionAsync(post, "like")]);
                if (post.AuthorId != yo)
                    await _a.EmitirAsync("profile.post.liked", "post", postId, new { postId, authorId = post.AuthorId, likerId = yo }, $"post-liked:{postId}:{yo}");
            }
            if (!liked && existente is not null) _a.MeGustas.Eliminar(existente);
            int total = (await _a.MeGustas.ListarAsync("postId", postId)).Count;
            return new MeGustaResultadoDto { Liked = liked, Likes = total };
        });

        public Task<string> ComentarAsync(Guid usuario, string postId, ComentarioNuevoDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            string texto = ReglasSociales.LimpiarTexto(dto.Text, ReglasSociales.ComentarioMaximo);
            if (texto.Length == 0) throw ReglaNegocioException.Validacion("Escribe un comentario.");
            await _a.AsegurarActivaAsync(yo);
            await _a.LimitarUsoAsync(yo, "comment.create", 60, TimeSpan.FromHours(1), "comentarios por hora");
            PublicacionPerfil post = await VisibleAsync(postId);
            if (post.Demo == true) throw ReglaNegocioException.Prohibido("Las publicaciones de muestra son de solo lectura.");
            string? padre = null, respondeA = null;
            if (!string.IsNullOrEmpty(dto.ParentId))
            {
                ComentarioPerfil origen = await _a.Comentarios.ObtenerAsync(dto.ParentId) is { DeletedAt: null, HiddenAt: null } c ? c : throw ReglaNegocioException.NoEncontrado("El comentario al que respondes ya no existe.");
                if (origen.PostId != postId) throw ReglaNegocioException.Validacion("Ese comentario es de otra publicación.");
                // Responder a una respuesta la une al comentario principal (como Facebook) y guarda a quién se respondió.
                padre = origen.ParentId ?? origen.Id;
                respondeA = origen.AuthorId;
            }
            string id = Guid.NewGuid().ToString(), en = JsonMercado.Iso(_a.Ahora);
            _a.Comentarios.Insertar(new ComentarioPerfil { Id = id, PostId = postId, AuthorId = yo, Text = texto, CreatedAt = en, ParentId = padre, ReplyToUserId = respondeA });
            await AprenderAsync(yo, [await SenalDePublicacionAsync(post, "comment")]);
            _a.Auditar(yo, "comment.create", "post", postId, new { commentId = id, reply = padre is not null });
            if (padre is not null)
            {
                if (respondeA is not null && respondeA != yo)
                    await _a.EmitirAsync("profile.comment.replied", "post", postId, new { commentId = id, postId, authorId = post.AuthorId, toUserId = respondeA }, $"comment-replied:{id}");
            }
            else if (post.AuthorId != yo)
                await _a.EmitirAsync("profile.post.commented", "post", postId, new { commentId = id, postId, authorId = post.AuthorId }, $"post-commented:{id}");
            return id;
        });

        public Task EditarComentarioAsync(Guid usuario, string comentarioId, string? texto) => _a.EjecutarAsync(async () =>
        {
            string limpio = ReglasSociales.LimpiarTexto(texto, ReglasSociales.ComentarioMaximo);
            if (limpio.Length == 0) throw ReglaNegocioException.Validacion("El comentario no puede quedar vacío. Para quitarlo, elimínalo.");
            await _a.AsegurarActivaAsync(usuario.ToString());
            ComentarioPerfil c = await _a.Comentarios.ObtenerAsync(comentarioId, true) is { DeletedAt: null } hallado ? hallado : throw ReglaNegocioException.NoEncontrado("Comentario no encontrado.");
            if (c.AuthorId != usuario.ToString()) throw ReglaNegocioException.Prohibido("Este comentario no es tuyo.");
            if (c.HiddenAt is not null) throw ReglaNegocioException.Prohibido("La moderación ocultó este comentario y no se puede editar.");
            await VisibleAsync(c.PostId);
            c.Text = limpio;
            c.EditedAt = JsonMercado.Iso(_a.Ahora);
            _a.Comentarios.Actualizar(c);
        });

        /// <summary>Lo borra su autor o la dueña de la publicación. Con respuestas queda un hueco («comentario eliminado»); sin respuestas desaparece.</summary>
        public Task BorrarComentarioAsync(Guid usuario, string comentarioId) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            ComentarioPerfil c = await _a.Comentarios.ObtenerAsync(comentarioId, true) is { DeletedAt: null } hallado ? hallado : throw ReglaNegocioException.NoEncontrado("Comentario no encontrado.");
            PublicacionPerfil? post = await _a.PublicacionesPerfil.ObtenerAsync(c.PostId);
            if (c.AuthorId != yo && post?.AuthorId != yo) throw ReglaNegocioException.Prohibido("Solo quien escribió el comentario o la dueña de la publicación pueden borrarlo.");
            bool conRespuestas = c.ParentId is null && (await _a.Comentarios.ListarAsync("postId", c.PostId)).Any(r => r.ParentId == comentarioId && r.DeletedAt is null);
            if (conRespuestas) { c.Text = string.Empty; c.DeletedAt = JsonMercado.Iso(_a.Ahora); _a.Comentarios.Actualizar(c); }
            else _a.Comentarios.Eliminar(c);
            _a.Auditar(yo, "comment.delete", "post", c.PostId, new { commentId = comentarioId, byPostOwner = c.AuthorId != yo });
        });

        // ---------- gustos del feed ----------

        public async Task AprenderAsync(string usuario, IReadOnlyList<Senal> senales)
        {
            if (senales.Count == 0) return;
            InteresDeReels? actual = await _a.InteresesReels.ObtenerAsync(usuario, true);
            var (pesos, autores) = ReglasSociales.AplicarSenales(actual ?? new InteresDeReels { Id = usuario }, senales, _a.Ahora);
            var siguiente = new InteresDeReels { Id = usuario, Weights = pesos, Authors = autores, Seen = actual?.Seen ?? [], UpdatedAt = JsonMercado.Iso(_a.Ahora) };
            if (actual is null) _a.InteresesReels.Insertar(siguiente); else _a.InteresesReels.Actualizar(siguiente);
        }

        /// <summary>Señal de una publicación del muro (o del original, si es un repost).</summary>
        private async Task<Senal> SenalDePublicacionAsync(PublicacionPerfil post, string tipo, double? ms = null)
        {
            PublicacionPerfil? original = post.SharedFromId is null ? null : await _a.PublicacionesPerfil.ObtenerAsync(post.SharedFromId);
            var medios = new Dictionary<string, ArchivoMedia>();
            foreach (string mid in post.MediaIds.Concat(original?.MediaIds ?? []))
                if (await _a.Archivos.ObtenerAsync(mid) is { } a) medios[mid] = a;
            return new Senal(ReglasSociales.EtiquetasDePublicacion(post, medios, original), original?.AuthorId ?? post.AuthorId, tipo, ms);
        }

        /// <summary>Registra lo que la app informó: cuánto tiempo se miró cada reel y los toques en «Ver en el mercado». Lo que no se reconoce se ignora.</summary>
        public Task<int> RegistrarSenalesAsync(Guid usuario, IReadOnlyList<SenalDto> entradas) => _a.EjecutarAsync(async () =>
        {
            var lote = entradas.Take(40).Where(s => System.Text.RegularExpressions.Regex.IsMatch(s.Key, @"^[pa]:[0-9a-f-]{6,36}$", System.Text.RegularExpressions.RegexOptions.IgnoreCase) && s.Type is "view" or "open").ToList();
            if (lote.Count == 0) return 0;
            var deseadas = lote.Select(s => ReglasSociales.ClaveCorta(s.Key)).ToHashSet();
            var posts = (await _a.PublicacionesPerfil.ListarAsync()).Where(p => p.HiddenAt is null && deseadas.Contains(ReglasSociales.ClaveCorta($"p:{p.Id}"))).ToDictionary(p => ReglasSociales.ClaveCorta($"p:{p.Id}"));
            var avisos = (await _a.Publicaciones.ListarAsync("status", EstadoPublicacion.Publicada)).Where(p => deseadas.Contains(ReglasSociales.ClaveCorta($"a:{p.Id}"))).ToDictionary(p => ReglasSociales.ClaveCorta($"a:{p.Id}"));
            var senales = new List<Senal>();
            foreach (SenalDto s in lote)
            {
                string corta = ReglasSociales.ClaveCorta(s.Key);
                Senal? baseS = posts.TryGetValue(corta, out PublicacionPerfil? post) ? await SenalDePublicacionAsync(post, "view")
                    : avisos.TryGetValue(corta, out Publicacion? aviso) ? new Senal(ReglasSociales.EtiquetasDeAviso(aviso), aviso.SellerId, "view") : null;
                if (baseS is null) continue;
                if (s.Type == "open") senales.Add(baseS with { Type = "open" });
                else if (s.Ms is { } ms && double.IsFinite(ms)) senales.Add(baseS with { Type = "view", Ms = Math.Max(0, Math.Min(ms, 600_000)) });
            }
            await AprenderAsync(usuario.ToString(), senales);
            if (senales.Count > 0 && await _a.InteresesReels.ObtenerAsync(usuario.ToString()) is { } gustos)
            {
                foreach (var s in lote.Where(s => s.Type == "view" && s.Ms >= 200 && double.IsFinite(s.Ms.Value)))
                {
                    string corta = ReglasSociales.ClaveCorta(s.Key);
                    if (posts.TryGetValue(corta, out var p)) gustos.Seen[$"p:{p.SharedFromId ?? p.Id}"] = JsonMercado.Iso(_a.Ahora);
                    else if (avisos.TryGetValue(corta, out var a)) gustos.Seen[$"a:{a.Id}"] = JsonMercado.Iso(_a.Ahora);
                }
                gustos.Seen = gustos.Seen.Where(x => JsonMercado.Fecha(x.Value) > _a.Ahora.AddDays(-7)).OrderByDescending(x => x.Value).Take(500).ToDictionary(x => x.Key, x => x.Value);
                _a.InteresesReels.Actualizar(gustos);
            }
            return senales.Count;
        });

        // ---------- archivos ----------

        // Solo lo llama el trabajador después de decodificar, validar y transcodificar.
        public Task<MedioSubidoDto> GuardarVideoAsync(Guid usuario, string trabajo, byte[] bytes, byte[] portada, int ancho, int alto, double segundos) => _a.EjecutarAsync(async () =>
        {
            if (!double.IsFinite(segundos) || segundos <= 0 || segundos > 50) throw ReglaNegocioException.Validacion("El video debe durar como máximo 50 segundos.");
            string yo = usuario.ToString(), id = Guid.ParseExact(trabajo, "N").ToString(), thumb = id + "-thumb";
            await _a.AsegurarActivaAsync(yo);
            if (await _a.Archivos.ObtenerAsync(id) is { } existente)
            {
                if (existente.OwnerId != yo) throw ReglaNegocioException.Prohibido("Archivo ajeno.");
                return new MedioSubidoDto { Id = id, Url = $"/api/media/{id}" };
            }
            long usado = (await _a.Archivos.ListarAsync("ownerId", yo)).Sum(a => a.Size);
            if (usado + bytes.Length + portada.Length > CupoPorPersona) throw ReglaNegocioException.Conflicto("Llegaste al límite de almacenamiento de tu cuenta.");
            foreach (var m in new[] { (Id: id, Bytes: bytes, Mime: "video/mp4", Kind: "video", Thumb: (string?)null), (Id: thumb, Bytes: portada, Mime: "image/webp", Kind: "image", Thumb: (string?)id) })
            {
                _a.Contexto.MediaEs.Add(new MediaE { Id = m.Id, Mime = m.Mime, OwnerId = yo, Bytes = m.Bytes, CreadoEn = _a.Ahora });
                _a.Archivos.Insertar(new ArchivoMedia { Id = m.Id, OwnerId = yo, Kind = m.Kind, Mime = m.Mime, Size = m.Bytes.Length, Purpose = m.Thumb is null ? "post" : "thumbnail", ThumbOf = m.Thumb, Width = m.Thumb is null ? ancho : null, Height = m.Thumb is null ? alto : null, CreatedAt = JsonMercado.Iso(_a.Ahora) });
            }
            _a.Auditar(yo, "media.upload", "media", id, new { segundos, size = bytes.Length });
            return new MedioSubidoDto { Id = id, Url = $"/api/media/{id}" };
        });

        private static string? TipoReal(byte[] b)
        {
            if (b.Length >= 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff) return "image/jpeg";
            if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47 && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a) return "image/png";
            if (b.Length >= 12 && System.Text.Encoding.ASCII.GetString(b, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(b, 8, 4) == "WEBP") return "image/webp";
            return null;
        }

        /// <summary>Sube una foto (JPG, PNG o WEBP). El tipo se decide por los primeros bytes, nunca por lo que diga el cliente. Los videos propios todavía se suben desde la app web.</summary>
        public Task<MedioSubidoDto> SubirMedioAsync(Guid usuario, byte[] bytes, string mime, string uso, int? ancho, int? alto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            if (bytes.Length == 0) throw ReglaNegocioException.Validacion("El archivo está vacío.");
            if (uso is not ("post" or "avatar" or "bird")) throw ReglaNegocioException.Validacion("Uso de archivo no válido.");
            string real = TipoReal(bytes) ?? throw ReglaNegocioException.Validacion("Formato no permitido. Usa fotos JPG, PNG o WEBP; los videos se suben desde la app web.");
            string declarado = (mime ?? string.Empty).Split(';')[0].Trim().ToLowerInvariant().Replace("image/jpg", "image/jpeg");
            if (declarado != real) throw ReglaNegocioException.Validacion("El archivo no coincide con el tipo indicado.");
            int limite = uso == "avatar" ? LimiteAvatar : LimiteImagen;
            if (bytes.Length > limite) throw new ReglaNegocioException(413, $"El archivo pesa {bytes.Length / 1048576.0:0.0} MB y el máximo es {limite / 1048576.0:0.#} MB.");
            if (ancho is < 1 or > 20_000 || alto is < 1 or > 20_000) throw ReglaNegocioException.Validacion("Las dimensiones no son válidas.");
            await _a.AsegurarActivaAsync(yo);
            await _a.LimitarUsoAsync(yo, "media.upload", 120, TimeSpan.FromHours(1), "archivos subidos por hora");
            long usado = (await _a.Archivos.ListarAsync("ownerId", yo)).Sum(a => a.Size);
            if (usado + bytes.Length > CupoPorPersona) throw ReglaNegocioException.Conflicto("Llegaste al límite de almacenamiento de tu cuenta. Borra publicaciones con archivos para liberar espacio.");
            string id = Guid.NewGuid().ToString(), en = JsonMercado.Iso(_a.Ahora);
            _a.Contexto.MediaEs.Add(new MediaE { Id = id, Mime = real, OwnerId = yo, Bytes = bytes, CreadoEn = _a.Ahora });
            _a.Archivos.Insertar(new ArchivoMedia { Id = id, OwnerId = yo, Kind = "image", Mime = real, Size = bytes.Length, Purpose = uso, Width = ancho, Height = alto, CreatedAt = en });
            if (uso == "avatar")
            {
                UsuarioE cuenta = await CuentaAsync(usuario);
                JsonObject perfil = PerfilDe(cuenta);
                if (perfil["avatarId"]?.GetValue<string>() is { Length: > 0 } anterior)
                {
                    if (await _a.Archivos.ObtenerAsync(anterior) is { } viejo) _a.Archivos.Eliminar(viejo);
                    _a.Contexto.MediaEs.RemoveRange(_a.Contexto.MediaEs.Where(m => m.Id == anterior));
                }
                perfil["avatarId"] = id;
                Guardar(cuenta, perfil);
            }
            _a.Auditar(yo, "media.upload", "media", id, new { uso, size = bytes.Length });
            return new MedioSubidoDto { Id = id, Url = $"/api/media/{id}" };
        });
    }
}
