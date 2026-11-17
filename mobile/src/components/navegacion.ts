export type Seccion = 'inicio' | 'granja' | 'mercado' | 'perfil' | 'mas';

/** La granja conserva sus pantallas internas; Inicio siempre abre el feed social. */
export function seccionDeRuta(ruta: string): Seccion {
  const primera = ruta.split('/').filter(Boolean)[0] ?? '';
  if (!primera || primera === 'inicio' || primera === 'reels') return 'inicio';
  if (primera === 'mercado') return 'mercado';
  if (primera === 'perfil') return 'perfil';
  if (['mas', 'notificaciones', 'moderacion'].includes(primera)) return 'mas';
  return 'granja';
}
