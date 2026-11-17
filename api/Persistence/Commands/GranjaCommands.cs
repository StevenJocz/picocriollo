using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using PicoCriollo.Infrastructure;
using PicoCriollo.Persistence.Mercado;
using static PicoCriollo.Domain.Utilidades.ReglasGranja;

namespace PicoCriollo.Persistence.Commands
{
    public interface IGranjaCommands
    {
        Task<RegistroGuardadoDto> CrearGallineroAsync(Guid usuario, GallineroDto dto);
        Task<RegistroGuardadoDto> ActualizarGallineroAsync(Guid usuario, string id, GallineroDto dto);
        Task<RegistroGuardadoDto> EliminarGallineroAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearAveAsync(Guid usuario, AveDto dto);
        Task<RegistroGuardadoDto> ActualizarAveAsync(Guid usuario, string id, AveDto dto);
        Task<RegistroGuardadoDto> EliminarAveAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearRecoleccionAsync(Guid usuario, RecoleccionDto dto);
        Task<RegistroGuardadoDto> ActualizarRecoleccionAsync(Guid usuario, string id, RecoleccionDto dto);
        Task<RegistroGuardadoDto> EliminarRecoleccionAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearIncubacionAsync(Guid usuario, IncubacionDto dto);
        Task<RegistroGuardadoDto> ActualizarIncubacionAsync(Guid usuario, string id, IncubacionDto dto);
        Task<RegistroGuardadoDto> EliminarIncubacionAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearCompraAsync(Guid usuario, CompraDto dto);
        Task<RegistroGuardadoDto> ActualizarCompraAsync(Guid usuario, string id, CompraDto dto);
        Task<RegistroGuardadoDto> EliminarCompraAsync(Guid usuario, string id);
        Task<RegistroGuardadoDto> RegistrarConsumoAsync(Guid usuario, ConsumoDto dto);

        Task<RegistroGuardadoDto> CrearTareaAsync(Guid usuario, TareaDto dto);
        Task<RegistroGuardadoDto> ActualizarTareaAsync(Guid usuario, string id, TareaDto dto);
        Task<RegistroGuardadoDto> EliminarTareaAsync(Guid usuario, string id);
        Task<RegistroGuardadoDto> CompletarTareaAsync(Guid usuario, string id, CompletarTareaDto dto);

        Task<RegistroGuardadoDto> CrearNacimientoAsync(Guid usuario, NacimientoDto dto);
        Task<RegistroGuardadoDto> ActualizarNacimientoAsync(Guid usuario, string id, NacimientoDto dto);
        Task<RegistroGuardadoDto> EliminarNacimientoAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearGrupoReproductorAsync(Guid usuario, GrupoReproductorDto dto);
        Task<RegistroGuardadoDto> ActualizarGrupoReproductorAsync(Guid usuario, string id, GrupoReproductorDto dto);
        Task<RegistroGuardadoDto> EliminarGrupoReproductorAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> AsignarAnilloAsync(Guid usuario, AsignarAnilloDto dto);
        Task<RegistroGuardadoDto> RetirarAnilloAsync(Guid usuario, RetirarAnilloDto dto);
        Task<RegistroGuardadoDto> InhabilitarAnilloAsync(Guid usuario, InhabilitarAnilloDto dto);
        Task<RegistroGuardadoDto> ActivarAnilloAsync(Guid usuario, ActivarAnilloDto dto);

        Task<RegistroGuardadoDto> RegistrarEventoAveAsync(Guid usuario, EventoAveDto dto);

        Task<RegistroGuardadoDto> CrearClienteAsync(Guid usuario, ClienteDto dto);
        Task<RegistroGuardadoDto> ActualizarClienteAsync(Guid usuario, string id, ClienteDto dto);
        Task<RegistroGuardadoDto> EliminarClienteAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearProductoAsync(Guid usuario, ProductoDto dto);
        Task<RegistroGuardadoDto> ActualizarProductoAsync(Guid usuario, string id, ProductoDto dto);
        Task<RegistroGuardadoDto> EliminarProductoAsync(Guid usuario, string id);

        Task<RegistroGuardadoDto> CrearLoteHuevosAsync(Guid usuario, LoteHuevosNuevoDto dto);
        Task<RegistroGuardadoDto> DividirLoteHuevosAsync(Guid usuario, string id, DividirLoteDto dto);
        Task<RegistroGuardadoDto> ActualizarLoteHuevosAsync(Guid usuario, string id, LoteHuevosCambioDto dto);

        Task<RegistroGuardadoDto> RegistrarVentaAsync(Guid usuario, VentaNuevaDto dto);
        Task<RegistroGuardadoDto> AnularVentaAsync(Guid usuario, string id);
        Task<RegistroGuardadoDto> RegistrarAbonoAsync(Guid usuario, string id, AbonoDto dto);
        Task<RegistroGuardadoDto> DevolverLineaAsync(Guid usuario, string id, DevolucionDto dto);
    }

    /// <summary>
    /// Reglas de «Mi granja» en el servidor. Antes vivían en el navegador (useFarm.saveRecord/deleteRecord) y el servidor solo
    /// guardaba el documento entero; ahora cada cambio llega como una orden y se valida aquí. Cada orden carga el documento,
    /// lo cambia en memoria y lo guarda con control de versión: dos cambios simultáneos no se pisan, el segundo recibe un conflicto.
    /// </summary>
    public partial class GranjaCommands : IGranjaCommands
    {
        private const int LimiteBytes = 12 * 1024 * 1024;

        private readonly DBContext _contexto;
        private readonly IMercadoGuardia _mercado;
        private readonly TimeProvider _tiempo;

        public GranjaCommands(DBContext contexto, IMercadoGuardia mercado, TimeProvider tiempo)
        {
            _contexto = contexto;
            _mercado = mercado;
            _tiempo = tiempo;
        }

        private DateTime Ahora => _tiempo.GetUtcNow().UtcDateTime;

        // ---------- gallineros ----------

        public Task<RegistroGuardadoDto> CrearGallineroAsync(Guid usuario, GallineroDto dto) => Modificar(usuario, "Gallinero creado.", (doc, _) =>
        {
            JsonObject fila = CamposGallinero(dto);
            return Task.FromResult(Insertar(doc, "coops", "gal", "GAL", fila));
        });

        public Task<RegistroGuardadoDto> ActualizarGallineroAsync(Guid usuario, string id, GallineroDto dto) => Modificar(usuario, "Gallinero actualizado.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "coops", id);
            Fusionar(fila, CamposGallinero(dto));
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarGallineroAsync(Guid usuario, string id) => Modificar(usuario, "Gallinero eliminado.", (doc, _) =>
        {
            Fila(doc, "coops", id);
            if (Alguna(doc, "birds", ave => Texto(ave, "coopId") == id))
                throw ReglaNegocioException.Conflicto("Este gallinero aún tiene aves asociadas. Reubícalas o elimina sus fichas antes de eliminarlo.");
            doc.Quitar("coops", id);
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposGallinero(GallineroDto d) => new()
        {
            ["name"] = Obligatorio(d.Name, "Nombre"),
            ["location"] = ReglasGranja.Texto(d.Location),
            ["capacity"] = Entero(d.Capacity, "Capacidad de aves", 1, 100_000),
            ["type"] = Opcion(d.Type, TiposGallinero, "Tipo", string.Empty),
            ["status"] = Opcion(d.Status, EstadosGallinero, "Estado", "Activo"),
            ["startedAt"] = Fecha(d.StartedAt, "En funcionamiento desde", false),
            ["notes"] = ReglasGranja.Texto(d.Notes),
        };

        // ---------- aves ----------

        public Task<RegistroGuardadoDto> CrearAveAsync(Guid usuario, AveDto dto) => Modificar(usuario, "Ave registrada.", async (doc, ahora) =>
        {
            JsonObject fila = CamposAve(doc, dto, null);
            var (id, codigo) = Insertar(doc, "birds", "ave", "AVE", fila);
            await VincularFotoAsync(usuario, id, dto.Photo);
            await _mercado.RegistrarAveAsync(usuario, id, ahora);
            RetirarAnilloSiCorresponde(doc, id, Texto(fila, "status"), Hoy(null, ahora));
            return (id, codigo);
        });

        public Task<RegistroGuardadoDto> ActualizarAveAsync(Guid usuario, string id, AveDto dto) => Modificar(usuario, "Ave actualizada.", async (doc, ahora) =>
        {
            JsonObject fila = Fila(doc, "birds", id);
            string anterior = Texto(fila, "status");
            if (anterior == "Transferido") throw ReglaNegocioException.Conflicto("Un ave transferida es historial y no se puede modificar.");
            await VincularFotoAsync(usuario, id, dto.Photo, Texto(fila, "photo"));
            JsonObject campos = CamposAve(doc, dto, id);
            string nuevo = Texto(campos, "status");
            if (nuevo != anterior && (nuevo == "Vendido" || nuevo == "Fallecido") && await _mercado.AveEnMercadoAsync(id))
                throw ReglaNegocioException.Conflicto($"\"{Texto(fila, "name")}\" está en el mercado. Retira la publicación antes de marcarla como {nuevo.ToLowerInvariant()}.");
            if (!campos.ContainsKey("species")) fila.Remove("species");
            Fusionar(fila, campos);
            RetirarAnilloSiCorresponde(doc, id, nuevo, Hoy(null, ahora));
            return (id, Codigo(fila));
        });

        public Task<RegistroGuardadoDto> EliminarAveAsync(Guid usuario, string id) => Modificar(usuario, "Ave eliminada.", async (doc, _) =>
        {
            JsonObject fila = Fila(doc, "birds", id);
            if (Texto(fila, "status") == "Transferido") throw ReglaNegocioException.Conflicto("Un ave transferida es historial y no se puede eliminar.");
            if (TieneHistorial(doc, id))
                throw ReglaNegocioException.Conflicto("Esta ave tiene historial de anillos, postura, salud, reproducción o genealogía; conserva su ficha y actualiza su estado en lugar de eliminarla.");
            if (await _mercado.AveEnMercadoAsync(id))
                throw ReglaNegocioException.Conflicto($"\"{Texto(fila, "name")}\" está en el mercado. Retira la publicación antes de eliminarla.");
            doc.Quitar("birds", id);
            return (id, (string?)null);
        });

        // Se vincula dentro de la misma transacción de la granja. No se permite adjuntar archivos de otra cuenta.
        private async Task VincularFotoAsync(Guid usuario, string aveId, string? foto, string? anterior = null)
        {
            if (string.IsNullOrWhiteSpace(foto) || foto == anterior) return;
            const string prefijo = "/api/media/";
            if (!foto.StartsWith(prefijo, StringComparison.Ordinal))
            {
                if (!Uri.TryCreate(foto, UriKind.Absolute, out var uri) || uri.Scheme != "https")
                    throw ReglaNegocioException.Validacion("Sube una foto o usa una dirección HTTPS válida.");
                return;
            }
            var almacen = new AlmacenMercado(_contexto, _tiempo);
            var archivo = await almacen.Archivos.ObtenerAsync(foto[prefijo.Length..], true)
                ?? throw ReglaNegocioException.NoEncontrado("La foto no existe. Vuelve a subirla.");
            if (archivo.OwnerId != usuario.ToString()) throw ReglaNegocioException.Prohibido("La foto no pertenece a tu cuenta.");
            if (archivo.Purpose != "bird" || archivo.Kind != "image") throw ReglaNegocioException.Validacion("Sube una foto para esta ave.");
            if (archivo.PostId is not null && archivo.PostId != $"bird:{aveId}") throw ReglaNegocioException.Conflicto("La foto ya está asociada a otro registro.");
            // Next también consulta postId al limpiar huérfanos mientras ambas aplicaciones conviven.
            archivo.PostId = $"bird:{aveId}";
            almacen.Archivos.Actualizar(archivo);
        }

        private static JsonObject CamposAve(DocumentoGranja doc, AveDto d, string? propioId)
        {
            if (string.Equals(d.Status?.Trim(), "Transferido", StringComparison.Ordinal))
                throw ReglaNegocioException.Conflicto("El estado \"Transferido\" solo lo asigna el sistema al completar una operación.");
            string gallinero = Obligatorio(d.CoopId, "Gallinero");
            if (!doc.Existe("coops", gallinero)) throw ReglaNegocioException.Validacion("El gallinero elegido ya no existe.");
            string madre = Referencia(doc, "birds", d.MotherId, "La madre elegida ya no existe.");
            string padre = Referencia(doc, "birds", d.FatherId, "El padre elegido ya no existe.");
            if (propioId is not null && (madre == propioId || padre == propioId))
                throw ReglaNegocioException.Validacion("Un ave no puede ser su propia madre ni su propio padre.");
            var campos = new JsonObject
            {
                ["name"] = Obligatorio(d.Name, "Nombre o apodo"),
                ["sex"] = OpcionObligatoria(d.Sex, Sexos, "Sexo"),
                ["breed"] = ReglasGranja.Texto(d.Breed),
                ["coopId"] = gallinero,
                ["status"] = Opcion(d.Status, EstadosAve, "Estado", "Activo"),
                ["bornAt"] = Fecha(d.BornAt, "Fecha de nacimiento", false),
                ["origin"] = ReglasGranja.Texto(d.Origin),
                ["motherId"] = madre,
                ["fatherId"] = padre,
                ["photo"] = ReglasGranja.Texto(d.Photo),
                ["notes"] = ReglasGranja.Texto(d.Notes),
            };
            // La especie es opcional en el documento (por defecto, gallinas): no se escribe vacía.
            if (!string.IsNullOrWhiteSpace(d.Species)) campos["species"] = ReglasGranja.Texto(d.Species);
            return campos;
        }

        private static bool TieneHistorial(DocumentoGranja doc, string id) =>
            Alguna(doc, "rings", f => Texto(f, "birdId") == id)
            || Alguna(doc, "birdEvents", f => Texto(f, "birdId") == id)
            || Alguna(doc, "eggs", f => Texto(f, "henId") == id)
            || Alguna(doc, "incubations", f => Texto(f, "henId") == id)
            || Alguna(doc, "births", f => Texto(f, "motherId") == id || Texto(f, "fatherId") == id)
            || Alguna(doc, "breedingGroups", f => Texto(f, "roosterId") == id || (f["henIds"] is JsonArray ids && ids.Any(x => DocumentoGranja.Texto(x) == id)))
            || Alguna(doc, "birds", f => Texto(f, "motherId") == id || Texto(f, "fatherId") == id);

        private static void RetirarAnilloSiCorresponde(DocumentoGranja doc, string aveId, string estado, string hoy)
        {
            if (!EstadosQueRetiranAnillo.Contains(estado)) return;
            foreach (JsonObject anillo in doc.Lista("rings").OfType<JsonObject>())
            {
                if (Texto(anillo, "birdId") == aveId && Texto(anillo, "status") == "Asignado" && Texto(anillo, "endedAt").Length == 0)
                {
                    anillo["status"] = "Retirado";
                    anillo["endedAt"] = hoy;
                }
            }
        }

        // ---------- recolección de huevos ----------

        public Task<RegistroGuardadoDto> CrearRecoleccionAsync(Guid usuario, RecoleccionDto dto) => Modificar(usuario, "Recolección registrada.", (doc, _) =>
        {
            JsonObject fila = CamposRecoleccion(doc, dto);
            string grupoId = Texto(fila, "breedingGroupId");
            // Se guarda una foto del grupo en esa fecha: si luego cambia, la recolección conserva de dónde venían los huevos.
            if (grupoId.Length > 0 && doc.Buscar("breedingGroups", grupoId) is { } grupo)
            {
                fila["groupSnapshot"] = new JsonObject
                {
                    ["roosterId"] = Texto(grupo, "roosterId"),
                    ["henIds"] = grupo["henIds"] is JsonArray gallinas ? new JsonArray(gallinas.Select(g => (JsonNode?)JsonValue.Create(DocumentoGranja.Texto(g))).ToArray()) : new JsonArray(),
                    ["capturedAt"] = Texto(fila, "date"),
                };
            }
            return Task.FromResult(Insertar(doc, "eggs", "hue", "HUE", fila));
        });

        public Task<RegistroGuardadoDto> ActualizarRecoleccionAsync(Guid usuario, string id, RecoleccionDto dto) => Modificar(usuario, "Recolección actualizada.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "eggs", id);
            Fusionar(fila, CamposRecoleccion(doc, dto));
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarRecoleccionAsync(Guid usuario, string id) => Modificar(usuario, "Recolección eliminada.", (doc, _) =>
        {
            Fila(doc, "eggs", id);
            if (Alguna(doc, "fertileLots", f => Texto(f, "sourceCollectionId") == id))
                throw ReglaNegocioException.Conflicto("De esta recolección salieron lotes de huevos. Elimina o ajusta esos lotes antes de borrarla.");
            doc.Quitar("eggs", id);
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposRecoleccion(DocumentoGranja doc, RecoleccionDto d)
        {
            string gallinero = Obligatorio(d.CoopId, "Gallinero");
            if (!doc.Existe("coops", gallinero)) throw ReglaNegocioException.Validacion("El gallinero elegido ya no existe.");
            string gallina = Referencia(doc, "birds", d.HenId, "La gallina elegida ya no existe.");
            if (gallina.Length > 0 && Texto(doc.Buscar("birds", gallina)!, "sex") != "Gallina")
                throw ReglaNegocioException.Validacion("La gallina que puso debe ser una gallina registrada.");
            string grupo = Referencia(doc, "breedingGroups", d.BreedingGroupId, "El grupo reproductor elegido ya no existe.");
            int huevos = Entero(d.Eggs, "Huevos recolectados", 0, 100_000);
            int rotos = Entero(d.Broken, "Rotos", 0, huevos);
            int sucios = Entero(d.Dirty, "Sucios", 0, huevos);
            int incubacion = Entero(d.Incubation, "Para incubación", 0, 100_000);
            int consumo = Entero(d.Consumption, "Para consumo", 0, 100_000);
            int venta = Entero(d.Sale, "Para venta o clasificación", 0, 100_000);
            if (!ReparticionDeHuevosValida(huevos, incubacion, consumo, venta))
                throw ReglaNegocioException.Validacion("Los huevos para incubación, consumo y venta no pueden pasar de los recolectados.");
            return new JsonObject
            {
                ["date"] = Fecha(d.Date, "Fecha", true),
                ["coopId"] = gallinero,
                ["henId"] = gallina,
                ["breedingGroupId"] = grupo,
                ["eggs"] = huevos,
                ["broken"] = rotos,
                ["dirty"] = sucios,
                ["incubation"] = incubacion,
                ["consumption"] = consumo,
                ["sale"] = venta,
                ["notes"] = ReglasGranja.Texto(d.Notes),
            };
        }

        // ---------- incubación ----------

        public Task<RegistroGuardadoDto> CrearIncubacionAsync(Guid usuario, IncubacionDto dto) => Modificar(usuario, "Incubación registrada.", (doc, ahora) =>
        {
            JsonObject fila = CamposIncubacion(doc, dto, null);
            fila["updatedAt"] = ahora.ToString("O");
            var resultado = Insertar(doc, "incubations", "inc", "INC", fila);
            List<string> lotes = Ids(fila["sourceLotIds"]);
            if (lotes.Count > 0) ConsumirLotesDeHuevos(doc, lotes, (int)DocumentoGranja.Numero(fila["eggs"]), resultado.Id, Texto(fila, "startedAt"));
            AjustarClueca(doc, null, Texto(fila, "henId"), Texto(fila, "status"));
            return Task.FromResult(resultado);
        });

        public Task<RegistroGuardadoDto> ActualizarIncubacionAsync(Guid usuario, string id, IncubacionDto dto) => Modificar(usuario, "Incubación actualizada.", (doc, ahora) =>
        {
            JsonObject fila = Fila(doc, "incubations", id);
            string gallinaAnterior = Texto(fila, "henId");
            JsonObject campos = CamposIncubacion(doc, dto, fila);
            if (!campos.ContainsKey("hatchAdjustmentDays")) fila.Remove("hatchAdjustmentDays");
            Fusionar(fila, campos);
            fila["updatedAt"] = ahora.ToString("O");
            AjustarClueca(doc, gallinaAnterior, Texto(fila, "henId"), Texto(fila, "status"));
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarIncubacionAsync(Guid usuario, string id) => Modificar(usuario, "Incubación eliminada.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "incubations", id);
            if (Alguna(doc, "births", f => Texto(f, "incubationId") == id))
                throw ReglaNegocioException.Conflicto("Esta incubación tiene lotes de nacimiento vinculados. Elimínalos primero si deseas continuar.");
            doc.Quitar("incubations", id);
            // Una clueca no se queda «Clueca» por una incubación que ya no existe (salvo que tenga otra en curso).
            string gallina = Texto(fila, "henId");
            if (gallina.Length > 0 && Texto(fila, "status") == "En curso" && !Alguna(doc, "incubations", f => Texto(f, "henId") == gallina && Texto(f, "status") == "En curso"))
                AjustarClueca(doc, null, gallina, "Finalizada");
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposIncubacion(DocumentoGranja doc, IncubacionDto d, JsonObject? existente)
        {
            // Los lotes de huevos se descuentan al crear la incubación; después ya no se pueden cambiar (los huevos ya salieron de ellos).
            List<string> lotes = (d.SourceLotIds ?? []).Select(l => ReglasGranja.Texto(l)).Where(l => l.Length > 0).Distinct().ToList();
            if (existente is not null)
            {
                if (!lotes.Order().SequenceEqual(Ids(existente["sourceLotIds"]).Order())) throw ReglaNegocioException.Validacion("Los lotes de huevos de una incubación ya creada no se pueden cambiar.");
                lotes = Ids(existente["sourceLotIds"]);
            }
            else foreach (string lote in lotes)
                if (!doc.Existe("fertileLots", lote)) throw ReglaNegocioException.Validacion("Uno de los lotes de huevos elegidos ya no existe.");
            string tipo = OpcionObligatoria(d.Type, TiposIncubacion, "Tipo de incubación");
            string gallina = Referencia(doc, "birds", d.HenId, "La gallina elegida ya no existe.");
            if (tipo == "Natural")
            {
                if (gallina.Length == 0) throw ReglaNegocioException.Validacion("Gallina clueca: elige la gallina de la incubación natural.");
                if (Texto(doc.Buscar("birds", gallina)!, "sex") != "Gallina") throw ReglaNegocioException.Validacion("La clueca debe ser una gallina.");
            }
            string gallinero = Obligatorio(d.CoopId, "Gallinero o espacio");
            if (!doc.Existe("coops", gallinero)) throw ReglaNegocioException.Validacion("El gallinero elegido ya no existe.");
            int huevos = Entero(d.Eggs, "Huevos iniciales", 1, 100_000);
            int nacidos = Entero(d.Hatched, "Pollitos nacidos", 0, huevos);
            int retirados = Entero(d.Removed, "Retirados o descartados", 0, huevos);
            if (nacidos + retirados > huevos) throw ReglaNegocioException.Validacion("Los pollitos nacidos y los retirados no pueden pasar de los huevos iniciales.");
            var campos = new JsonObject
            {
                ["type"] = tipo,
                ["henId"] = gallina,
                ["equipment"] = ReglasGranja.Texto(d.Equipment),
                ["coopId"] = gallinero,
                ["startedAt"] = Fecha(d.StartedAt, "Inicio", true),
                ["sourceLotIds"] = new JsonArray(lotes.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray()),
                ["eggs"] = huevos,
                ["hatched"] = nacidos,
                ["removed"] = retirados,
                ["status"] = OpcionObligatoria(d.Status, EstadosIncubacion, "Estado"),
                ["notes"] = ReglasGranja.Texto(d.Notes),
            };
            if (d.HatchAdjustmentDays is { } ajuste) campos["hatchAdjustmentDays"] = Entero(ajuste, "Ajuste a fecha estimada (días)", -14, 14);
            return campos;
        }

        /// <summary>La gallina de una incubación en curso queda «Clueca»; al cambiarla o terminar, vuelve a «Activo» (sin pisar otros estados).</summary>
        private static void AjustarClueca(DocumentoGranja doc, string? anterior, string actual, string estado)
        {
            if (!string.IsNullOrEmpty(anterior) && anterior != actual && doc.Buscar("birds", anterior) is { } vieja && Texto(vieja, "status") == "Clueca")
                vieja["status"] = "Activo";
            if (actual.Length == 0 || doc.Buscar("birds", actual) is not { } gallina) return;
            string actualEstado = Texto(gallina, "status");
            if (estado == "En curso") { if (actualEstado != "Vendido" && actualEstado != "Fallecido") gallina["status"] = "Clueca"; }
            else if (actualEstado == "Clueca") gallina["status"] = "Activo";
        }

        // ---------- compras e inventario ----------

        public Task<RegistroGuardadoDto> CrearCompraAsync(Guid usuario, CompraDto dto) => Modificar(usuario, "Compra registrada y existencias actualizadas.", (doc, _) =>
        {
            JsonObject fila = CamposCompra(doc, dto);
            var resultado = Insertar(doc, "purchases", "com", null, fila);
            SumarAExistencias(doc, fila);
            return Task.FromResult(resultado);
        });

        public Task<RegistroGuardadoDto> ActualizarCompraAsync(Guid usuario, string id, CompraDto dto) => Modificar(usuario, "Compra actualizada.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "purchases", id);
            JsonObject campos = CamposCompra(doc, dto);
            RevertirCompra(doc, fila, Texto(campos, "date"), $"Ajuste por edición de compra {id}", "No se puede editar: parte del insumo de esta compra ya se consumió. Registra un ajuste de inventario primero.");
            Fusionar(fila, campos);
            SumarAExistencias(doc, fila);
            return Task.FromResult((id, (string?)null));
        });

        public Task<RegistroGuardadoDto> EliminarCompraAsync(Guid usuario, string id) => Modificar(usuario, "Compra anulada.", (doc, ahora) =>
        {
            JsonObject fila = Fila(doc, "purchases", id);
            RevertirCompra(doc, fila, Hoy(null, ahora), $"Anulación de compra {id}", "No se puede anular: parte del insumo de esta compra ya se consumió. Registra un ajuste de inventario primero.");
            doc.Quitar("purchases", id);
            return Task.FromResult((id, (string?)null));
        });

        public Task<RegistroGuardadoDto> RegistrarConsumoAsync(Guid usuario, ConsumoDto dto) => Modificar(usuario, "Consumo registrado y existencia actualizada.", (doc, _) =>
        {
            JsonObject existencia = doc.Buscar("stock", dto.StockId) ?? throw ReglaNegocioException.Validacion("Selecciona un producto existente.");
            decimal cantidad = Cantidad(dto.Quantity, "Cantidad a consumir", 0, true);
            decimal disponible = DocumentoGranja.Numero(existencia["quantity"]);
            if (!PuedeConsumir(cantidad, disponible))
                throw ReglaNegocioException.Validacion($"Solo hay {Formato(disponible)} {Texto(existencia, "unit")} disponibles. Ajusta la cantidad antes de guardar.");
            string gallinero = Referencia(doc, "coops", dto.CoopId, "El gallinero elegido ya no existe.");
            existencia["quantity"] = disponible - cantidad;
            string id = DocumentoGranja.NuevoId("move");
            doc.Lista("movements").Insert(0, new JsonObject
            {
                ["id"] = id,
                ["stockId"] = Texto(existencia, "id"),
                ["date"] = Fecha(dto.Date, "Fecha", true),
                ["kind"] = "Consumo",
                ["quantity"] = cantidad,
                ["coopId"] = gallinero,
                ["notes"] = ReglasGranja.Texto(dto.Notes) is { Length: > 0 } nota ? nota : "Consumo registrado",
            });
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposCompra(DocumentoGranja doc, CompraDto d) => new()
        {
            ["date"] = Fecha(d.Date, "Fecha", true),
            ["product"] = Obligatorio(d.Product, "Producto"),
            ["category"] = Opcion(d.Category, CategoriasCompra, "Categoría", "Otros"),
            ["quantity"] = Cantidad(d.Quantity, "Cantidad", 0, true),
            ["unit"] = Opcion(d.Unit, UnidadesCompra, "Unidad", "kg"),
            ["unitPrice"] = Cantidad(d.UnitPrice, "Precio unitario (COP)", 0),
            ["supplier"] = ReglasGranja.Texto(d.Supplier),
            ["coopId"] = Referencia(doc, "coops", d.CoopId, "El gallinero elegido ya no existe."),
            ["notes"] = ReglasGranja.Texto(d.Notes),
        };

        private static JsonObject? ExistenciaDe(DocumentoGranja doc, string producto) =>
            doc.Lista("stock").OfType<JsonObject>().FirstOrDefault(s => string.Equals(Texto(s, "product"), producto, StringComparison.OrdinalIgnoreCase));

        private static void SumarAExistencias(DocumentoGranja doc, JsonObject compra)
        {
            string producto = Texto(compra, "product");
            decimal cantidad = DocumentoGranja.Numero(compra["quantity"]);
            JsonObject? existencia = ExistenciaDe(doc, producto);
            if (existencia is null)
            {
                existencia = new JsonObject
                {
                    ["id"] = DocumentoGranja.NuevoId("stock"),
                    ["product"] = producto,
                    ["category"] = Texto(compra, "category") is { Length: > 0 } categoria ? categoria : "Otros",
                    ["quantity"] = 0m,
                    ["unit"] = Texto(compra, "unit"),
                    ["minimum"] = 5,
                };
                doc.Lista("stock").Insert(0, existencia);
            }
            existencia["quantity"] = DocumentoGranja.Numero(existencia["quantity"]) + cantidad;
            decimal total = decimal.Round(cantidad * DocumentoGranja.Numero(compra["unitPrice"]), 0, MidpointRounding.AwayFromZero);
            doc.Lista("movements").Insert(0, new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("move"),
                ["stockId"] = Texto(existencia, "id"),
                ["date"] = Texto(compra, "date"),
                ["kind"] = "Compra",
                ["quantity"] = cantidad,
                ["coopId"] = Texto(compra, "coopId"),
                ["notes"] = $"Compra de {producto} · {total.ToString("0", CultureInfo.InvariantCulture)} COP",
            });
        }

        private static void RevertirCompra(DocumentoGranja doc, JsonObject previa, string fecha, string nota, string mensajeSiConsumida)
        {
            decimal cantidad = DocumentoGranja.Numero(previa["quantity"]);
            JsonObject? existencia = ExistenciaDe(doc, Texto(previa, "product"));
            if (existencia is not null && DocumentoGranja.Numero(existencia["quantity"]) < cantidad) throw ReglaNegocioException.Conflicto(mensajeSiConsumida);
            if (existencia is not null) existencia["quantity"] = DocumentoGranja.Numero(existencia["quantity"]) - cantidad;
            doc.Lista("movements").Insert(0, new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("move"),
                ["stockId"] = existencia is null ? string.Empty : Texto(existencia, "id"),
                ["date"] = fecha,
                ["kind"] = "Ajuste",
                ["quantity"] = -cantidad,
                ["coopId"] = Texto(previa, "coopId"),
                ["notes"] = nota,
            });
        }

        // ---------- agenda (mantenimiento) ----------

        public Task<RegistroGuardadoDto> CrearTareaAsync(Guid usuario, TareaDto dto) => Modificar(usuario, "Tarea creada.", (doc, _) =>
            Task.FromResult(Insertar(doc, "maintenance", "man", null, CamposTarea(doc, dto))));

        public Task<RegistroGuardadoDto> ActualizarTareaAsync(Guid usuario, string id, TareaDto dto) => Modificar(usuario, "Tarea actualizada.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "maintenance", id);
            JsonObject campos = CamposTarea(doc, dto);
            if (!campos.ContainsKey("stockId")) fila.Remove("stockId");
            Fusionar(fila, campos);
            return Task.FromResult((id, (string?)null));
        });

        public Task<RegistroGuardadoDto> EliminarTareaAsync(Guid usuario, string id) => Modificar(usuario, "Tarea eliminada.", (doc, _) =>
        {
            Fila(doc, "maintenance", id);
            doc.Quitar("maintenance", id);
            return Task.FromResult((id, (string?)null));
        });

        public Task<RegistroGuardadoDto> CompletarTareaAsync(Guid usuario, string id, CompletarTareaDto dto) => Modificar(usuario, "Tarea completada. La próxima fecha se calculó desde hoy.", (doc, ahora) =>
        {
            JsonObject tarea = Fila(doc, "maintenance", id);
            string hoy = Hoy(dto.Hoy, ahora);
            string existenciaId = Texto(tarea, "stockId");
            decimal insumo = DocumentoGranja.Numero(tarea["supplies"]);
            if (existenciaId.Length > 0 && insumo > 0)
            {
                JsonObject existencia = doc.Buscar("stock", existenciaId) ?? throw ReglaNegocioException.Conflicto("El producto asociado a la tarea ya no existe.");
                decimal disponible = DocumentoGranja.Numero(existencia["quantity"]);
                if (!PuedeConsumir(insumo, disponible))
                    throw ReglaNegocioException.Conflicto($"Solo quedan {Formato(disponible)} {Texto(existencia, "unit")} de {Texto(existencia, "product")}. Ajusta el insumo utilizado antes de completar la tarea.");
                existencia["quantity"] = disponible - insumo;
                doc.Lista("movements").Insert(0, new JsonObject
                {
                    ["id"] = DocumentoGranja.NuevoId("move"),
                    ["stockId"] = existenciaId,
                    ["date"] = hoy,
                    ["kind"] = "Consumo",
                    ["quantity"] = insumo,
                    ["coopId"] = Texto(tarea, "coopId"),
                    ["notes"] = $"Mantenimiento: {Texto(tarea, "title")}",
                });
            }
            int frecuencia = (int)DocumentoGranja.Numero(tarea["frequencyDays"]);
            tarea["lastDone"] = hoy;
            tarea["nextDue"] = ProximoMantenimiento(hoy, frecuencia < 1 ? 1 : frecuencia);
            tarea["status"] = "Próxima";
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposTarea(DocumentoGranja doc, TareaDto d)
        {
            string gallinero = Obligatorio(d.CoopId, "Gallinero");
            if (!doc.Existe("coops", gallinero)) throw ReglaNegocioException.Validacion("El gallinero elegido ya no existe.");
            string existencia = Referencia(doc, "stock", d.StockId, "El producto elegido ya no existe.");
            decimal insumo = Cantidad(d.Supplies, "Cantidad utilizada", 0);
            if (insumo > 0 && existencia.Length == 0) throw ReglaNegocioException.Validacion("Cantidad utilizada: elige el producto que se usa.");
            var campos = new JsonObject
            {
                ["title"] = Obligatorio(d.Title, "Tarea"),
                ["coopId"] = gallinero,
                ["frequencyDays"] = Entero(d.FrequencyDays, "Frecuencia (días)", 1, 3650),
                ["lastDone"] = Fecha(d.LastDone, "Última realizada", false),
                ["nextDue"] = Fecha(d.NextDue, "Próxima fecha", true),
                ["status"] = Opcion(d.Status, EstadosTarea, "Estado", "Pendiente"),
                ["supplies"] = insumo,
                ["notes"] = ReglasGranja.Texto(d.Notes),
            };
            if (existencia.Length > 0) campos["stockId"] = existencia;
            return campos;
        }

        // ---------- apoyo ----------

        /// <summary>Carga el documento, aplica la orden en memoria y lo guarda con control de versión, en una sola transacción.</summary>
        private async Task<RegistroGuardadoDto> Modificar(Guid usuario, string mensaje, Func<DocumentoGranja, DateTime, Task<(string Id, string? Codigo)>> orden)
        {
            GranjaE granja = await _contexto.GranjaEs.FirstOrDefaultAsync(g => g.IdUsuario == usuario)
                ?? throw ReglaNegocioException.NoEncontrado("No existe el espacio de granja de esta cuenta.");
            DateTime ahora = Ahora;
            var documento = DocumentoGranja.Desde(granja.Datos);
            var anterior = DocumentoGranja.Desde(granja.Datos);

            // Las reglas del mercado escriben en otras tablas: si algo falla después, no deben quedar a medias.
            await using var transaccion = _contexto.Database.IsNpgsql() ? await _contexto.Database.BeginTransactionAsync() : null;
            var (id, codigo) = await orden(documento, ahora);
            await _mercado.RevisarPublicacionesAsync(usuario, documento, ahora);
            await _mercado.EmitirCambiosAsync(usuario, anterior, documento, granja.Version + 1);
            string json = documento.Json();
            if (json.Length > LimiteBytes) throw ReglaNegocioException.Validacion("La granja supera el límite de 12 MB.");
            granja.Datos = json;
            granja.Version += 1;
            granja.ActualizadoEn = ahora;
            try { await _contexto.SaveChangesAsync(); }
            catch (DbUpdateConcurrencyException) { throw ReglaNegocioException.Conflicto("Los datos cambiaron en otra sesión. Vuelve a abrir la granja y repite el cambio para no sobrescribir nada."); }
            if (transaccion is not null) await transaccion.CommitAsync();
            return new RegistroGuardadoDto { Id = id, Codigo = codigo, Version = granja.Version, Mensaje = mensaje };
        }

        /// <summary>Pone el id (y el código) a los campos ya validados y los inserta al principio de la lista. La fila sigue siendo el mismo objeto.</summary>
        private static (string Id, string? Codigo) Insertar(DocumentoGranja doc, string lista, string prefijoId, string? prefijoCodigo, JsonObject fila)
        {
            string id = DocumentoGranja.NuevoId(prefijoId);
            fila.Insert(0, "id", id);
            string? codigo = null;
            if (prefijoCodigo is not null)
            {
                codigo = doc.CodigoUnico(prefijoCodigo);
                fila["code"] = codigo;
            }
            doc.Lista(lista).Insert(0, fila);
            return (id, codigo);
        }

        private static void Fusionar(JsonObject destino, JsonObject campos)
        {
            foreach (var par in campos.ToArray())
            {
                campos.Remove(par.Key);
                destino[par.Key] = par.Value;
            }
        }

        private static JsonObject Fila(DocumentoGranja doc, string lista, string id) =>
            doc.Buscar(lista, id) ?? throw ReglaNegocioException.NoEncontrado("Ese registro ya no existe.");

        private static string Texto(JsonObject fila, string clave) => DocumentoGranja.Texto(fila[clave]) ?? string.Empty;

        private static string? Codigo(JsonObject fila) => Texto(fila, "code") is { Length: > 0 } codigo ? codigo : null;

        private static bool Alguna(DocumentoGranja doc, string lista, Func<JsonObject, bool> condicion) => doc.Lista(lista).OfType<JsonObject>().Any(condicion);

        /// <summary>Un id opcional: vacío vale; si viene, el registro tiene que existir.</summary>
        private static string Referencia(DocumentoGranja doc, string lista, string? id, string mensaje)
        {
            string limpio = ReglasGranja.Texto(id);
            if (limpio.Length == 0) return string.Empty;
            if (!doc.Existe(lista, limpio)) throw ReglaNegocioException.Validacion(mensaje);
            return limpio;
        }

        private static string Formato(decimal valor) => valor.ToString("0.##", CultureInfo.InvariantCulture);
    }
}
