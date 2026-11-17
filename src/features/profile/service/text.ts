import { ValidationError } from '../../../server/errors.ts';

// Texto de publicaciones y comentarios: limpio, sin caracteres de control (salvo salto de línea y tabulación) y sin contacto directo.

// Teléfonos y correos no se publican (la plataforma no permite sacar la negociación de aquí). Fechas y precios sí se permiten.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b|\b\d{10}\b/;
export const containsContact = (text: string): boolean => EMAIL.test(text) || PHONE.test(text);

/** Devuelve el texto limpio (puede quedar vacío). Lanza ValidationError si no es texto, es demasiado largo o trae contacto directo. */
export function cleanText(raw: unknown, max: number): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') throw new ValidationError('El texto no es válido.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) throw new ValidationError('El texto tiene caracteres no permitidos.');
  const text = raw.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (text.length > max) throw new ValidationError(`El texto supera ${max} caracteres.`);
  if (containsContact(text)) throw new ValidationError('No publiques teléfonos ni correos: el contacto se comparte dentro de una operación aceptada.');
  return text;
}
