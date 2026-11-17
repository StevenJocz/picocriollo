// Errores de negocio con código HTTP. Los servicios los lanzan; las rutas los traducen.
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'HttpError'; this.status = status; }
}
export class ValidationError extends HttpError { constructor(message: string) { super(400, message); } }
export class UnauthorizedError extends HttpError { constructor(message = 'Inicia sesión para continuar.') { super(401, message); } }
export class ForbiddenError extends HttpError { constructor(message = 'No tienes permiso para esta acción.') { super(403, message); } }
export class NotFoundError extends HttpError { constructor(message = 'No se encontró el recurso.') { super(404, message); } }
export class ConflictError extends HttpError { constructor(message: string) { super(409, message); } }
