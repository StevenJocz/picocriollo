using System.Text.Json;

namespace PicoCriollo.Domain.Utilidades
{
    /// <summary>Documento de una granja nueva. Mismas listas que FARM_ARRAYS en src/server/farm-template.ts.</summary>
    public static class GranjaVacia
    {
        public static readonly string[] Listas =
        [
            "coops", "birds", "rings", "birdEvents", "eggs", "incubations", "births", "breedingGroups", "purchases", "stock",
            "movements", "maintenance", "fertileLots", "chickLots", "customers", "sales", "lotMovements", "customProducts",
        ];

        public static string Json() => JsonSerializer.Serialize(Listas.ToDictionary(nombre => nombre, _ => Array.Empty<object>()));
    }
}
