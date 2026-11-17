using System.Globalization;
using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.GranjaD;

namespace PicoCriollo.Domain.Utilidades
{
    /// <summary>Trazabilidad de la granja (de dónde sale cada cosa) y resumen comercial. Mismo recorrido que traceability.ts en la app Next.js.</summary>
    public static class ReglasTrazabilidad
    {
        private sealed record Fila(string Id, string Codigo, string Tipo, string Titulo, string Fecha, string Detalle, List<string> Padres);

        private static string T(JsonObject o, string clave) => DocumentoGranja.Texto(o[clave]) ?? string.Empty;
        private static decimal N(JsonObject o, string clave) => DocumentoGranja.Numero(o[clave]);
        private static IEnumerable<JsonObject> De(DocumentoGranja d, string lista) => d.Lista(lista).OfType<JsonObject>();
        private static List<string> Lista(JsonNode? nodo) => nodo is JsonArray a ? a.Select(x => DocumentoGranja.Texto(x) ?? string.Empty).Where(x => x.Length > 0).ToList() : [];
        private static List<string> Ids(params string?[] ids) => ids.Where(i => !string.IsNullOrEmpty(i)).Select(i => i!).ToList();

        /// <summary>El gallo y las gallinas que tenía el grupo cuando se recolectó o clasificó (la foto que se guarda en el registro).</summary>
        private static List<string> Foto(JsonObject x)
        {
            var ids = new List<string>();
            if (x["groupSnapshot"] is JsonObject f) { ids.Add(T(f, "roosterId")); ids.AddRange(Lista(f["henIds"])); }
            return ids;
        }

        public static decimal TotalDeVenta(JsonObject venta) =>
            (venta["lines"] as JsonArray ?? []).OfType<JsonObject>().Sum(l => Math.Max(0, N(l, "quantity") * N(l, "unitPrice") - N(l, "discount")));

        private static List<Fila> Filas(DocumentoGranja d)
        {
            string NombreAve(string id) => d.Buscar("birds", id) is { } a ? T(a, "name") : string.Empty;
            string Linaje(JsonObject ave)
            {
                string padre = T(ave, "fatherId").Length > 0 ? (NombreAve(T(ave, "fatherId")) is { Length: > 0 } p ? p : "ave sin nombre") : "padre desconocido";
                string madre = T(ave, "motherId").Length > 0 ? (NombreAve(T(ave, "motherId")) is { Length: > 0 } m ? m : "ave sin nombre") : "madre desconocida";
                return $"Padre: {padre} · Madre: {madre}";
            }
            var filas = new List<Fila>();
            foreach (JsonObject x in De(d, "coops")) filas.Add(new(T(x, "id"), T(x, "code"), "Gallinero", T(x, "name"), T(x, "startedAt"), T(x, "location"), []));
            foreach (JsonObject x in De(d, "birds")) filas.Add(new(T(x, "id"), T(x, "code"), "Ave", T(x, "name"), T(x, "bornAt"), $"{T(x, "sex")} · {T(x, "breed")} · {Linaje(x)}", Ids(T(x, "coopId"), T(x, "motherId"), T(x, "fatherId"))));
            foreach (JsonObject x in De(d, "breedingGroups")) filas.Add(new(T(x, "id"), T(x, "code"), "Grupo reproductor", T(x, "name"), T(x, "startedAt"), T(x, "breed"), [.. Ids(T(x, "coopId"), T(x, "roosterId")), .. Lista(x["henIds"])]));
            foreach (JsonObject x in De(d, "eggs"))
                filas.Add(new(T(x, "id"), T(x, "code"), "Recolección", $"{N(x, "eggs")} huevos", T(x, "date"), $"{N(x, "consumption")} consumo · {N(x, "incubation")} incubación · {N(x, "sale")} venta",
                    [.. Ids(T(x, "coopId"), T(x, "breedingGroupId")), .. Foto(x)]));
            foreach (JsonObject x in De(d, "fertileLots"))
                filas.Add(new(T(x, "id"), T(x, "code"), "Lote de huevos fértiles", $"{N(x, "available")} disponibles", T(x, "date"), $"{T(x, "breed")} · Fertilidad {T(x, "fertility")}",
                    [.. Ids(T(x, "sourceCollectionId"), T(x, "coopId"), T(x, "breedingGroupId"), T(x, "parentLotId")), .. Foto(x)]));
            foreach (JsonObject x in De(d, "incubations")) filas.Add(new(T(x, "id"), T(x, "code"), "Incubación", $"{N(x, "eggs")} huevos", T(x, "startedAt"), T(x, "status"), [.. Ids(T(x, "henId"), T(x, "coopId")), .. Lista(x["sourceLotIds"])]));
            foreach (JsonObject x in De(d, "births"))
                filas.Add(new(T(x, "id"), T(x, "code"), "Nacimiento", $"{N(x, "count")} pollitos", T(x, "date"),
                    $"{T(x, "breed")} · Padre: {(T(x, "fatherId").Length > 0 ? (NombreAve(T(x, "fatherId")) is { Length: > 0 } p ? p : "ave sin nombre") : "desconocido")} · Madre: {(T(x, "motherId").Length > 0 ? (NombreAve(T(x, "motherId")) is { Length: > 0 } m ? m : "ave sin nombre") : "desconocida")}",
                    Ids(T(x, "incubationId"), T(x, "motherId"), T(x, "fatherId"))));
            foreach (JsonObject x in De(d, "chickLots"))
                filas.Add(new(T(x, "id"), T(x, "code"), "Lote de pollitos", $"{N(x, "available")} disponibles", d.Buscar("births", T(x, "birthId")) is { } n ? T(n, "date") : string.Empty, T(x, "breed"), [.. Ids(T(x, "birthId"), T(x, "incubationId")), .. Lista(x["sourceLotIds"])]));
            foreach (JsonObject x in De(d, "customers")) filas.Add(new(T(x, "id"), T(x, "code"), "Cliente", T(x, "name"), string.Empty, T(x, "phone"), []));
            foreach (JsonObject x in De(d, "customProducts")) filas.Add(new(T(x, "id"), T(x, "code"), "Producto", T(x, "name"), string.Empty, $"{N(x, "available")} {T(x, "unit")} disponibles", []));
            foreach (JsonObject x in De(d, "sales"))
            {
                filas.Add(new(T(x, "id"), T(x, "code"), "Venta", $"{TotalDeVenta(x).ToString("N0", new CultureInfo("es-CO"))} COP", T(x, "date"), T(x, "paymentStatus"),
                    [.. (x["lines"] as JsonArray ?? []).OfType<JsonObject>().Select(l => T(l, "sourceLotId").Length > 0 ? T(l, "sourceLotId") : T(l, "birdId")).Where(i => i.Length > 0), .. Ids(T(x, "customerId"))]));
                if (T(x, "receiptCode").Length > 0) filas.Add(new($"{T(x, "id")}-receipt", T(x, "receiptCode"), "Recibo de venta", T(x, "code"), T(x, "date"), T(x, "paymentStatus"), [T(x, "id")]));
            }
            return filas;
        }

        /// <summary>El registro con ese código (o id) y todo lo que lo originó, del más antiguo al más reciente.</summary>
        public static List<FilaDeTrazaDto> Trazar(DocumentoGranja d, string consulta)
        {
            var filas = Filas(d);
            string clave = consulta.Trim().ToLowerInvariant();
            Fila? elegida = filas.FirstOrDefault(f => f.Codigo.ToLowerInvariant() == clave || f.Id.ToLowerInvariant() == clave);
            if (elegida is null) return [];
            var porId = filas.GroupBy(f => f.Id).ToDictionary(g => g.Key, g => g.First());
            var vistos = new HashSet<string>();
            var resultado = new List<Fila>();
            void Visitar(Fila fila)
            {
                if (!vistos.Add(fila.Id)) return;
                foreach (string padre in fila.Padres) if (porId.TryGetValue(padre, out Fila? p)) Visitar(p);
                resultado.Add(fila);
            }
            Visitar(elegida);
            return resultado.Select(f => new FilaDeTrazaDto { Id = f.Id, Code = f.Codigo, Kind = f.Tipo, Title = f.Titulo, Date = f.Fecha, Details = f.Detalle }).ToList();
        }

        public static ResumenComercialDto Resumen(DocumentoGranja d, string desde, string hasta)
        {
            var ventas = De(d, "sales").Where(v => T(v, "paymentStatus") != "Cancelada" && string.CompareOrdinal(T(v, "date"), desde) >= 0 && string.CompareOrdinal(T(v, "date"), hasta) <= 0).ToList();
            decimal bruto = ventas.Sum(v => TotalDeVenta(v) - N(v, "returnedTotal"));
            decimal pagado = ventas.Sum(v => Math.Max(0, Math.Min(TotalDeVenta(v), N(v, "paid")) - N(v, "refunded")));
            var lineas = ventas.SelectMany(v => (v["lines"] as JsonArray ?? []).OfType<JsonObject>()).ToList();
            decimal Vendido(Func<string, bool> producto) => lineas.Where(l => producto(T(l, "product"))).Sum(l => N(l, "quantity"));
            int incubados = De(d, "fertileLots").Sum(l => (int)N(l, "incubated"));
            int nacidos = De(d, "births").Where(n => d.Buscar("incubations", T(n, "incubationId")) is { } inc && string.CompareOrdinal(T(inc, "startedAt"), desde) >= 0 && string.CompareOrdinal(T(inc, "startedAt"), hasta) <= 0).Sum(n => (int)N(n, "count"));
            return new ResumenComercialDto
            {
                Gross = bruto, Paid = pagado, Unpaid = Math.Max(0, bruto - pagado),
                EggsSold = Vendido(p => p is "Huevo fértil" or "Huevo consumo"), ChicksSold = Vendido(p => p == "Pollito"), AdultBirdsSold = Vendido(p => p == "Ave adulta"),
                AvailableEggs = De(d, "fertileLots").Sum(l => N(l, "available")), AvailableChicks = De(d, "chickLots").Sum(l => N(l, "available")),
                Hatched = nacidos, Incubated = incubados, HatchRate = incubados > 0 ? (double)nacidos / incubados : null,
            };
        }
    }
}
