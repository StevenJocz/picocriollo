using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;

namespace PicoCriollo.Domain.Mercado
{
    public record EstadoDeSubasta(string Phase, long CurrentPrice, long StartingPrice, int BidCount, long MinNextBid);

    public record Reputacion(int Count, double Average, int Completed, int[] Distribution);

    /// <summary>
    /// Reglas del mercado que no tocan la base de datos. Son las mismas que aplica la app Next.js (auction-rules, snapshot, trust,
    /// messages): los documentos son compartidos, así que los números y las huellas tienen que coincidir.
    /// </summary>
    public static partial class ReglasMercado
    {
        public const long PrecioMaximo = 1_000_000_000;
        public const int MaximoAvesPorLote = 50;
        public const long PrecioMinimoSubasta = 1_000;
        public const long IncrementoMinimoAbsoluto = 100;
        public static readonly TimeSpan DuracionMinima = TimeSpan.FromHours(1);
        public static readonly TimeSpan DuracionMaxima = TimeSpan.FromDays(30);
        public static readonly TimeSpan CancelarConOfertasHasta = TimeSpan.FromHours(24);
        public const int VentanaAntiFrancotirador = 300;
        public const int ExtensionAntiFrancotirador = 300;
        public const int MaximoExtensiones = 12;
        public static readonly TimeSpan PlazoValoracion = TimeSpan.FromDays(14);
        public const int TopePorPareja = 3;
        public static readonly string[] EstadosAveBloqueados = ["Vendido", "Fallecido", "Transferido"];

        // ---------- subasta ----------

        /// <summary>Incremento por defecto: el mayor entre 1.000 COP y el 5 % del precio inicial, redondeado a 100.</summary>
        public static long IncrementoPorDefecto(long precioInicial) =>
            Math.Max(1_000, (long)Math.Round(precioInicial * 0.05 / 100, MidpointRounding.AwayFromZero) * 100);

        public static (ReglasSubasta Reglas, string Abre, string Cierra) NormalizarSubasta(long precioInicial, long? incremento, long? reserva, bool antiFrancotirador, DateTime? abre, DateTime? cierra, DateTime ahora)
        {
            if (precioInicial < PrecioMinimoSubasta || precioInicial > PrecioMaximo)
                throw ReglaNegocioException.Validacion($"El precio inicial debe estar entre {Pesos(PrecioMinimoSubasta)} y {Pesos(PrecioMaximo)} COP.");
            long minimo = IncrementoPorDefecto(precioInicial);
            if (incremento is { } inc)
            {
                if (inc < IncrementoMinimoAbsoluto || inc > precioInicial * 2) throw ReglaNegocioException.Validacion("El incremento mínimo no es válido (mínimo 100 COP).");
                minimo = inc;
            }
            var reglas = new ReglasSubasta { StartingPrice = precioInicial, MinIncrement = minimo };
            if (reserva is { } res)
            {
                if (res < precioInicial || res > PrecioMaximo) throw ReglaNegocioException.Validacion("El precio de reserva no puede ser menor que el precio inicial.");
                reglas.ReservePrice = res;
            }
            if (antiFrancotirador) reglas.AntiSniping = new AntiSniping { WindowSeconds = VentanaAntiFrancotirador, ExtendSeconds = ExtensionAntiFrancotirador };
            if (cierra is null) throw ReglaNegocioException.Validacion("Indica la fecha de cierre de la subasta.");
            DateTime inicio = abre is { } a && a > ahora ? a : ahora;
            TimeSpan duracion = cierra.Value - inicio;
            if (duracion < DuracionMinima) throw ReglaNegocioException.Validacion("La subasta debe durar al menos 1 hora desde su apertura.");
            if (duracion > DuracionMaxima) throw ReglaNegocioException.Validacion("La subasta no puede durar más de 30 días.");
            return (reglas, JsonMercado.Iso(inicio), JsonMercado.Iso(cierra.Value));
        }

        public static string Pesos(long valor) => valor.ToString("N0", new CultureInfo("es-CO"));

        public static IEnumerable<Oferta> Validas(IEnumerable<Oferta> ofertas) => ofertas.Where(o => o.Status == "valida");

        /// <summary>La más alta; ante un empate, la más temprana.</summary>
        public static Oferta? Mejor(IEnumerable<Oferta> ofertas) => Validas(ofertas).OrderByDescending(o => o.Amount).ThenBy(o => o.Seq).FirstOrDefault();

        public static EstadoDeSubasta? EstadoSubasta(Publicacion p, IReadOnlyCollection<Oferta> ofertas, DateTime ahora)
        {
            if (p.Kind != TipoPublicacion.Subasta || p.Auction is null) return null;
            Oferta? mejor = Mejor(ofertas);
            bool publicada = p.Status == EstadoPublicacion.Publicada;
            bool programada = publicada && p.OpensAt is not null && ahora < JsonMercado.Fecha(p.OpensAt);
            bool abierta = publicada && (p.OpensAt is null || ahora >= JsonMercado.Fecha(p.OpensAt)) && (p.ClosesAt is null || ahora < JsonMercado.Fecha(p.ClosesAt));
            return new EstadoDeSubasta(programada ? "programada" : abierta ? "abierta" : "cerrada",
                mejor?.Amount ?? p.Auction.StartingPrice, p.Auction.StartingPrice, ofertas.Count,
                mejor is null ? p.Auction.StartingPrice : mejor.Amount + p.Auction.MinIncrement);
        }

        // ---------- mensajes ----------

        [GeneratedRegex(@"[\w.+-]+@[\w-]+\.[\w.-]+")] private static partial Regex PatronCorreo();
        [GeneratedRegex(@"(?:\d[\s().-]*){7,}")] private static partial Regex PatronTelefono();

        /// <summary>Correos o teléfonos: no se comparten hasta que exista una operación aceptada.</summary>
        public static bool ContieneContacto(string texto) => PatronCorreo().IsMatch(texto) || PatronTelefono().IsMatch(texto);

        // ---------- consentimiento ----------

        public static ConsentimientoPublicacion NormalizarConsentimiento(Func<string, string?> texto, Func<string, bool?> logico, ConsentimientoPublicacion? baseC = null)
        {
            ConsentimientoPublicacion c = baseC is null ? new ConsentimientoPublicacion() : Copiar(baseC);
            string Revisar(string clave, string actual, int max)
            {
                string? valor = texto(clave);
                if (valor is null) return actual;
                if (valor.Length > max) throw ReglaNegocioException.Validacion($"{clave} no es válido (máximo {max} caracteres).");
                return valor.Trim();
            }
            c.Description = Revisar("description", c.Description, 1200);
            c.DeliveryZone = Revisar("deliveryZone", c.DeliveryZone, 120);
            c.BreederAlias = Revisar("breederAlias", c.BreederAlias, 60);
            c.HealthNote = Revisar("healthNote", c.HealthNote, 400);
            c.ShowPhoto = logico("showPhoto") ?? c.ShowPhoto;
            c.ShowGenealogy = logico("showGenealogy") ?? c.ShowGenealogy;
            c.ShowReproduction = logico("showReproduction") ?? c.ShowReproduction;
            c.ShowBreeder = logico("showBreeder") ?? c.ShowBreeder;
            c.ShareHistoryReproductive = logico("shareHistoryReproductive") ?? c.ShareHistoryReproductive;
            c.ShareHistoryHealth = logico("shareHistoryHealth") ?? c.ShareHistoryHealth;
            return c;
        }

        private static ConsentimientoPublicacion Copiar(ConsentimientoPublicacion o) => new()
        {
            Description = o.Description, DeliveryZone = o.DeliveryZone, ShowPhoto = o.ShowPhoto, ShowGenealogy = o.ShowGenealogy, ShowReproduction = o.ShowReproduction,
            ShowBreeder = o.ShowBreeder, BreederAlias = o.BreederAlias, HealthNote = o.HealthNote, ShareHistoryReproductive = o.ShareHistoryReproductive, ShareHistoryHealth = o.ShareHistoryHealth,
        };

        // ---------- ficha pública y huella ----------

        public static string Alias(string idUsuario, string? nombre) =>
            !string.IsNullOrWhiteSpace(nombre) ? nombre.Trim() : $"Criador-{idUsuario.Replace("-", "")[..5].ToUpperInvariant()}";

        private static readonly string[] Especies = ["Gallinas", "Patos", "Gansos", "Pavos", "Codornices", "Pintadas", "Palomas", "Otras"];
        public static string Especie(string? valor) => valor is not null && Especies.Contains(valor) ? valor : "Gallinas";

        public static JsonObject? BuscarAve(DocumentoGranja doc, string? id) => doc.Buscar("birds", id);

        public static int? AnilloActual(DocumentoGranja doc, string aveId)
        {
            foreach (JsonObject anillo in doc.Lista("rings").OfType<JsonObject>())
                if (DocumentoGranja.Texto(anillo["birdId"]) == aveId && DocumentoGranja.Texto(anillo["status"]) == "Asignado" && string.IsNullOrEmpty(DocumentoGranja.Texto(anillo["endedAt"])))
                    return (int)DocumentoGranja.Numero(anillo["number"]);
            return null;
        }

        private static string T(JsonObject o, string clave) => DocumentoGranja.Texto(o[clave]) ?? string.Empty;

        public static Ancestro? AncestroDe(DocumentoGranja doc, string? id, int profundidad)
        {
            if (string.IsNullOrEmpty(id)) return null;
            JsonObject? ave = BuscarAve(doc, id);
            if (ave is null) return null;
            var a = new Ancestro { Name = T(ave, "name"), Code = T(ave, "code"), Breed = T(ave, "breed"), Sex = T(ave, "sex"), Species = Especie(DocumentoGranja.Texto(ave["species"])) };
            if (profundidad > 1)
            {
                a.Mother = AncestroDe(doc, T(ave, "motherId"), profundidad - 1);
                a.Father = AncestroDe(doc, T(ave, "fatherId"), profundidad - 1);
            }
            return a;
        }

        public static string EdadTexto(string nacio, string? estimada, DateTime ahora)
        {
            string respaldo = string.IsNullOrWhiteSpace(estimada) ? "Edad no registrada" : estimada;
            if (string.IsNullOrEmpty(nacio)) return respaldo;
            if (!DateTime.TryParseExact(nacio, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTime fecha)) return respaldo;
            int dias = Math.Max(0, (int)Math.Floor((ahora - fecha.AddHours(12)).TotalDays));
            if (dias < 45) return $"{dias} día{(dias == 1 ? "" : "s")}";
            int meses = (int)Math.Floor(dias / 30.4375);
            if (meses < 24) return $"{meses} meses";
            int anios = meses / 12, resto = meses % 12;
            return resto > 0 ? $"{anios} años y {resto} meses" : $"{anios} años";
        }

        private static string Sha(string texto) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(texto))).ToLowerInvariant();

        private static JsonNode? NodoAncestro(Ancestro? a)
        {
            if (a is null) return null;
            var o = new JsonObject { ["name"] = a.Name, ["code"] = a.Code, ["breed"] = a.Breed, ["sex"] = a.Sex, ["species"] = a.Species };
            if (a.Mother is not null) o["mother"] = NodoAncestro(a.Mother);
            if (a.Father is not null) o["father"] = NodoAncestro(a.Father);
            return o;
        }

        /// <summary>Huella de los datos de la ficha que alimentan una publicación (sin notas privadas). Es la misma que calcula la app actual. Null si el ave ya no existe.</summary>
        public static string? HuellaAve(DocumentoGranja doc, string aveId)
        {
            JsonObject? ave = BuscarAve(doc, aveId);
            if (ave is null) return null;
            int? anillo = AnilloActual(doc, aveId);
            var huella = new JsonObject
            {
                ["name"] = T(ave, "name"), ["code"] = T(ave, "code"), ["sex"] = T(ave, "sex"), ["breed"] = T(ave, "breed"), ["bornAt"] = T(ave, "bornAt"), ["status"] = T(ave, "status"),
                ["ring"] = anillo, ["photo"] = Sha(T(ave, "photo")),
                ["mother"] = NodoAncestro(AncestroDe(doc, T(ave, "motherId"), 2)), ["father"] = NodoAncestro(AncestroDe(doc, T(ave, "fatherId"), 2)),
            };
            return Sha(huella.ToJsonString(new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        }

        public static string ColeccionExistencias(string tipo) => tipo switch
        {
            TipoPublicacion.LotePollitos => "chickLots",
            TipoPublicacion.LoteHuevos => "fertileLots",
            TipoPublicacion.Insumo => "customProducts",
            _ => throw ReglaNegocioException.Validacion("Tipo de existencias no válido."),
        };

        public static string? HuellaPublicacion(DocumentoGranja doc, string tipo, IReadOnlyList<ElementoPublicado> elementos)
        {
            if (tipo is TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo)
            {
                var item = elementos[0];
                JsonObject? lote = doc.Buscar(ColeccionExistencias(tipo), item.LotId);
                if (lote is null) return null;
                var datos = new JsonObject { ["code"] = T(lote, "code"), ["breed"] = T(lote, tipo == TipoPublicacion.Insumo ? "category" : "breed"), ["enough"] = DocumentoGranja.Numero(lote["available"]) >= item.Quantity, ["fertility"] = tipo == TipoPublicacion.LoteHuevos ? lote["fertility"]?.DeepClone() : null, ["productType"] = tipo == TipoPublicacion.LoteHuevos ? lote["productType"]?.DeepClone() : null };
                return Sha(datos.ToJsonString(JsonMercado.Opciones));
            }
            if (tipo != TipoPublicacion.Ave && tipo != TipoPublicacion.LoteAves) return null;
            var partes = elementos.Select(e => HuellaAve(doc, e.BirdId ?? string.Empty)).ToList();
            if (partes.Any(p => p is null)) return null;
            if (tipo == TipoPublicacion.Ave) return partes[0];
            var arreglo = new JsonArray(partes.Select(p => (JsonNode?)JsonValue.Create(p)).ToArray());
            return Sha(arreglo.ToJsonString());
        }

        /// <summary>La vista pública se arma desde la ficha real del vendedor y solo con campos de la lista permitida.</summary>
        public static (FichaPublica Ficha, string Huella) ConstruirFicha(DocumentoGranja doc, string tipo, IReadOnlyList<ElementoPublicado> elementos, ConsentimientoPublicacion consentimiento, string aliasVendedor, DateTime ahora)
        {
            string huella = HuellaPublicacion(doc, tipo, elementos) ?? throw ReglaNegocioException.Validacion("Una de las fuentes de la publicación ya no existe en la ficha.");
            if (tipo == TipoPublicacion.Ave) return (FichaAve(doc, elementos[0].BirdId!, consentimiento, aliasVendedor, ahora), huella);
            if (tipo is TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo)
            {
                var item = elementos[0];
                JsonObject lote = doc.Buscar(ColeccionExistencias(tipo), item.LotId)!;
                string raza = T(lote, tipo == TipoPublicacion.Insumo ? "category" : "breed");
                string unidad = tipo == TipoPublicacion.LotePollitos ? "pollitos" : T(lote, "productType") == "Huevo consumo" ? "huevos de consumo" : "huevos fértiles";
                string tituloLote = tipo == TipoPublicacion.Insumo ? $"{T(lote, "name")} · {item.Quantity} {T(lote, "unit")}" : $"Lote de {item.Quantity} {unidad}{(raza.Length > 0 ? " " + raza : "")}";
                string nacio = tipo == TipoPublicacion.LotePollitos && doc.Buscar("births", T(lote, "birthId")) is { } nacimiento ? T(nacimiento, "date") : "";
                var fichaLote = new FichaPublica { Name = tituloLote, Title = tituloLote, ItemType = tipo, Quantity = item.Quantity, Code = T(lote, "code"), Ring = null, Breed = raza.Length > 0 ? raza : "No registrada", Sex = "Mixto", BornAt = nacio, AgeLabel = nacio.Length > 0 ? EdadTexto(nacio, null, ahora) : "" };
                if (tipo == TipoPublicacion.LoteHuevos) fichaLote.Fertility = T(lote, "fertility");
                if (tipo == TipoPublicacion.Insumo) fichaLote.Sex = "No aplica";
                BaseDeLote(fichaLote, consentimiento, aliasVendedor);
                return (fichaLote, huella);
            }

            List<JsonObject> aves = elementos.Select(e => BuscarAve(doc, e.BirdId)!).ToList();
            string[] razas = aves.Select(a => T(a, "breed")).Distinct().ToArray(), sexos = aves.Select(a => T(a, "sex")).Distinct().ToArray();
            string[] tipos = aves.Select(a => Especie(DocumentoGranja.Texto(a["species"]))).Distinct().ToArray();
            string sustantivo = tipos.Length == 1 && tipos[0] != "Gallinas" ? tipos[0].ToLowerInvariant() : "aves";
            string titulo = $"Lote de {aves.Count} {sustantivo}{(razas.Length == 1 ? " " + razas[0] : "")}";
            var ficha = new FichaPublica
            {
                Name = titulo, Title = titulo, ItemType = tipo, Quantity = aves.Count, Code = string.Empty, Ring = null,
                Breed = razas.Length == 1 ? razas[0] : "Mixta", Sex = sexos.Length == 1 ? sexos[0] : "Mixto", Species = tipos.Length == 1 ? tipos[0] : null,
                BornAt = string.Empty, AgeLabel = string.Empty,
                LotBirds = aves.Select(a => new AveDeLote { Name = T(a, "name"), Code = T(a, "code"), Sex = T(a, "sex"), Breed = T(a, "breed"), AgeLabel = EdadTexto(T(a, "bornAt"), DocumentoGranja.Texto(a["ageEstimate"]), ahora) }).ToList(),
            };
            BaseDeLote(ficha, consentimiento, aliasVendedor);
            return (ficha, huella);
        }

        private static void BaseDeLote(FichaPublica ficha, ConsentimientoPublicacion c, string alias)
        {
            ficha.Description = c.Description;
            ficha.DeliveryZone = c.DeliveryZone;
            ficha.DeclaredBySeller = true;
            if (c.HealthNote.Length > 0) ficha.HealthNote = c.HealthNote;
            if (c.ShowBreeder) ficha.Breeder = c.BreederAlias.Length > 0 ? c.BreederAlias : alias;
        }

        private static FichaPublica FichaAve(DocumentoGranja doc, string aveId, ConsentimientoPublicacion c, string alias, DateTime ahora)
        {
            JsonObject ave = BuscarAve(doc, aveId) ?? throw ReglaNegocioException.Validacion("El ave no existe en la ficha.");
            var ficha = new FichaPublica
            {
                Name = T(ave, "name"), Code = T(ave, "code"), Ring = AnilloActual(doc, aveId), Breed = T(ave, "breed"), Sex = T(ave, "sex"),
                Species = Especie(DocumentoGranja.Texto(ave["species"])), BornAt = T(ave, "bornAt"), AgeLabel = EdadTexto(T(ave, "bornAt"), DocumentoGranja.Texto(ave["ageEstimate"]), ahora),
            };
            BaseDeLote(ficha, c, alias);
            // El linaje (padres, abuelos y bisabuelos registrados) siempre es público: el comprador lo necesita para decidir.
            Ancestro? madre = AncestroDe(doc, T(ave, "motherId"), 3), padre = AncestroDe(doc, T(ave, "fatherId"), 3);
            if (madre is not null || padre is not null) ficha.Genealogy = new GenealogiaPublica { Mother = madre, Father = padre };
            if (c.ShowReproduction)
                ficha.OffspringCount = doc.Lista("births").OfType<JsonObject>().Where(n => T(n, "motherId") == aveId || T(n, "fatherId") == aveId).Sum(n => (int)DocumentoGranja.Numero(n["count"]));
            // La granja guarda enlaces a las fotos, no archivos: solo se muestra si es un enlace seguro.
            string foto = T(ave, "photo");
            if (c.ShowPhoto && ((foto.StartsWith("/api/media/", StringComparison.Ordinal) && Guid.TryParse(foto[11..], out _)) || (Uri.TryCreate(foto, UriKind.Absolute, out Uri? uri) && uri.Scheme == Uri.UriSchemeHttps))) ficha.PhotoUrl = foto;
            return ficha;
        }

        // ---------- reputación ----------

        /// <summary>Promedio con tope por pareja valorador→valorado: evita inflarlo entre cuentas amigas.</summary>
        public static Reputacion Reputacion(IEnumerable<Valoracion> valoraciones, int completadas)
        {
            var porPareja = new Dictionary<string, int>();
            int[] distribucion = new int[5];
            int suma = 0, cuenta = 0;
            foreach (Valoracion v in valoraciones.OrderBy(v => v.CreatedAt, StringComparer.Ordinal))
            {
                string clave = $"{v.RaterId}>{v.RateeId}";
                porPareja.TryGetValue(clave, out int usadas);
                if (usadas >= TopePorPareja) continue;
                porPareja[clave] = usadas + 1;
                suma += v.Stars; cuenta++; distribucion[v.Stars - 1]++;
            }
            return new Reputacion(cuenta, cuenta > 0 ? Math.Round((double)suma / cuenta, 1, MidpointRounding.AwayFromZero) : 0, completadas, distribucion);
        }

        public static string? CompletadaEn(Operacion op) => op.History.FirstOrDefault(p => p.Status == EstadoOperacion.Completada)?.At;

        // ---------- códigos y huellas de comprobantes ----------

        public static string CodigoAleatorio(string prefijo, DateTime ahora)
        {
            const string letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            byte[] bytes = RandomNumberGenerator.GetBytes(6);
            return $"{prefijo}-{ahora:yyyyMMdd}-{new string(bytes.Select(b => letras[b % letras.Length]).ToArray())}";
        }

        /// <summary>JSON con claves ordenadas en todos los niveles: la huella no depende del orden de inserción.</summary>
        public static string Canonico(JsonNode? nodo) => nodo switch
        {
            null => "null",
            JsonArray lista => "[" + string.Join(",", lista.Select(Canonico)) + "]",
            JsonObject objeto => "{" + string.Join(",", objeto.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => $"{System.Text.Json.JsonSerializer.Serialize(p.Key, JsonMercado.Opciones)}:{Canonico(p.Value)}")) + "}",
            _ => nodo.ToJsonString(JsonMercado.Opciones),
        };

        public static string Huella(JsonNode contenido) => Sha(Canonico(contenido));
    }
}
