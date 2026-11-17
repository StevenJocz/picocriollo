using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.MercadoD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Persistence.Mercado;

namespace PicoCriollo.Persistence.Commands
{
    public class PublicacionGuardadaDto
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")] public string Id { get; set; } = null!;
        [System.Text.Json.Serialization.JsonPropertyName("status")] public string Status { get; set; } = null!;
        [System.Text.Json.Serialization.JsonPropertyName("version")] public int Version { get; set; }
    }

    public interface IPublicacionCommands
    {
        Task<PublicacionGuardadaDto> CrearAsync(Guid usuario, PublicacionNuevaDto dto);
        Task<PublicacionGuardadaDto> PublicarAsync(Guid usuario, string id);
        Task<PublicacionGuardadaDto> PausarAsync(Guid usuario, string id);
        Task<PublicacionGuardadaDto> ReanudarAsync(Guid usuario, string id);
        Task<PublicacionGuardadaDto> RetirarAsync(Guid usuario, string id);
        Task<PublicacionGuardadaDto> ActualizarFichaAsync(Guid usuario, string id);
        Task<PublicacionGuardadaDto> ActualizarAsync(Guid usuario, string id, PublicacionCambioDto dto);
        Task MostrarInteresAsync(Guid usuario, string publicacionId, InteresDto dto);
        Task RetirarInteresAsync(Guid usuario, string publicacionId);
    }

    /// <summary>
    /// Publicaciones del mercado: borrador, publicar, pausar, retirar y editar, más los interesados. Todo se valida aquí: la
    /// ficha pública se arma desde la granja real del vendedor y el ave queda bloqueada mientras esté publicada.
    /// Fotos propias del anuncio y fotos de las aves seleccionadas.
    /// </summary>
    public class PublicacionCommands : IPublicacionCommands
    {
        private readonly AlmacenMercado _a;

        public PublicacionCommands(AlmacenMercado almacen) => _a = almacen;

        // ---------- crear y publicar ----------

        public Task<PublicacionGuardadaDto> CrearAsync(Guid usuario, PublicacionNuevaDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            var (tipo, elementos) = Elementos(dto);
            if (dto.Kind is not (TipoPublicacion.PrecioFijo or TipoPublicacion.Subasta or TipoPublicacion.Interes)) throw ReglaNegocioException.Validacion("Tipo de publicación no válido.");
            (ReglasSubasta Reglas, string Abre, string Cierra)? subasta = null;
            if (dto.Kind == TipoPublicacion.Subasta)
            {
                SubastaDto s = dto.Auction ?? throw ReglaNegocioException.Validacion("Indica el precio inicial y la fecha de cierre de la subasta.");
                subasta = ReglasMercado.NormalizarSubasta(s.StartingPrice, s.MinIncrement, s.ReservePrice, s.AntiSniping, s.OpensAt, s.ClosesAt, _a.Ahora);
            }
            long precio = PrecioValido(dto.Kind, subasta?.Reglas.StartingPrice ?? dto.Price);

            await _a.AsegurarActivaAsync(yo);
            await _a.LimitarUsoAsync(yo, "listing.create", 20, TimeSpan.FromDays(1), "publicaciones nuevas por día");
            var granja = DocumentoGranja.Desde((await AyudasOperacion.GranjaAsync(_a, yo)).Datos);
            if (elementos.Any(e => IdsDeMuestra(granja).Contains(e.BirdId ?? e.LotId ?? "")))
                throw ReglaNegocioException.Validacion("Los registros ficticios de muestra no se pueden publicar en el mercado. Registra un ave o lote real para crear una publicación.");

            string id = Guid.NewGuid().ToString();
            await ValidarFuentesAsync(yo, granja, tipo, elementos, id, "crear");
            string en = JsonMercado.Iso(_a.Ahora);
            var publicacion = new Publicacion
            {
                Id = id, BirdId = tipo == TipoPublicacion.Ave ? elementos[0].BirdId! : $"lote:{id}", ItemType = tipo, Items = elementos, SellerId = yo, Kind = dto.Kind,
                Status = EstadoPublicacion.Borrador, Consent = Consentimiento(dto.Consent, null), Price = precio, Terms = (dto.Terms ?? string.Empty).Trim(),
                CreatedAt = en, UpdatedAt = en, Version = 1,
            };
            if (subasta is { } sub) { publicacion.Auction = sub.Reglas; publicacion.OpensAt = sub.Abre; publicacion.ClosesAt = sub.Cierra; }
            publicacion.PhotoIds = await FotosPropiasAsync(yo, dto.PhotoIds ?? []);
            await LlenarFichaAsync(publicacion, granja);
            _a.Publicaciones.Insertar(publicacion);
            _a.Auditar(yo, "listing.create", "listing", id, new { kind = dto.Kind, itemType = tipo });
            if (dto.Publish) await PublicarEnLaOrdenAsync(publicacion, false);
            return Guardada(publicacion);
        });

        public Task<PublicacionGuardadaDto> PublicarAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            Publicacion p = await MiaAsync(id, usuario);
            if (p.Status != EstadoPublicacion.Borrador) throw ReglaNegocioException.Conflicto("Solo se puede publicar un borrador.");
            await PublicarEnLaOrdenAsync(p, true);
            return Guardada(p);
        });

        public Task<PublicacionGuardadaDto> PausarAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            Publicacion p = await MiaAsync(id, usuario);
            if (p.Status != EstadoPublicacion.Publicada) throw ReglaNegocioException.Conflicto("Solo se puede pausar una publicación activa.");
            await SinOfertasAsync(p, "No puedes pausar una subasta con ofertas: sus condiciones no se pueden alterar.");
            p.Status = EstadoPublicacion.Pausada;
            Tocar(p);
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(p.SellerId, "listing.pause", "listing", p.Id);
            return Guardada(p);
        });

        public Task<PublicacionGuardadaDto> ReanudarAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            Publicacion p = await MiaAsync(id, usuario);
            if (p.Status != EstadoPublicacion.Pausada) throw ReglaNegocioException.Conflicto("Solo se puede reanudar una publicación pausada.");
            if (p.NeedsReview) throw ReglaNegocioException.Conflicto("La ficha cambió. Actualiza la publicación antes de reanudarla.");
            ValidarFotos(p);
            p.Status = EstadoPublicacion.Publicada;
            Tocar(p);
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(p.SellerId, "listing.resume", "listing", p.Id);
            return Guardada(p);
        });

        public Task<PublicacionGuardadaDto> RetirarAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            Publicacion p = await MiaAsync(id, usuario);
            if (!EstadoPublicacion.Editables.Contains(p.Status)) throw ReglaNegocioException.Conflicto("Esta publicación ya no se puede retirar.");
            await SinOfertasAsync(p, "Esta subasta tiene ofertas: usa «Cancelar subasta», que exige motivo y avisa a los postores.");
            await _a.LiberarAsync(p.Id);
            p.Status = EstadoPublicacion.Retirada;
            Tocar(p);
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(p.SellerId, "listing.withdraw", "listing", p.Id);
            return Guardada(p);
        });

        public Task<PublicacionGuardadaDto> ActualizarFichaAsync(Guid usuario, string id) => _a.EjecutarAsync(async () =>
        {
            Publicacion p = await MiaAsync(id, usuario);
            if (!EstadoPublicacion.Editables.Contains(p.Status)) throw ReglaNegocioException.Conflicto("Esta publicación no se puede actualizar.");
            await SinOfertasAsync(p, "Una subasta con ofertas no se puede modificar en silencio.");
            var granja = DocumentoGranja.Desde((await AyudasOperacion.GranjaAsync(_a, p.SellerId)).Datos);
            if (ReglasMercado.HuellaPublicacion(granja, p.Tipo, p.Elementos) is null)
                throw ReglaNegocioException.Conflicto("Una fuente de la publicación ya no existe en tu granja. Retira la publicación.");
            await LlenarFichaAsync(p, granja);
            if (p.Status == EstadoPublicacion.Publicada) ValidarFotos(p);
            Tocar(p);
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(p.SellerId, "listing.refresh", "listing", p.Id);
            return Guardada(p);
        });

        public Task<PublicacionGuardadaDto> ActualizarAsync(Guid usuario, string id, PublicacionCambioDto dto) => _a.EjecutarAsync(async () =>
        {
            Publicacion p = await MiaAsync(id, usuario);
            if (!EstadoPublicacion.Editables.Contains(p.Status)) throw ReglaNegocioException.Conflicto("Esta publicación no se puede editar.");
            await SinOfertasAsync(p, "Una subasta con ofertas no se puede editar.");
            if (p.Kind == TipoPublicacion.Subasta && dto.Price is not null) throw ReglaNegocioException.Validacion("Para cambiar las reglas de la subasta, retírala y crea otra.");
            long precioAntes = p.Price;
            string condicionesAntes = p.Terms;
            long precio = PrecioValido(p.Kind, dto.Price ?? p.Price);
            if (precio != p.Price && (await _a.Operaciones.ListarAsync("listingId", p.Id)).Any(o => o.Status is not (EstadoOperacion.Cancelada or EstadoOperacion.Completada)))
                throw ReglaNegocioException.Conflicto("Hay solicitudes u operaciones abiertas sobre esta publicación: respóndelas antes de cambiar el precio.");
            p.Price = precio;
            if (dto.Terms is not null) p.Terms = dto.Terms.Trim();
            if (dto.Consent is not null) p.Consent = Consentimiento(dto.Consent, p.Consent);
            if (dto.PhotoIds is not null) p.PhotoIds = await FotosPropiasAsync(p.SellerId, dto.PhotoIds);
            if (dto.Consent is not null || dto.PhotoIds is not null)
                await LlenarFichaAsync(p, DocumentoGranja.Desde((await AyudasOperacion.GranjaAsync(_a, p.SellerId)).Datos));
            if (p.Status == EstadoPublicacion.Publicada) ValidarFotos(p);
            Tocar(p);
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(p.SellerId, "listing.update", "listing", p.Id, new { before = new { price = precioAntes, terms = condicionesAntes }, after = new { price = p.Price, terms = p.Terms } });
            return Guardada(p);
        });

        // ---------- interesados ----------

        public Task MostrarInteresAsync(Guid usuario, string publicacionId, InteresDto dto) => _a.EjecutarAsync(async () =>
        {
            string yo = usuario.ToString();
            await _a.AsegurarActivaAsync(yo);
            Publicacion p = await _a.Publicaciones.ObtenerAsync(publicacionId, true) is { Status: EstadoPublicacion.Publicada } publicada
                ? publicada : throw ReglaNegocioException.NoEncontrado("Esta publicación no está disponible.");
            if (p.SellerId == yo) throw ReglaNegocioException.Prohibido("No puedes mostrar interés en tu propia publicación.");
            string texto = (dto.Message ?? string.Empty).Trim();
            string en = JsonMercado.Iso(_a.Ahora);
            Interes? existente = (await _a.Intereses.ListarAsync(("listingId", publicacionId), ("userId", yo))).FirstOrDefault();
            if (existente?.Status == "activo") return;
            Interes interes;
            if (existente is not null)
            {
                interes = existente;
                interes.Status = "activo"; interes.Message = texto; interes.Revision += 1; interes.UpdatedAt = en;
                _a.Intereses.Actualizar(interes);
            }
            else
            {
                interes = new Interes { Id = Guid.NewGuid().ToString(), ListingId = publicacionId, UserId = yo, Message = texto, CreatedAt = en, UpdatedAt = en };
                _a.Intereses.Insertar(interes);
            }
            await _a.EmitirAsync("market.interest.created", "listing", publicacionId, new { listingId = publicacionId, interestId = interes.Id }, $"interest:{interes.Id}:{interes.Revision}");
        });

        public Task RetirarInteresAsync(Guid usuario, string publicacionId) => _a.EjecutarAsync(async () =>
        {
            Interes? interes = (await _a.Intereses.ListarAsync(("listingId", publicacionId), ("userId", usuario.ToString()))).FirstOrDefault();
            if (interes is null || interes.Status == "retirado") throw ReglaNegocioException.NoEncontrado("No tienes interés registrado en esta publicación.");
            interes.Status = "retirado";
            interes.UpdatedAt = JsonMercado.Iso(_a.Ahora);
            _a.Intereses.Actualizar(interes);
        });

        // ---------- apoyo ----------

        private async Task<Publicacion> MiaAsync(string id, Guid usuario)
        {
            Publicacion p = await _a.Publicaciones.ObtenerAsync(id, true) ?? throw ReglaNegocioException.NoEncontrado("Publicación no encontrada.");
            if (p.SellerId != usuario.ToString()) throw ReglaNegocioException.Prohibido("Esta publicación no es tuya.");
            return p;
        }

        private void Tocar(Publicacion p)
        {
            p.UpdatedAt = JsonMercado.Iso(_a.Ahora);
            p.Version += 1;
        }

        private static PublicacionGuardadaDto Guardada(Publicacion p) => new() { Id = p.Id, Status = p.Status, Version = p.Version };

        private async Task SinOfertasAsync(Publicacion p, string mensaje)
        {
            if (p.Kind != TipoPublicacion.Subasta) return;
            if (ReglasMercado.Validas(await _a.Ofertas.ListarAsync("listingId", p.Id)).Any()) throw ReglaNegocioException.Conflicto(mensaje);
        }

        private static long PrecioValido(string tipo, long? precio)
        {
            if (tipo is TipoPublicacion.Interes) return 0;
            if (precio is not { } valor || valor <= 0 || valor > ReglasMercado.PrecioMaximo) throw ReglaNegocioException.Validacion("Indica un precio válido en pesos colombianos.");
            return valor;
        }

        private static HashSet<string> IdsDeMuestra(DocumentoGranja granja)
        {
            var ids = new HashSet<string>();
            if (granja.Raiz["demoContent"]?["idsByCollection"] is JsonObject colecciones)
                foreach (var par in colecciones)
                    if (par.Value is JsonArray lista) foreach (JsonNode? nodo in lista) if (DocumentoGranja.Texto(nodo) is { } id) ids.Add(id);
            return ids;
        }

        private static (string Tipo, List<ElementoPublicado> Elementos) Elementos(PublicacionNuevaDto dto)
        {
            string tipo = dto.ItemType ?? TipoPublicacion.Ave;
            switch (tipo)
            {
                case TipoPublicacion.Ave:
                    if (string.IsNullOrWhiteSpace(dto.BirdId)) throw ReglaNegocioException.Validacion("Selecciona un ave.");
                    return (tipo, [new ElementoPublicado { Type = TipoPublicacion.Ave, BirdId = dto.BirdId }]);
                case TipoPublicacion.LoteAves:
                    List<string> ids = dto.BirdIds ?? [];
                    if (ids.Any(string.IsNullOrWhiteSpace)) throw ReglaNegocioException.Validacion("Selecciona las aves del lote.");
                    List<string> unicos = ids.Distinct().ToList();
                    if (unicos.Count != ids.Count) throw ReglaNegocioException.Validacion("Hay aves repetidas en el lote.");
                    if (unicos.Count < 2) throw ReglaNegocioException.Validacion("Un lote de aves necesita al menos 2 aves. Para una sola ave usa «Un ave».");
                    if (unicos.Count > ReglasMercado.MaximoAvesPorLote) throw ReglaNegocioException.Validacion($"Un lote de aves admite como máximo {ReglasMercado.MaximoAvesPorLote} aves.");
                    return (tipo, unicos.Select(id => new ElementoPublicado { Type = TipoPublicacion.Ave, BirdId = id }).ToList());
                case TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo:
                    if (string.IsNullOrWhiteSpace(dto.LotId)) throw ReglaNegocioException.Validacion("Selecciona el lote o insumo de tu granja.");
                    if (dto.Quantity is null or < 1) throw ReglaNegocioException.Validacion("La cantidad debe ser un entero mayor que cero.");
                    return (tipo, [new ElementoPublicado { Type = tipo, LotId = dto.LotId, Quantity = dto.Quantity }]);
                default:
                    throw ReglaNegocioException.Validacion("Tipo de publicación no válido.");
            }
        }

        internal static ConsentimientoPublicacion Consentimiento(ConsentimientoDto? d, ConsentimientoPublicacion? baseC)
        {
            if (d is null) return baseC ?? new ConsentimientoPublicacion();
            return ReglasMercado.NormalizarConsentimiento(clave => clave switch
            {
                "description" => d.Description, "deliveryZone" => d.DeliveryZone, "breederAlias" => d.BreederAlias, "healthNote" => d.HealthNote, _ => null,
            }, clave => clave switch
            {
                "showPhoto" => d.ShowPhoto, "showGenealogy" => d.ShowGenealogy, "showReproduction" => d.ShowReproduction, "showBreeder" => d.ShowBreeder,
                "shareHistoryReproductive" => d.ShareHistoryReproductive, "shareHistoryHealth" => d.ShareHistoryHealth, _ => null,
            }, baseC);
        }

        private async Task LlenarFichaAsync(Publicacion p, DocumentoGranja granja)
        {
            string alias = await _a.AliasAsync(p.SellerId);
            var (ficha, huella) = ReglasMercado.ConstruirFicha(granja, p.Tipo, p.Elementos, p.Consent, alias, _a.Ahora);
            if (p.Consent.ShowPhoto)
            {
                ficha.PhotoUrls = (await FotosPropiasAsync(p.SellerId, p.PhotoIds ?? [])).Select(id => "/api/media/" + id).ToList();
                if (ficha.PhotoUrl is { Length: > 0 } principal) ficha.PhotoUrls.Add(principal);
                if (p.Tipo == TipoPublicacion.LoteAves)
                    foreach (var item in p.Elementos)
                    {
                        var ave = ReglasMercado.ConstruirFicha(granja, TipoPublicacion.Ave, [item], p.Consent, alias, _a.Ahora).Ficha;
                        if (ave.PhotoUrl is { Length: > 0 } foto) ficha.PhotoUrls.Add(foto);
                    }
                ficha.PhotoUrls = ficha.PhotoUrls.Distinct().ToList();
                ficha.PhotoUrl = ficha.PhotoUrls.FirstOrDefault();
                ficha.PhotoIds = p.PhotoIds;
            }
            p.Snapshot = ficha;
            p.SourceHash = huella;
            p.NeedsReview = false;
        }

        private async Task<List<string>> FotosPropiasAsync(string usuario, List<string> ids)
        {
            if (ids.Count > 10) throw ReglaNegocioException.Validacion("Puedes agregar hasta 10 fotos.");
            var unicas = ids.Distinct().ToList();
            foreach (var id in unicas)
            {
                var archivo = await _a.Archivos.ObtenerAsync(id);
                if (archivo is null || archivo.OwnerId != usuario || archivo.Kind != "image")
                    throw ReglaNegocioException.Validacion("Elige fotos que hayas subido con tu cuenta.");
            }
            return unicas;
        }

        private static void ValidarFotos(Publicacion p)
        {
            int minimo = p.Tipo == TipoPublicacion.LoteAves ? 2 : 1;
            int cantidad = p.Snapshot.PhotoUrls.Concat(p.Snapshot.PhotoUrl is { Length: > 0 } foto ? new[] { foto } : []).Distinct().Count();
            if (cantidad < minimo) throw ReglaNegocioException.Validacion(minimo == 2
                ? "Agrega al menos dos fotos distintas para publicar un lote de aves."
                : "Agrega al menos una foto para publicar en el mercado.");
        }

        /// <summary>
        /// Valida en el servidor que cada ave es del vendedor y está disponible. «crear» valida al crear el borrador;
        /// «publicar» revalida al bloquear y publicar (los errores son de conflicto).
        /// </summary>
        private async Task ValidarFuentesAsync(string vendedor, DocumentoGranja granja, string tipo, List<ElementoPublicado> elementos, string publicacionId, string modo)
        {
            foreach (ElementoPublicado e in elementos)
            {
                if (e.Type is TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo)
                {
                    JsonObject lote = granja.Buscar(ReglasMercado.ColeccionExistencias(e.Type), e.LotId) ?? throw (modo == "crear" ? ReglaNegocioException.Prohibido("Solo puedes publicar lotes de tu propia granja.") : ReglaNegocioException.Conflicto("El lote ya no existe en tu granja."));
                    decimal disponible = DocumentoGranja.Numero(lote["available"]);
                    int reservado = (await _a.Bloqueos.ListarAsync(("lotId", e.LotId!), ("status", "active"))).Where(b => b.ListingId != publicacionId).Sum(b => b.Quantity ?? 0);
                    if (e.Quantity > disponible - reservado) throw ReglaNegocioException.Conflicto($"Solo quedan {Math.Max(0, disponible - reservado)} unidades disponibles de este lote o insumo.");
                    continue;
                }
                string aveId = e.BirdId!;
                if (modo == "crear") await ComprobarPropiedadAsync(vendedor, granja, aveId);
                JsonObject ave = ReglasMercado.BuscarAve(granja, aveId) ?? throw ReglaNegocioException.Conflicto("El ave ya no existe en tu granja.");
                string estado = DocumentoGranja.Texto(ave["status"]) ?? string.Empty;
                string nombre = DocumentoGranja.Texto(ave["name"]) ?? string.Empty;
                if (ReglasMercado.EstadosAveBloqueados.Contains(estado)) throw ReglaNegocioException.Conflicto($"El ave está {estado.ToLowerInvariant()} y no se puede publicar.");
                if (modo == "crear" && await OtraPublicacionLaUsaAsync(vendedor, aveId, publicacionId))
                    throw ReglaNegocioException.Conflicto(tipo == TipoPublicacion.Ave ? "Esta ave ya tiene una publicación. Edítala o retírala primero." : $"«{nombre}» ya tiene una publicación. Retírala antes de incluirla en un lote.");
                if (modo == "publicar" && (await _a.Bloqueos.ListarAsync(("birdId", aveId), ("status", "active"))).Count > 0)
                    throw ReglaNegocioException.Conflicto("Esta ave ya tiene una publicación activa o una operación pendiente.");
            }
        }

        /// <summary>Comprueba la propiedad registrada de un ave; si aún no figura en el registro, la inscribe a nombre del usuario.</summary>
        private async Task ComprobarPropiedadAsync(string usuario, DocumentoGranja granja, string aveId)
        {
            if (ReglasMercado.BuscarAve(granja, aveId) is null) throw ReglaNegocioException.Prohibido("Solo puedes publicar aves de tu propia granja.");
            Propiedad? registrada = await _a.Propiedades.ObtenerAsync(aveId, true);
            if (registrada is not null && registrada.OwnerId != usuario) throw ReglaNegocioException.Prohibido("Solo puedes publicar aves de tu propia granja.");
            if (registrada is null)
            {
                string en = JsonMercado.Iso(_a.Ahora);
                _a.Propiedades.Insertar(new Propiedad { Id = aveId, OwnerId = usuario, Since = en });
                _a.Tramos.Insertar(new TramoDePropiedad { Id = $"{aveId}:{en}", BirdId = aveId, OwnerId = usuario, From = en });
            }
        }

        private async Task<bool> OtraPublicacionLaUsaAsync(string vendedor, string aveId, string exceptoId) =>
            (await _a.Publicaciones.ListarAsync("sellerId", vendedor)).Any(p => p.Id != exceptoId && EstadoPublicacion.Activos.Contains(p.Status) && p.Elementos.Any(e => e.Type == TipoPublicacion.Ave && e.BirdId == aveId));

        private async Task PublicarEnLaOrdenAsync(Publicacion p, bool llenarFicha)
        {
            bool reservaLote = p.Tipo is TipoPublicacion.LotePollitos or TipoPublicacion.LoteHuevos or TipoPublicacion.Insumo;
            var entidadGranja = await AyudasOperacion.GranjaAsync(_a, p.SellerId, seguimiento: reservaLote);
            var granja = DocumentoGranja.Desde(entidadGranja.Datos);
            await ValidarFuentesAsync(p.SellerId, granja, p.Tipo, p.Elementos, p.Id, "publicar");
            if (reservaLote)
            {
                // La versión compartida evita confirmar dos reservas sobre las mismas existencias.
                entidadGranja.Version += 1;
                entidadGranja.ActualizadoEn = _a.Ahora;
            }
            if (p.Kind == TipoPublicacion.Subasta)
            {
                DateTime inicio = p.OpensAt is null ? _a.Ahora : DateTime.Compare(JsonMercado.Fecha(p.OpensAt), _a.Ahora) > 0 ? JsonMercado.Fecha(p.OpensAt) : _a.Ahora;
                if (p.ClosesAt is null || JsonMercado.Fecha(p.ClosesAt) - inicio < ReglasMercado.DuracionMinima)
                    throw ReglaNegocioException.Conflicto("La fecha de cierre ya pasó o es demasiado próxima. Crea la subasta de nuevo con otra fecha.");
                p.OpensAt = JsonMercado.Iso(inicio);
            }
            if (llenarFicha) await LlenarFichaAsync(p, granja);
            ValidarFotos(p);
            string en = JsonMercado.Iso(_a.Ahora);
            foreach (ElementoPublicado e in p.Elementos)
                _a.Bloqueos.Insertar(new Bloqueo { Id = Guid.NewGuid().ToString(), BirdId = e.BirdId ?? p.BirdId, LotId = e.LotId, Quantity = e.Quantity, ListingId = p.Id, CreatedAt = en });
            p.Status = EstadoPublicacion.Publicada;
            p.PublishedAt = en;
            Tocar(p);
            _a.Publicaciones.Actualizar(p);
            _a.Auditar(p.SellerId, "listing.publish", "listing", p.Id, new { price = p.Price, kind = p.Kind });
            await _a.EmitirAsync("market.listing.published", "listing", p.Id, new { listingId = p.Id }, $"listing-published:{p.Id}:{p.Version}");
        }
    }
}
