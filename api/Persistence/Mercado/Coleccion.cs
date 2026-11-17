using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using PicoCriollo.Domain.Entities.MercadoE;
using PicoCriollo.Domain.Mercado;
using PicoCriollo.Infrastructure;

namespace PicoCriollo.Persistence.Mercado
{
    /// <summary>
    /// Una tabla pc_* del mercado vista como colección de documentos: mismas reglas que el driver de la app actual (leer con
    /// bloqueo de fila, listar por igualdad de campos del documento, insertar y actualizar el documento entero).
    /// Los cambios se acumulan en el contexto y se guardan juntos al terminar la orden (ver <see cref="AlmacenMercado.EjecutarAsync{T}"/>).
    /// </summary>
    public sealed partial class Coleccion<T> where T : class
    {
        private readonly DBContext _contexto;
        private readonly string _tabla;
        private readonly Func<T, string> _idDe;

        public Coleccion(DBContext contexto, string tabla, Func<T, string> idDe)
        {
            _contexto = contexto;
            _tabla = tabla;
            _idDe = idDe;
        }

        [GeneratedRegex("^[A-Za-z][A-Za-z0-9]*$")] private static partial Regex NombreSeguro();

        private DbSet<FilaDocumento> Tabla => _contexto.Set<FilaDocumento>(_tabla);
        private bool EsPostgres => _contexto.Database.IsNpgsql();

        private static T Leer(FilaDocumento fila) => JsonSerializer.Deserialize<T>(fila.Datos, JsonMercado.Opciones)!;

        // OJO: DbSet.Local de un tipo compartido mezcla las filas de todas las tablas del mercado; se filtra por el nombre de la entidad.
        private IEnumerable<EntityEntry<FilaDocumento>> Rastreadas() =>
            _contexto.ChangeTracker.Entries<FilaDocumento>().Where(e => e.Metadata.Name == _tabla && e.State != EntityState.Deleted && e.State != EntityState.Detached);

        private bool EstaEliminada(string id) =>
            _contexto.ChangeTracker.Entries<FilaDocumento>().Any(e => e.Metadata.Name == _tabla && e.State == EntityState.Deleted && e.Entity.Id == id);

        private FilaDocumento? Rastreada(string id) => Rastreadas().Select(e => e.Entity).FirstOrDefault(f => f.Id == id);

        private IEnumerable<FilaDocumento> NuevasSinGuardar() => Rastreadas().Where(e => e.State == EntityState.Added).Select(e => e.Entity);

        /// <summary>El documento con ese id, o null. Con <paramref name="bloquear"/> toma la fila con FOR UPDATE: nadie más la cambia hasta que termine la orden.</summary>
        public async Task<T?> ObtenerAsync(string id, bool bloquear = false)
        {
            FilaDocumento? fila = Rastreada(id);
            if (fila is null && EstaEliminada(id)) return null;
            if (fila is null)
            {
                if (EsPostgres)
                    fila = (await Tabla.FromSqlRaw($"SELECT id, data FROM {_tabla} WHERE id = {{0}}{(bloquear ? " FOR UPDATE" : "")}", id).ToListAsync()).FirstOrDefault();
                else
                    fila = await Tabla.FirstOrDefaultAsync(f => f.Id == id);
            }
            return fila is null ? null : Leer(fila);
        }

        /// <summary>Los documentos cuyos campos de texto coinciden con todos los filtros (igual que <c>data-&gt;&gt;'campo' = valor</c>).</summary>
        public async Task<List<T>> ListarAsync(params (string Campo, string Valor)[] filtros)
        {
            foreach (var (campo, _) in filtros)
                if (!NombreSeguro().IsMatch(campo)) throw new InvalidOperationException("Nombre de campo no válido.");

            List<FilaDocumento> filas;
            if (EsPostgres)
            {
                string donde = filtros.Length == 0 ? "" : " WHERE " + string.Join(" AND ", filtros.Select((f, i) => $"data->>'{f.Campo}' = {{{i}}}"));
                filas = await Tabla.FromSqlRaw($"SELECT id, data FROM {_tabla}{donde}", filtros.Select(f => (object)f.Valor).ToArray()).ToListAsync();
            }
            else
            {
                filas = (await Tabla.ToListAsync()).Where(f => Coincide(f.Datos, filtros)).ToList();
            }
            filas.RemoveAll(f => EstaEliminada(f.Id));
            foreach (FilaDocumento nueva in NuevasSinGuardar())
                if (filas.All(f => f.Id != nueva.Id) && Coincide(nueva.Datos, filtros)) filas.Add(nueva);
            return filas.Select(Leer).ToList();
        }

        public Task<List<T>> ListarAsync(string campo, string valor) => ListarAsync((campo, valor));

        public void Insertar(T documento)
        {
            string id = _idDe(documento);
            Tabla.Add(new FilaDocumento { Id = id, Datos = JsonSerializer.Serialize(documento, JsonMercado.Opciones) });
        }

        /// <summary>Borra el documento (si estaba sin guardar, simplemente no se guarda).</summary>
        public void Eliminar(T documento)
        {
            string id = _idDe(documento);
            FilaDocumento? fila = Rastreada(id);
            if (fila is not null) Tabla.Remove(fila);
        }

        /// <summary>Escribe el documento entero sobre la fila que ya se leyó en esta orden.</summary>
        public void Actualizar(T documento)
        {
            string id = _idDe(documento);
            FilaDocumento fila = Rastreada(id)
                ?? throw new InvalidOperationException($"El registro {id} de {_tabla} no se cargó antes de actualizarlo.");
            fila.Datos = JsonSerializer.Serialize(documento, JsonMercado.Opciones);
        }

        private static bool Coincide(string datos, (string Campo, string Valor)[] filtros)
        {
            if (filtros.Length == 0) return true;
            using JsonDocument documento = JsonDocument.Parse(datos);
            foreach (var (campo, valor) in filtros)
            {
                if (!documento.RootElement.TryGetProperty(campo, out JsonElement e)) return false;
                string? actual = e.ValueKind switch
                {
                    JsonValueKind.String => e.GetString(),
                    JsonValueKind.Number => e.GetRawText(),
                    JsonValueKind.True => "true",
                    JsonValueKind.False => "false",
                    _ => null,
                };
                if (actual != valor) return false;
            }
            return true;
        }
    }
}
