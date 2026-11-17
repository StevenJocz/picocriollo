using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using static PicoCriollo.Domain.Utilidades.ReglasGranja;

namespace PicoCriollo.Persistence.Commands
{
    /// <summary>
    /// Nacimientos, grupos reproductores, anillos y eventos de cada ave. Antes estas reglas vivían en el navegador (useFarm y rings.ts):
    /// ahora el servidor las hace cumplir. Un nacimiento crea su lote de pollitos; un anillo ocupa un solo número a la vez.
    /// </summary>
    public partial class GranjaCommands
    {
        private static readonly string[] EstadosParentesco = ["Confirmada", "Probable", "Desconocida"];
        private static readonly string[] EstadosGrupo = ["Activo", "Finalizado"];
        private static readonly string[] TiposEventoAve = ["Observación", "Salud", "Reproductivo"];
        private static readonly string[] EstadosAveSinAnillo = ["Vendido", "Fallecido", "Transferido"];
        public const int AnilloMinimo = 1, AnilloMaximo = 100;

        // ---------- nacimientos ----------

        public Task<RegistroGuardadoDto> CrearNacimientoAsync(Guid usuario, NacimientoDto dto) => Modificar(usuario, "Nacimiento registrado y lote de pollitos creado.", (doc, _) =>
        {
            JsonObject campos = CamposNacimiento(doc, dto);
            var (id, codigo) = Insertar(doc, "births", "nac", "POL", campos);
            JsonObject incubacion = doc.Buscar("incubations", Texto(campos, "incubationId"))!;
            string raza = Texto(campos, "breed");
            doc.Lista("chickLots").Insert(0, new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("chicklot"),
                ["code"] = doc.CodigoUnico("POL"),
                ["birthId"] = id,
                ["sourceLotIds"] = incubacion["sourceLotIds"] is JsonArray origen ? origen.DeepClone() : new JsonArray(),
                ["incubationId"] = Texto(campos, "incubationId"),
                ["breed"] = raza.Length > 0 ? raza : "Sin clasificar",
                ["initial"] = (int)DocumentoGranja.Numero(campos["count"]),
                ["available"] = (int)DocumentoGranja.Numero(campos["count"]),
                ["sold"] = 0,
                ["coopId"] = Texto(campos, "coopId"),
                ["notes"] = "Lote generado al registrar el nacimiento.",
            });
            return Task.FromResult((id, codigo));
        });

        public Task<RegistroGuardadoDto> ActualizarNacimientoAsync(Guid usuario, string id, NacimientoDto dto) => Modificar(usuario, "Nacimiento actualizado.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "births", id);
            JsonObject campos = CamposNacimiento(doc, dto);
            if (Texto(campos, "incubationId") != Texto(fila, "incubationId"))
                throw ReglaNegocioException.Validacion("No se puede cambiar la incubación de un nacimiento: elimínalo y regístralo de nuevo.");
            JsonObject? lote = doc.Lista("chickLots").OfType<JsonObject>().FirstOrDefault(l => Texto(l, "birthId") == id);
            int cantidad = (int)DocumentoGranja.Numero(campos["count"]);
            if (lote is not null)
            {
                bool intacto = (int)DocumentoGranja.Numero(lote["sold"]) == 0 && DocumentoGranja.Numero(lote["available"]) == DocumentoGranja.Numero(lote["initial"]);
                if (cantidad != (int)DocumentoGranja.Numero(fila["count"]) && !intacto)
                    throw ReglaNegocioException.Conflicto("Parte de los pollitos de este lote ya se vendió o se descartó: no se puede cambiar la cantidad.");
                if (intacto)
                {
                    lote["initial"] = cantidad;
                    lote["available"] = cantidad;
                    lote["breed"] = Texto(campos, "breed") is { Length: > 0 } raza ? raza : "Sin clasificar";
                    lote["coopId"] = Texto(campos, "coopId");
                }
            }
            if (!campos.ContainsKey("parentageStatus")) fila.Remove("parentageStatus");
            Fusionar(fila, campos);
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarNacimientoAsync(Guid usuario, string id) => Modificar(usuario, "Nacimiento eliminado.", (doc, _) =>
        {
            Fila(doc, "births", id);
            JsonObject? lote = doc.Lista("chickLots").OfType<JsonObject>().FirstOrDefault(l => Texto(l, "birthId") == id);
            if (lote is not null)
            {
                bool intacto = (int)DocumentoGranja.Numero(lote["sold"]) == 0 && DocumentoGranja.Numero(lote["available"]) == DocumentoGranja.Numero(lote["initial"]);
                if (!intacto) throw ReglaNegocioException.Conflicto("Parte de los pollitos de este nacimiento ya se vendió o se descartó: conserva el registro.");
                doc.Quitar("chickLots", Texto(lote, "id"));
            }
            doc.Quitar("births", id);
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposNacimiento(DocumentoGranja doc, NacimientoDto d)
        {
            string incubacion = Obligatorio(d.IncubationId, "Incubación");
            if (!doc.Existe("incubations", incubacion)) throw ReglaNegocioException.Validacion("La incubación elegida ya no existe.");
            string madre = Referencia(doc, "birds", d.MotherId, "La madre elegida ya no existe.");
            string padre = Referencia(doc, "birds", d.FatherId, "El padre elegido ya no existe.");
            var campos = new JsonObject
            {
                ["incubationId"] = incubacion,
                ["date"] = Fecha(d.Date, "Fecha de nacimiento", true),
                ["count"] = Entero(d.Count, "Pollitos del lote", 1, 100_000),
                ["motherId"] = madre,
                ["fatherId"] = padre,
                ["coopId"] = Referencia(doc, "coops", d.CoopId, "El gallinero de cría elegido ya no existe."),
                ["breed"] = ReglasGranja.Texto(d.Breed),
                ["notes"] = ReglasGranja.Texto(d.Notes),
            };
            string parentesco = Opcion(d.ParentageStatus, EstadosParentesco, "Parentesco", string.Empty);
            if (parentesco.Length > 0) campos["parentageStatus"] = parentesco;
            return campos;
        }

        // ---------- grupos reproductores ----------

        public Task<RegistroGuardadoDto> CrearGrupoReproductorAsync(Guid usuario, GrupoReproductorDto dto) => Modificar(usuario, "Grupo reproductor creado.", (doc, _) =>
        {
            JsonObject campos = CamposGrupo(doc, dto);
            campos["membershipHistory"] = new JsonArray(Membresia(Texto(campos, "startedAt"), campos));
            return Task.FromResult(Insertar(doc, "breedingGroups", "bre", "REP", campos));
        });

        public Task<RegistroGuardadoDto> ActualizarGrupoReproductorAsync(Guid usuario, string id, GrupoReproductorDto dto) => Modificar(usuario, "Grupo reproductor actualizado.", (doc, ahora) =>
        {
            JsonObject fila = Fila(doc, "breedingGroups", id);
            JsonObject campos = CamposGrupo(doc, dto);
            bool cambio = Texto(fila, "roosterId") != Texto(campos, "roosterId") || !Ids(fila["henIds"]).Order().SequenceEqual(Ids(campos["henIds"]).Order());
            if (cambio)
            {
                // El historial conserva quién estuvo en el grupo en cada periodo (para saber de qué grupo salió cada huevo).
                string hoy = Hoy(null, ahora);
                var historia = fila["membershipHistory"] is JsonArray previa ? (JsonArray)previa.DeepClone() : new JsonArray();
                if (historia.Count > 0 && historia[^1] is JsonObject ultima && Texto(ultima, "to").Length == 0) ultima["to"] = hoy;
                else historia.Add(new JsonObject { ["from"] = Texto(fila, "startedAt") is { Length: > 0 } desde ? desde : hoy, ["to"] = hoy, ["roosterId"] = Texto(fila, "roosterId"), ["henIds"] = new JsonArray(Ids(fila["henIds"]).Select(h => (JsonNode)JsonValue.Create(h)!).ToArray()) });
                historia.Add(Membresia(hoy, campos));
                campos["membershipHistory"] = historia;
            }
            Fusionar(fila, campos);
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarGrupoReproductorAsync(Guid usuario, string id) => Modificar(usuario, "Grupo reproductor eliminado.", (doc, _) =>
        {
            Fila(doc, "breedingGroups", id);
            if (Alguna(doc, "eggs", f => Texto(f, "breedingGroupId") == id) || Alguna(doc, "fertileLots", f => Texto(f, "breedingGroupId") == id))
                throw ReglaNegocioException.Conflicto("De este grupo ya hay huevos o lotes registrados: finalízalo en lugar de eliminarlo para conservar la procedencia.");
            doc.Quitar("breedingGroups", id);
            return Task.FromResult((id, (string?)null));
        });

        private static List<string> Ids(JsonNode? nodo) => nodo is JsonArray lista ? lista.Select(n => DocumentoGranja.Texto(n) ?? string.Empty).Where(t => t.Length > 0).ToList() : [];

        private static JsonObject Membresia(string desde, JsonObject campos) => new()
        {
            ["from"] = desde, ["roosterId"] = Texto(campos, "roosterId"), ["henIds"] = new JsonArray(Ids(campos["henIds"]).Select(h => (JsonNode)JsonValue.Create(h)!).ToArray()),
        };

        private static JsonObject CamposGrupo(DocumentoGranja doc, GrupoReproductorDto d)
        {
            string gallo = Obligatorio(d.RoosterId, "Gallo");
            JsonObject galloFila = doc.Buscar("birds", gallo) ?? throw ReglaNegocioException.Validacion("El gallo elegido ya no existe.");
            if (Texto(galloFila, "sex") != "Gallo") throw ReglaNegocioException.Validacion("Gallo: elige un ave de sexo «Gallo».");
            List<string> gallinas = d.HenIds.Select(h => ReglasGranja.Texto(h)).Where(h => h.Length > 0).Distinct().ToList();
            if (gallinas.Count == 0) throw ReglaNegocioException.Validacion("Gallinas: elige al menos una gallina.");
            foreach (string gallina in gallinas)
            {
                JsonObject fila = doc.Buscar("birds", gallina) ?? throw ReglaNegocioException.Validacion("Una de las gallinas elegidas ya no existe.");
                if (Texto(fila, "sex") != "Gallina") throw ReglaNegocioException.Validacion($"«{Texto(fila, "name")}» no es una gallina: solo se agregan gallinas al grupo.");
            }
            string inicio = Fecha(d.StartedAt, "Desde", true), fin = Fecha(d.EndedAt, "Hasta", false);
            if (fin.Length > 0 && string.CompareOrdinal(fin, inicio) < 0) throw ReglaNegocioException.Validacion("Hasta: la fecha final no puede ser anterior al inicio.");
            return new JsonObject
            {
                ["name"] = Obligatorio(d.Name, "Nombre del grupo"),
                ["coopId"] = Referencia(doc, "coops", d.CoopId, "El gallinero elegido ya no existe."),
                ["breed"] = ReglasGranja.Texto(d.Breed),
                ["roosterId"] = gallo,
                ["henIds"] = new JsonArray(gallinas.Select(h => (JsonNode)JsonValue.Create(h)!).ToArray()),
                ["startedAt"] = inicio,
                ["endedAt"] = fin,
                ["status"] = Opcion(d.Status, EstadosGrupo, "Estado", "Activo"),
                ["notes"] = ReglasGranja.Texto(d.Notes),
            };
        }

        // ---------- anillos ----------

        private static int NumeroDeAnillo(int numero)
        {
            if (numero < AnilloMinimo || numero > AnilloMaximo) throw ReglaNegocioException.Validacion($"El número de anillo debe estar entre {AnilloMinimo} y {AnilloMaximo}.");
            return numero;
        }

        private static JsonObject? AnilloVigente(DocumentoGranja doc, int numero) =>
            doc.Lista("rings").OfType<JsonObject>().FirstOrDefault(r => (int)DocumentoGranja.Numero(r["number"]) == numero && Texto(r, "endedAt").Length == 0 && Texto(r, "status") != "Retirado");

        public Task<RegistroGuardadoDto> AsignarAnilloAsync(Guid usuario, AsignarAnilloDto dto) => Modificar(usuario, "Anillo asignado al ave; el código interno permanece independiente.", (doc, ahora) =>
        {
            int numero = NumeroDeAnillo(dto.Number);
            string hoy = Hoy(null, ahora);
            JsonObject ave = doc.Buscar("birds", dto.BirdId) ?? throw ReglaNegocioException.Validacion("Selecciona un ave registrada y activa.");
            if (EstadosAveSinAnillo.Contains(Texto(ave, "status"))) throw ReglaNegocioException.Validacion("Selecciona un ave registrada y activa.");
            JsonObject? ocupante = AnilloVigente(doc, numero);
            if (ocupante is not null && Texto(ocupante, "status") == "Temporalmente sin uso") throw ReglaNegocioException.Conflicto("Este anillo está marcado temporalmente sin uso. Actívalo antes de asignarlo.");
            if (ocupante is not null && Texto(ocupante, "birdId") == dto.BirdId) throw ReglaNegocioException.Conflicto($"El anillo {numero} ya está asignado a {Texto(ave, "name")}.");
            if (ocupante is not null) throw ReglaNegocioException.Conflicto($"El anillo {numero} ya está asignado a otra ave.");
            // Un ave lleva un solo anillo: el anterior se retira y queda en su historial.
            foreach (JsonObject previo in doc.Lista("rings").OfType<JsonObject>())
                if (Texto(previo, "birdId") == dto.BirdId && Texto(previo, "endedAt").Length == 0 && Texto(previo, "status") == "Asignado") { previo["endedAt"] = hoy; previo["status"] = "Retirado"; }
            string id = Guid.NewGuid().ToString();
            doc.Lista("rings").Insert(0, new JsonObject { ["id"] = id, ["number"] = numero, ["birdId"] = dto.BirdId, ["status"] = "Asignado", ["assignedAt"] = hoy });
            return Task.FromResult((id, (string?)null));
        });

        public Task<RegistroGuardadoDto> RetirarAnilloAsync(Guid usuario, RetirarAnilloDto dto) => Modificar(usuario, "Anillo retirado; su historial quedó conservado.", (doc, ahora) =>
        {
            JsonObject asignado = doc.Lista("rings").OfType<JsonObject>().FirstOrDefault(r => Texto(r, "birdId") == dto.BirdId && Texto(r, "status") == "Asignado" && Texto(r, "endedAt").Length == 0)
                ?? throw ReglaNegocioException.Conflicto("Esta ave no tiene un anillo asignado actualmente.");
            asignado["endedAt"] = Hoy(null, ahora);
            asignado["status"] = "Retirado";
            return Task.FromResult((Texto(asignado, "id"), (string?)null));
        });

        public Task<RegistroGuardadoDto> InhabilitarAnilloAsync(Guid usuario, InhabilitarAnilloDto dto) => Modificar(usuario, "Número marcado temporalmente sin uso.", (doc, ahora) =>
        {
            int numero = NumeroDeAnillo(dto.Number);
            JsonObject? ocupante = AnilloVigente(doc, numero);
            if (ocupante is not null)
                throw ReglaNegocioException.Conflicto(Texto(ocupante, "status") == "Asignado"
                    ? $"Retira primero el anillo asignado a {(doc.Buscar("birds", Texto(ocupante, "birdId")) is { } a ? Texto(a, "name") : "un ave")}."
                    : "Este número ya está temporalmente sin uso.");
            string id = Guid.NewGuid().ToString();
            doc.Lista("rings").Insert(0, new JsonObject { ["id"] = id, ["number"] = numero, ["status"] = "Temporalmente sin uso", ["assignedAt"] = Hoy(null, ahora), ["notes"] = ReglasGranja.Texto(dto.Notes) });
            return Task.FromResult((id, (string?)null));
        });

        public Task<RegistroGuardadoDto> ActivarAnilloAsync(Guid usuario, ActivarAnilloDto dto) => Modificar(usuario, "Número de anillo reactivado y disponible.", (doc, ahora) =>
        {
            JsonObject sinUso = AnilloVigente(doc, NumeroDeAnillo(dto.Number)) is { } r && Texto(r, "status") == "Temporalmente sin uso" ? r
                : throw ReglaNegocioException.Conflicto("Este anillo no está marcado temporalmente sin uso.");
            sinUso["status"] = "Retirado";
            sinUso["endedAt"] = Hoy(null, ahora);
            return Task.FromResult((Texto(sinUso, "id"), (string?)null));
        });

        // ---------- eventos del ave ----------

        public Task<RegistroGuardadoDto> RegistrarEventoAveAsync(Guid usuario, EventoAveDto dto) => Modificar(usuario, "Evento guardado en la ficha permanente del ave.", (doc, ahora) =>
        {
            if (!doc.Existe("birds", dto.BirdId)) throw ReglaNegocioException.Validacion("El ave seleccionada ya no existe.");
            string fecha = Fecha(dto.Date, "Fecha", true);
            if (string.CompareOrdinal(fecha, Hoy(null, ahora)) > 0) throw ReglaNegocioException.Validacion("Fecha: el evento no puede ser futuro.");
            string id = Guid.NewGuid().ToString();
            doc.Lista("birdEvents").Insert(0, new JsonObject
            {
                ["id"] = id, ["birdId"] = dto.BirdId, ["kind"] = OpcionObligatoria(dto.Kind, TiposEventoAve, "Tipo de evento"),
                ["date"] = fecha, ["title"] = Obligatorio(dto.Title, "Título"), ["details"] = ReglasGranja.Texto(dto.Details),
            });
            return Task.FromResult((id, (string?)null));
        });
    }
}
