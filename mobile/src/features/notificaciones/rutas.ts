// A dónde lleva una notificación. La API da una vista (`publicaciones`, `compras-mercado`…) y un id; aquí se traduce a una ruta de la app.
// Lo que todavía no existe en la app nueva (nacimientos, reproducción) lleva al inicio.

const POR_VISTA: Record<string, (id?: string) => string> = {
  publicaciones: () => '/mercado/mias',
  ofertas: () => '/mercado/ofertas',
  'compras-mercado': () => '/mercado/operaciones',
  mensajes: id => (id ? `/mercado/chat/${id}` : '/mercado/mensajes'),
  facturas: id => (id ? `/mercado/factura/${id}` : '/mercado/facturas'),
  mercado: () => '/mercado',
  aves: () => '/aves',
  incubaciones: () => '/incubaciones',
  mantenimiento: () => '/agenda',
  inventario: () => '/inventario',
  inicio: () => '/inicio',
  perfil: () => '/perfil',
  moderacion: () => '/moderacion',
  // El enlace de una publicación del perfil es «<id del autor>#<id de la publicación>».
  post: id => {
    const [autor, publicacion] = (id ?? '').split('#');
    return publicacion ? `/reels/publicacion/${publicacion}` : autor ? `/perfil/${autor}` : '/reels';
  },
};

export function rutaDeAviso(vista: string, id?: string | null): string {
  return (POR_VISTA[vista] ?? (() => '/inicio'))(id ?? undefined);
}

/** Texto corto del tipo de aviso para agrupar o filtrar. */
export const CATEGORIAS: Record<string, string> = {
  incubacion: 'Incubación', salud: 'Salud', mantenimiento: 'Mantenimiento', inventario: 'Inventario', comercial: 'Mercado', transferencia: 'Entregas', seguridad: 'Cuenta', sistema: 'Sistema',
};
