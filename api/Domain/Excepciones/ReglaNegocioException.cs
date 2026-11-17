namespace PicoCriollo.Domain.Excepciones
{
    /// <summary>Error de negocio con código HTTP. Los comandos lo lanzan y la API lo traduce a una respuesta.</summary>
    public class ReglaNegocioException : Exception
    {
        public int Estado { get; }

        public ReglaNegocioException(int estado, string mensaje) : base(mensaje) => Estado = estado;

        public static ReglaNegocioException Validacion(string mensaje) => new(400, mensaje);
        public static ReglaNegocioException NoAutorizado(string mensaje) => new(401, mensaje);
        public static ReglaNegocioException Prohibido(string mensaje) => new(403, mensaje);
        public static ReglaNegocioException NoEncontrado(string mensaje) => new(404, mensaje);
        public static ReglaNegocioException Conflicto(string mensaje) => new(409, mensaje);
    }
}
