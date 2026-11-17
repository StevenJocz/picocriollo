using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PicoCriollo.Domain.Utilidades
{
    /// <summary>
    /// El documento jsonb de una granja (farm_data.data). Se edita como árbol JSON para conservar los campos que esta API
    /// no conoce (la app Next.js todavía escribe otros), y las listas se manejan con los mismos nombres que usa esa app.
    /// </summary>
    public sealed class DocumentoGranja
    {
        private static readonly JsonSerializerOptions Opciones = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        // Listas cuyos códigos (GAL-0001-XXXXXXXX…) no deben repetirse; las mismas que recorre allTraceRows en la app actual.
        private static readonly string[] ListasConCodigo = ["coops", "birds", "breedingGroups", "incubations", "eggs", "fertileLots", "births", "chickLots", "sales", "customers", "customProducts"];

        public JsonObject Raiz { get; }

        private DocumentoGranja(JsonObject raiz) => Raiz = raiz;

        public static DocumentoGranja Desde(string json)
        {
            JsonNode? nodo;
            try { nodo = JsonNode.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json); }
            catch (JsonException) { throw new InvalidOperationException("El documento de la granja no es un JSON válido."); }
            return new DocumentoGranja(nodo as JsonObject ?? new JsonObject());
        }

        public string Json() => Raiz.ToJsonString(Opciones);

        public JsonArray Lista(string nombre)
        {
            if (Raiz[nombre] is JsonArray lista) return lista;
            var nueva = new JsonArray();
            Raiz[nombre] = nueva;
            return nueva;
        }

        public JsonObject? Buscar(string lista, string? id) =>
            string.IsNullOrEmpty(id) ? null : Lista(lista).OfType<JsonObject>().FirstOrDefault(fila => Texto(fila["id"]) == id);

        public bool Existe(string lista, string? id) => Buscar(lista, id) is not null;

        /// <summary>Quita la fila con ese id y dice si estaba.</summary>
        public bool Quitar(string lista, string id)
        {
            JsonArray filas = Lista(lista);
            JsonNode? fila = filas.FirstOrDefault(f => Texto(f?["id"]) == id);
            return fila is not null && filas.Remove(fila);
        }

        /// <summary>Código tipo GAL-0003-9F2A41C7: el orden cuenta los códigos ya usados y el sufijo evita choques entre sesiones.</summary>
        public string CodigoUnico(string prefijo)
        {
            var usados = new HashSet<string>();
            foreach (string lista in ListasConCodigo)
                foreach (JsonNode? fila in Lista(lista))
                    if (Texto(fila?["code"]) is { Length: > 0 } codigo) usados.Add(codigo);
            int orden = usados.Count + 1;
            string codigo2;
            do { codigo2 = $"{prefijo}-{orden++:D4}-{Guid.NewGuid():N}"[..(prefijo.Length + 6 + 8)].ToUpperInvariant(); }
            while (usados.Contains(codigo2));
            return codigo2;
        }

        public static string NuevoId(string prefijo) => $"{prefijo}-{Guid.NewGuid()}";

        public static string? Texto(JsonNode? nodo) => nodo is JsonValue valor && valor.TryGetValue(out string? texto) ? texto : null;

        public static decimal Numero(JsonNode? nodo) =>
            nodo is JsonValue && decimal.TryParse(nodo.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out decimal valor) ? valor : 0m;
    }
}
