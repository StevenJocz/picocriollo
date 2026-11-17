using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.Domain.Mercado
{
    public record VideoLink(string Provider, string Id, string Kind, string Url, string Aspect);

    public record CandidatoReel(string Key, string At, string AuthorId, List<string> Tags, int Likes, int Comments, int Bucket, bool Followed, bool Liked, bool IsAd);

    public record Senal(List<string> Tags, string AuthorId, string Type, double? Ms = null);

    /// <summary>
    /// Texto, enlaces de video, redes y orden «Para ti» del perfil social. Mismas reglas que la app Next.js (text, video-links, social-links,
    /// reel-ranking, reel-features): documentos compartidos, así que los límites y las etiquetas tienen que coincidir.
    /// </summary>
    public static partial class ReglasSociales
    {
        public const int TextoMaximo = 600, ComentarioMaximo = 1000, MediosPorPublicacion = 10;

        // ---------- texto ----------

        [GeneratedRegex(@"[\w.+-]+@[\w-]+\.[\w.-]+")] private static partial Regex Correo();
        [GeneratedRegex(@"(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b|\b\d{10}\b")] private static partial Regex Telefono();
        [GeneratedRegex(@"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]")] private static partial Regex Controles();

        public static bool ContieneContacto(string texto) => Correo().IsMatch(texto) || Telefono().IsMatch(texto);

        /// <summary>El texto limpio (puede quedar vacío). Error si es demasiado largo o trae contacto directo.</summary>
        public static string LimpiarTexto(string? bruto, int maximo)
        {
            if (string.IsNullOrEmpty(bruto)) return string.Empty;
            if (Controles().IsMatch(bruto)) throw ReglaNegocioException.Validacion("El texto tiene caracteres no permitidos.");
            string texto = bruto.Normalize(NormalizationForm.FormC).Replace("\r\n", "\n").Replace('\r', '\n').Trim();
            if (texto.Length > maximo) throw ReglaNegocioException.Validacion($"El texto supera {maximo} caracteres.");
            if (ContieneContacto(texto)) throw ReglaNegocioException.Validacion("No publiques teléfonos ni correos: el contacto se comparte dentro de una operación aceptada.");
            return texto;
        }

        // ---------- enlaces de video ----------

        private static readonly HashSet<string> HostsYoutube = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"];
        private static readonly HashSet<string> HostsTiktok = ["tiktok.com", "www.tiktok.com", "m.tiktok.com"];
        private static readonly HashSet<string> HostsInstagram = ["instagram.com", "www.instagram.com"];
        [GeneratedRegex(@"^[A-Za-z0-9_-]{11}$")] private static partial Regex IdYoutube();
        [GeneratedRegex(@"^\d{8,25}$")] private static partial Regex IdTiktok();
        [GeneratedRegex(@"^[A-Za-z0-9_-]{5,20}$")] private static partial Regex CodigoInstagram();
        [GeneratedRegex(@"^@[\w.]{1,40}$")] private static partial Regex UsuarioTiktok();
        [GeneratedRegex(@"^[A-Za-z0-9._]{1,30}$")] private static partial Regex UsuarioInstagram();
        [GeneratedRegex(@"^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|instagram\.com)(?:[/?#]|$)", RegexOptions.IgnoreCase)] private static partial Regex ConocidoSinEsquema();
        [GeneratedRegex(@"^[a-z][a-z0-9+.-]*:", RegexOptions.IgnoreCase)] private static partial Regex ConEsquema();

        public static readonly Dictionary<string, string> EtiquetasDeProveedor = new() { ["youtube"] = "YouTube", ["tiktok"] = "TikTok", ["instagram"] = "Instagram" };

        /// <summary>Lista cerrada de dominios, id con expresión estricta y enlace canónico construido aquí: nunca se incrusta lo que escribió la persona.</summary>
        public static VideoLink? ReconocerVideo(string? bruto)
        {
            string texto = (bruto ?? string.Empty).Trim();
            if (texto.Length is 0 or > 500) return null;
            string conEsquema = ConEsquema().IsMatch(texto) ? texto : ConocidoSinEsquema().IsMatch(texto) ? $"https://{texto}" : string.Empty;
            if (conEsquema.Length == 0 || !Uri.TryCreate(conEsquema, UriKind.Absolute, out Uri? url)) return null;
            if (url.Scheme is not ("http" or "https") || url.UserInfo.Length > 0 || !url.IsDefaultPort) return null;
            string host = url.Host.ToLowerInvariant().TrimEnd('.');
            string[] partes = url.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            string? Consulta(string clave) => url.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries).Select(p => p.Split('=', 2)).Where(p => p[0] == clave).Select(p => p.Length > 1 ? Uri.UnescapeDataString(p[1]) : "").FirstOrDefault();

            if (HostsYoutube.Contains(host))
            {
                string? id = null; string tipo = "watch";
                if (host == "youtu.be") id = partes.ElementAtOrDefault(0);
                else if (partes.ElementAtOrDefault(0) == "watch") id = Consulta("v");
                else if (partes.ElementAtOrDefault(0) == "shorts") { id = partes.ElementAtOrDefault(1); tipo = "shorts"; }
                else if (partes.ElementAtOrDefault(0) is "embed" or "live" or "v") id = partes.ElementAtOrDefault(1);
                if (id is null || !IdYoutube().IsMatch(id)) return null;
                return new VideoLink("youtube", id, tipo, tipo == "shorts" ? $"https://www.youtube.com/shorts/{id}" : $"https://www.youtube.com/watch?v={id}", tipo == "shorts" ? "portrait" : "landscape");
            }
            if (HostsTiktok.Contains(host))
            {
                string? id = null, usuario = "";
                if (partes.Length == 3 && UsuarioTiktok().IsMatch(partes[0]) && partes[1] == "video") { usuario = partes[0]; id = partes[2]; }
                else if (partes.ElementAtOrDefault(0) == "embed" && partes.ElementAtOrDefault(1) == "v2") id = partes.ElementAtOrDefault(2);
                else if (partes.ElementAtOrDefault(0) == "embed") id = partes.ElementAtOrDefault(1);
                if (id is null || !IdTiktok().IsMatch(id)) return null;
                return new VideoLink("tiktok", id, "video", usuario.Length > 0 ? $"https://www.tiktok.com/{usuario}/video/{id}" : $"https://www.tiktok.com/embed/v2/{id}", "portrait");
            }
            if (HostsInstagram.Contains(host))
            {
                int en = Array.FindIndex(partes, p => p is "reel" or "reels" or "p" or "tv");
                if (en == -1 || en > 1 || (en == 1 && !UsuarioInstagram().IsMatch(partes[0]))) return null;
                string? codigo = partes.ElementAtOrDefault(en + 1);
                if (codigo is null || !CodigoInstagram().IsMatch(codigo) || partes.Length > en + 2) return null;
                string tipo = partes[en] == "reels" ? "reel" : partes[en];
                return new VideoLink("instagram", codigo, tipo, $"https://www.instagram.com/{tipo}/{codigo}/", tipo == "p" ? "square" : "portrait");
            }
            return null;
        }

        public static string UrlDeReproductor(string proveedor, string id, string tipo) => proveedor switch
        {
            "youtube" => $"https://www.youtube-nocookie.com/embed/{id}?rel=0&playsinline=1",
            "tiktok" => $"https://www.tiktok.com/embed/v2/{id}",
            _ => $"https://www.instagram.com/{(tipo is "p" or "tv" ? tipo : "reel")}/{id}/embed",
        };

        /// <summary>Hoy solo se comparten videos de YouTube; TikTok e Instagram se enlazan desde el perfil.</summary>
        public static VideoLink? VideoCompartible(string? bruto) => ReconocerVideo(bruto) is { Provider: "youtube" } v ? v : null;

        [GeneratedRegex(@"(?:https?://|www\.)[^\s<>""'`]+", RegexOptions.IgnoreCase)] private static partial Regex Enlaces();

        public static VideoLink? BuscarVideoEnTexto(string texto)
        {
            foreach (Match m in Enlaces().Matches(texto))
                if (VideoCompartible(m.Value.TrimEnd('.', ',', ';', ':', '!', '?', ')', ']')) is { } v) return v;
            return null;
        }

        public static string ExplicarEnlaceNoCompartible(string? bruto)
        {
            string texto = (bruto ?? string.Empty).Trim().ToLowerInvariant();
            return Regex.IsMatch(texto, @"(?:^|\.|//)(?:tiktok|instagram)\.com|(?:^|//)(?:vm|vt)\.tiktok\.com")
                ? "Solo se pueden compartir videos de YouTube. Tu TikTok o Instagram los puedes mostrar agregando el enlace de tu perfil en tu cuenta."
                : "No reconocemos ese enlace. Pega el enlace de un video público de YouTube.";
        }

        // ---------- redes del perfil ----------

        public static readonly string[] Redes = ["tiktok", "instagram", "youtube"];
        private static readonly Dictionary<string, string> EtiquetasDeRed = new() { ["tiktok"] = "TikTok", ["instagram"] = "Instagram", ["youtube"] = "YouTube" };
        private static readonly HashSet<string> ReservadosInstagram = ["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal", "privacy", "web", "challenge", "oauth", "emails", "session", "directory"];
        [GeneratedRegex(@"^@([A-Za-z0-9._-]+)$")] private static partial Regex Arroba();
        [GeneratedRegex(@"^[\w-]+(\.[\w-]+)+(/|$|\?)")] private static partial Regex SinEsquema();

        private static ReglaNegocioException Invalido(string red, string pista) => ReglaNegocioException.Validacion($"El enlace de {EtiquetasDeRed[red]} no es válido. {pista}");

        private static (string Host, string[] Partes)? Direccion(string bruto)
        {
            string conEsquema = ConEsquema().IsMatch(bruto) ? bruto : SinEsquema().IsMatch(bruto) ? $"https://{bruto}" : string.Empty;
            if (conEsquema.Length == 0 || !Uri.TryCreate(conEsquema, UriKind.Absolute, out Uri? u) || u.Scheme is not ("http" or "https")) return null;
            string host = Regex.Replace(u.Host.ToLowerInvariant(), "^(www|m)\\.", "");
            return (host, u.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(p => { try { return Uri.UnescapeDataString(p); } catch (UriFormatException) { return p; } }).ToArray());
        }

        /// <summary>El enlace canónico del perfil, o vacío si se dejó vacío. Error si no es un perfil válido de esa red.</summary>
        public static string NormalizarRed(string red, string? bruto)
        {
            string texto = (bruto ?? string.Empty).Trim();
            if (texto.Length == 0) return string.Empty;
            string? usuario = Arroba().Match(texto) is { Success: true } m ? m.Groups[1].Value : null;
            var url = usuario is null ? Direccion(texto) : null;
            if (usuario is null && url is null) throw Invalido(red, red == "youtube" ? "Pega el enlace de tu canal (youtube.com/@tucanal) o escribe @tucanal." : "Pega el enlace de tu perfil o escribe @tuusuario.");

            if (red == "tiktok")
            {
                string nombre = usuario ?? (url!.Value.Host == "tiktok.com" && url.Value.Partes.Length == 1 && url.Value.Partes[0].StartsWith('@') ? url.Value.Partes[0][1..] : "");
                if (!Regex.IsMatch(nombre, @"^[A-Za-z0-9._]{2,24}$")) throw Invalido(red, "Pega el enlace de tu perfil (tiktok.com/@tuusuario), no el de un video.");
                return $"https://www.tiktok.com/@{nombre}";
            }
            if (red == "instagram")
            {
                string nombre = usuario ?? (url!.Value.Host == "instagram.com" && url.Value.Partes.Length == 1 ? url.Value.Partes[0] : "");
                if (!Regex.IsMatch(nombre, @"^[A-Za-z0-9._]{1,30}$") || ReservadosInstagram.Contains(nombre.ToLowerInvariant())) throw Invalido(red, "Pega el enlace de tu perfil (instagram.com/tuusuario), no el de una publicación.");
                return $"https://www.instagram.com/{nombre}/";
            }
            if (usuario is not null)
            {
                if (!Regex.IsMatch(usuario, @"^[A-Za-z0-9._-]{3,30}$")) throw Invalido(red, "Pega el enlace de tu canal (youtube.com/@tucanal) o escribe @tucanal.");
                return $"https://www.youtube.com/@{usuario}";
            }
            string[] p = url!.Value.Partes;
            if (url.Value.Host == "youtube.com")
            {
                if (p.Length == 1 && Regex.IsMatch(p[0], @"^@[A-Za-z0-9._-]{3,30}$")) return $"https://www.youtube.com/{p[0]}";
                if (p.Length == 2 && p[0] == "channel" && Regex.IsMatch(p[1], @"^UC[A-Za-z0-9_-]{22}$")) return $"https://www.youtube.com/channel/{p[1]}";
                if (p.Length == 2 && p[0] is "c" or "user" && Regex.IsMatch(p[1], @"^[A-Za-z0-9._-]{2,60}$")) return $"https://www.youtube.com/{p[0]}/{p[1]}";
            }
            throw Invalido(red, "Pega el enlace de tu canal (youtube.com/@tucanal), no el de un video.");
        }

        // ---------- etiquetas, gustos y orden «Para ti» ----------

        public static string Plegar(string texto)
        {
            var sb = new StringBuilder();
            foreach (char c in texto.Normalize(NormalizationForm.FormD))
                if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
            return sb.ToString().ToLower(new CultureInfo("es-CO"));
        }

        private static readonly (string Especie, Regex Patron)[] PalabrasDeEspecie =
        [
            ("patos", new Regex(@"\bpat[oa]s?\b")), ("gansos", new Regex(@"\bgans[oa]s?\b")), ("pavos", new Regex(@"\b(pavos?|pavas?|piscos?)\b")),
            ("codornices", new Regex(@"\bcodorni(z|ces)\b")), ("pintadas", new Regex(@"\bpintadas?\b")), ("palomas", new Regex(@"\bpalom[oa]s?\b")),
            ("gallinas", new Regex(@"\b(gallinas?|gallos?|pollit[oa]s?)\b")),
        ];

        /// <summary>#hashtags y tipo de ave que menciona el texto. (La app Next.js también reconoce razas por nombre; aquí quedan solo las del aviso del mercado.)</summary>
        public static List<string> EtiquetasDeTexto(string texto)
        {
            var etiquetas = new HashSet<string>();
            foreach (Match m in Regex.Matches(texto, @"#([\p{L}\p{N}_]+)")) etiquetas.Add($"#{Plegar(m.Groups[1].Value)}");
            string plegado = Plegar(texto);
            foreach (var (especie, patron) in PalabrasDeEspecie) if (patron.IsMatch(plegado)) etiquetas.Add($"species:{especie}");
            if (Regex.IsMatch(plegado, @"\b(huevos?|fertil(es)?)\b")) etiquetas.Add("#huevos");
            return [.. etiquetas];
        }

        public static string EtiquetaDeTipo(PublicacionPerfil post, IReadOnlyDictionary<string, ArchivoMedia> medios)
        {
            if (post.Embed is not null) return "type:youtube";
            if (post.MediaIds.Count > 0 && medios.TryGetValue(post.MediaIds[0], out ArchivoMedia? primero)) return primero.Kind == "video" ? "type:video" : "type:foto";
            return post.DemoImageUrl is not null ? "type:foto" : "type:texto";
        }

        public static List<string> EtiquetasDePublicacion(PublicacionPerfil post, IReadOnlyDictionary<string, ArchivoMedia> medios, PublicacionPerfil? original)
        {
            PublicacionPerfil fuente = original ?? post;
            var etiquetas = new HashSet<string>(EtiquetasDeTexto(fuente.Text));
            if (original is not null) foreach (string t in EtiquetasDeTexto(post.Text)) etiquetas.Add(t);
            etiquetas.Add(EtiquetaDeTipo(fuente, medios));
            if (original is not null) etiquetas.Add("type:compartido");
            return [.. etiquetas];
        }

        public static List<string> EtiquetasDeAviso(Publicacion aviso)
        {
            FichaPublica s = aviso.Snapshot;
            var etiquetas = new HashSet<string> { "type:mercado", $"item:{aviso.Tipo}" };
            if (aviso.Tipo == TipoPublicacion.Insumo) etiquetas.Add($"cat:{Plegar(s.Breed)}");
            else
            {
                if (s.Breed.Length > 0) etiquetas.Add($"breed:{Regex.Replace(Regex.Replace(Plegar(s.Breed), @"\s*\(.*\)$", ""), @"\s+", "-")}");
                etiquetas.Add($"species:{Plegar(s.Species ?? "Gallinas")}");
            }
            return [.. etiquetas];
        }

        private const double MediaVida = 14, PesoMaximo = 30, PesoMinimo = -3;
        private const int MaximoEtiquetas = 300, MaximoAutores = 200;

        private static double PesoDe(Senal s) => s.Type switch
        {
            "view" => (s.Ms ?? 0) < 1500 ? -0.4 : s.Ms < 4000 ? 0.3 : s.Ms < 8000 ? 1 : 2,
            "like" or "comment" or "open" => 3,
            _ => 4,
        };

        private static double Acotar(double v) => Math.Max(PesoMinimo, Math.Min(PesoMaximo, v));

        private static Dictionary<string, double> Podar(Dictionary<string, double> tabla, int max)
        {
            var filas = tabla.Where(p => Math.Abs(p.Value) >= 0.05).OrderByDescending(p => Math.Abs(p.Value)).Take(max);
            return filas.ToDictionary(p => p.Key, p => Math.Round(p.Value * 1000) / 1000);
        }

        /// <summary>Aplica señales a los gustos: primero se olvida un poco lo antiguo (la mitad cada 14 días) y luego se suma lo nuevo.</summary>
        public static (Dictionary<string, double> Pesos, Dictionary<string, double> Autores) AplicarSenales(InteresDeReels actual, IEnumerable<Senal> senales, DateTime ahora)
        {
            double dias = actual.UpdatedAt.Length > 0 ? Math.Max(0, (ahora - JsonMercado.Fecha(actual.UpdatedAt)).TotalDays) : 0;
            double olvido = Math.Pow(0.5, dias / MediaVida);
            var pesos = actual.Weights.ToDictionary(p => p.Key, p => p.Value * olvido);
            var autores = actual.Authors.ToDictionary(p => p.Key, p => p.Value * olvido);
            foreach (Senal s in senales)
            {
                double cantidad = PesoDe(s);
                foreach (string etiqueta in s.Tags.Distinct())
                    pesos[etiqueta] = Acotar(pesos.GetValueOrDefault(etiqueta) + cantidad * (s.Type == "follow" ? 0.25 : 1));
                if (s.AuthorId.Length > 0) autores[s.AuthorId] = Acotar(autores.GetValueOrDefault(s.AuthorId) + cantidad * 1.2);
            }
            return (Podar(pesos, MaximoEtiquetas), Podar(autores, MaximoAutores));
        }

        /// <summary>Número entre 0 y 1 que depende solo del texto (FNV-1a sobre unidades UTF-16, igual que la app Next.js).</summary>
        public static double Hash01(string texto)
        {
            uint h = 2166136261;
            foreach (char c in texto) { h ^= c; h *= 16777619; }
            return h % 10000 / 10000.0;
        }

        public static double Puntaje(CandidatoReel c, InteresDeReels gustos, DateTime ahora)
        {
            double horas = Math.Max(0, (ahora - JsonMercado.Fecha(c.At)).TotalHours);
            double recencia = 1.6 * Math.Exp(-horas / 60);
            // Tendencia = ritmo de reacciones (no el total acumulado): lo que gusta rápido gana al que acumuló durante semanas.
            double tendencia = 1.2 * Math.Tanh((c.Likes + 2 * c.Comments) / Math.Pow(horas + 6, 0.6) / 2.5);
            double suma = c.Tags.Sum(t => gustos.Weights.GetValueOrDefault(t) * (t.StartsWith("type:", StringComparison.Ordinal) ? 0.5 : 1));
            double afinidad = 1.4 * Math.Tanh(suma / 6);
            double autor = 1.1 * Math.Tanh(gustos.Authors.GetValueOrDefault(c.AuthorId) / 6);
            double sigue = c.Followed ? 1 : 0;
            double cercania = c.Bucket == 0 ? 0.9 : c.Bucket == 1 ? 0.4 : 0;
            double yaGusto = c.Liked ? -2 : 0;
            return recencia + tendencia + afinidad + autor + sigue + cercania + yaGusto;
        }

        /// <summary>Hasta <paramref name="limite"/> reels, repartidos: tras cada elección se castiga repetir autor, aviso o tema.</summary>
        public static List<CandidatoReel> Ordenar(IEnumerable<CandidatoReel> candidatos, InteresDeReels gustos, DateTime ahora, string semilla, int limite, ISet<string> excluidos, IReadOnlyList<CandidatoReel> recientes)
        {
            var baseP = new Dictionary<string, double>();
            var grupo = candidatos.Where(c => !excluidos.Contains(c.Key)).ToList();
            foreach (CandidatoReel c in grupo) baseP[c.Key] = Puntaje(c, gustos, ahora) + 0.25 * Hash01($"{semilla}:{c.Key}");
            grupo = grupo.OrderByDescending(c => baseP[c.Key]).ThenBy(c => c.Key, StringComparer.Ordinal).ToList();

            var ventana = recientes.TakeLast(3).ToList();
            var elegidos = new List<CandidatoReel>();
            double[] pesoAtras = [1, 0.57, 0.29];
            while (elegidos.Count < limite && grupo.Count > 0)
            {
                int mejor = 0; double mejorValor = double.NegativeInfinity;
                var permitidos = Enumerable.Range(0, grupo.Count).ToList();
                // Buscar también fuera de los favoritos: un autor popular no debe monopolizar la página.
                if (ventana.LastOrDefault() is { } ultimo)
                {
                    var distintos = permitidos.Where(i => grupo[i].AuthorId != ultimo.AuthorId).ToList();
                    if (distintos.Count > 0) permitidos = distintos;
                }
                if (ventana.TakeLast(2).Any(c => c.IsAd))
                {
                    var sinAvisos = permitidos.Where(i => !grupo[i].IsAd).ToList();
                    if (sinAvisos.Count > 0) permitidos = sinAvisos;
                }
                // Una oportunidad de descubrimiento cada cinco posiciones, sin anuncios.
                if ((recientes.Count + elegidos.Count + 1) % 5 == 0)
                {
                    var explorar = permitidos.Where(i => !grupo[i].Followed && !grupo[i].IsAd && gustos.Authors.GetValueOrDefault(grupo[i].AuthorId) <= 0).ToList();
                    if (explorar.Count > 0) permitidos = explorar;
                }
                foreach (int i in permitidos)
                {
                    CandidatoReel c = grupo[i];
                    double valor = baseP[c.Key];
                    var ultimos = ventana.TakeLast(3).Reverse().ToList();
                    for (int atras = 0; atras < ultimos.Count; atras++)
                    {
                        CandidatoReel previo = ultimos[atras];
                        double peso = pesoAtras[atras];
                        if (previo.AuthorId == c.AuthorId) valor -= 1.4 * peso;
                        if (previo.IsAd && c.IsAd) valor -= 2 * peso;
                        if (previo.Tags.Count > 0 && c.Tags.Any(t => t.StartsWith('#') && previo.Tags.Contains(t))) valor -= 0.25 * peso;
                    }
                    if (valor > mejorValor) { mejorValor = valor; mejor = i; }
                }
                CandidatoReel elegido = grupo[mejor];
                grupo.RemoveAt(mejor);
                elegidos.Add(elegido);
                ventana.Add(elegido);
            }
            return elegidos;
        }

        /// <summary>Clave corta de un reel (<c>p:</c> + 8 del id, <c>a:</c> para avisos): las listas de «ya vistos» son cortas.</summary>
        public static string ClaveCorta(string clave) => clave.Length <= 10 ? clave : clave[..10];

        // ---------- búsqueda ----------

        public static List<string> Terminos(string consulta)
        {
            string plegado = Plegar(consulta.Length > 200 ? consulta[..200] : consulta);
            plegado = Regex.Replace(plegado, @"[#,.;:()¿?¡!""'«»]", " ");
            var terminos = new List<string>();
            foreach (string palabra in plegado.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            {
                string t = palabra.Length > 40 ? palabra[..40] : palabra;
                if (t.Length > 3 && t.EndsWith('s')) t = t[..^1];
                if (!terminos.Contains(t)) terminos.Add(t);
                if (terminos.Count >= 8) break;
            }
            return terminos;
        }

        public static bool Coincide(string texto, IReadOnlyList<string> terminos)
        {
            if (terminos.Count == 0) return true;
            string pajar = Plegar(texto);
            return terminos.All(pajar.Contains);
        }
    }
}
