using System.Globalization;
using PicoCriollo.Domain.Excepciones;

namespace PicoCriollo.Domain.Utilidades
{
    /// <summary>Opciones y validaciones de «Mi granja». Mismas listas que MODULES en src/models/farm.ts; el servidor no confía en el cliente.</summary>
    public static class ReglasGranja
    {
        public static readonly string[] TiposGallinero = ["Piso", "Pastoril", "Mixto", "Cría"];
        public static readonly string[] EstadosGallinero = ["Activo", "Inactivo", "En mantenimiento"];
        public static readonly string[] Sexos = ["Gallina", "Gallo", "Pollito"];
        public static readonly string[] EstadosAve = ["Activo", "En reproducción", "Clueca", "Inactivo", "Vendido", "Fallecido"];
        public static readonly string[] TiposIncubacion = ["Natural", "Artificial"];
        public static readonly string[] EstadosIncubacion = ["En curso", "Finalizada", "Interrumpida"];
        public static readonly string[] CategoriasCompra = ["Alimento ponedoras", "Alimento engorde", "Maíz triturado", "Viruta y aserrín", "Veterinaria", "Materiales", "Equipos", "Otros"];
        public static readonly string[] UnidadesCompra = ["kg", "bulto", "saco", "unidad", "litro"];
        public static readonly string[] EstadosTarea = ["Pendiente", "Próxima", "Vencida", "Completada"];
        /// <summary>Estados en los que un ave sigue en la granja (los usa el resumen y la regla de la clueca).</summary>
        public static readonly string[] EstadosActivos = ["Activo", "En reproducción", "Clueca"];
        /// <summary>Estados que terminan la vida útil del ave en la granja: su anillo se retira.</summary>
        public static readonly string[] EstadosQueRetiranAnillo = ["Vendido", "Fallecido", "Inactivo"];
        public const int DiasIncubacion = 21;

        public static string Fecha(string? valor, string campo, bool obligatoria)
        {
            if (string.IsNullOrWhiteSpace(valor))
            {
                if (obligatoria) throw ReglaNegocioException.Validacion($"{campo}: elige una fecha.");
                return string.Empty;
            }
            if (!DateOnly.TryParseExact(valor.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateOnly fecha))
                throw ReglaNegocioException.Validacion($"{campo}: usa el formato AAAA-MM-DD.");
            return fecha.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        public static string Opcion(string? valor, string[] validas, string campo, string porDefecto)
        {
            if (string.IsNullOrWhiteSpace(valor)) return porDefecto;
            string limpio = valor.Trim();
            if (!validas.Contains(limpio)) throw ReglaNegocioException.Validacion($"{campo}: elige una de estas opciones: {string.Join(", ", validas)}.");
            return limpio;
        }

        public static string OpcionObligatoria(string? valor, string[] validas, string campo)
        {
            if (string.IsNullOrWhiteSpace(valor)) throw ReglaNegocioException.Validacion($"{campo}: elige una opción.");
            return Opcion(valor, validas, campo, string.Empty);
        }

        public static int Entero(int valor, string campo, int minimo, int maximo = 1_000_000)
        {
            if (valor < minimo) throw ReglaNegocioException.Validacion($"{campo}: el valor debe ser {(minimo > 0 ? $"al menos {minimo}" : "cero o mayor")}.");
            if (valor > maximo) throw ReglaNegocioException.Validacion($"{campo}: el valor no puede pasar de {maximo}.");
            return valor;
        }

        public static decimal Cantidad(decimal valor, string campo, decimal minimo, bool exclusivo = false, decimal maximo = 1_000_000_000m)
        {
            if (exclusivo ? valor <= minimo : valor < minimo) throw ReglaNegocioException.Validacion($"{campo}: el valor debe ser {(exclusivo ? $"mayor que {minimo}" : minimo > 0 ? $"al menos {minimo}" : "cero o mayor")}.");
            if (valor > maximo) throw ReglaNegocioException.Validacion($"{campo}: el valor es demasiado grande.");
            return valor;
        }

        public static string Texto(string? valor) => (valor ?? string.Empty).Trim();

        public static string Obligatorio(string? valor, string campo)
        {
            string limpio = Texto(valor);
            if (limpio.Length == 0) throw ReglaNegocioException.Validacion($"{campo}: este dato es obligatorio.");
            return limpio;
        }

        /// <summary>incubación + consumo + venta no pueden pasar de lo recolectado (eggAllocationValid en la app actual).</summary>
        public static bool ReparticionDeHuevosValida(int total, int incubacion, int consumo, int venta) => incubacion + consumo + venta <= total;

        public static bool PuedeConsumir(decimal pedido, decimal disponible) => pedido > 0 && pedido <= disponible;

        public static string FechaEclosionEstimada(string inicio, int ajusteDias = 0) =>
            DateOnly.ParseExact(inicio, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(DiasIncubacion + ajusteDias).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        public static string ProximoMantenimiento(string ultimaVez, int frecuenciaDias) =>
            DateOnly.ParseExact(ultimaVez, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(frecuenciaDias).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        public static string Hoy(string? indicada, DateTime ahoraUtc) =>
            string.IsNullOrWhiteSpace(indicada) ? ahoraUtc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : Fecha(indicada, "Fecha de hoy", true);
    }
}
