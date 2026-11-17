// Lógica pura del mercado (sin React ni red): textos de estados, qué puede hacer cada parte y validación del formulario de publicar.
// Las reglas de verdad las aplica la API; esto solo evita ofrecer botones que ella rechazaría.

export type Tono = 'neutro' | 'ok' | 'aviso' | 'error';

const PUBLICACION: Record<string, { texto: string; tono: Tono }> = {
  borrador: { texto: 'Borrador', tono: 'neutro' }, publicada: { texto: 'Publicada', tono: 'ok' }, pausada: { texto: 'Pausada', tono: 'aviso' },
  en_operacion: { texto: 'En operación', tono: 'aviso' }, vendida: { texto: 'Vendida', tono: 'ok' }, retirada: { texto: 'Retirada', tono: 'neutro' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' }, rechazada: { texto: 'Rechazada', tono: 'error' }, cerrada_sin_ofertas: { texto: 'Cerrada sin venta', tono: 'neutro' },
};
export const estadoPublicacion = (estado: string) => PUBLICACION[estado] ?? { texto: estado, tono: 'neutro' as Tono };

const OPERACION: Record<string, { texto: string; tono: Tono }> = {
  solicitud_recibida: { texto: 'Solicitud enviada', tono: 'aviso' }, aceptada: { texto: 'Aceptada', tono: 'ok' }, pago_pendiente: { texto: 'Pago pendiente', tono: 'aviso' },
  pago_registrado: { texto: 'Pago declarado', tono: 'aviso' }, entrega_pendiente: { texto: 'Entrega pendiente', tono: 'aviso' }, entrega_confirmada: { texto: 'Entregada', tono: 'aviso' },
  completada: { texto: 'Completada', tono: 'ok' }, cancelada: { texto: 'Cancelada', tono: 'neutro' }, disputada: { texto: 'En disputa', tono: 'error' },
};
export const estadoOperacion = (estado: string) => OPERACION[estado] ?? { texto: estado, tono: 'neutro' as Tono };

export const TIPO_PUBLICACION: Record<string, string> = { fixed: 'Precio fijo', auction: 'Subasta', interest: 'Consultar precio' };

/** Lo que la persona puede hacer sobre una operación según su papel y el estado. Espejo de las reglas de la API. */
export type AccionOperacion = 'aceptar' | 'rechazar' | 'retirar' | 'pagar' | 'confirmar_pago' | 'entregar' | 'recibir' | 'cancelar' | 'disputar' | 'contacto' | 'valorar';

export function accionesDe(rol: 'comprador' | 'vendedor', estado: string, puedeValorar = false): AccionOperacion[] {
  const comprador = rol === 'comprador';
  switch (estado) {
    case 'solicitud_recibida': return comprador ? ['retirar'] : ['aceptar', 'rechazar'];
    case 'pago_pendiente': return comprador ? ['pagar', 'cancelar', 'disputar', 'contacto'] : ['confirmar_pago', 'cancelar', 'disputar', 'contacto'];
    case 'pago_registrado': return comprador ? ['cancelar', 'disputar', 'contacto'] : ['confirmar_pago', 'cancelar', 'disputar', 'contacto'];
    case 'entrega_pendiente': return comprador ? ['cancelar', 'disputar', 'contacto'] : ['entregar', 'cancelar', 'disputar', 'contacto'];
    case 'entrega_confirmada': return comprador ? ['recibir', 'disputar', 'contacto'] : ['disputar', 'contacto'];
    case 'completada': return puedeValorar ? ['valorar'] : [];
    default: return [];
  }
}

/** Qué sigue en la operación, dicho para la persona. */
export function siguientePaso(rol: 'comprador' | 'vendedor', estado: string): string {
  const comprador = rol === 'comprador';
  switch (estado) {
    case 'solicitud_recibida': return comprador ? 'Esperando que el vendedor responda.' : 'Alguien quiere comprar esta ave. Acepta o rechaza la solicitud.';
    case 'pago_pendiente': return comprador ? 'Paga al vendedor por fuera de la app y luego declara tu pago.' : 'Espera el pago del comprador. Cuando lo recibas, confírmalo.';
    case 'pago_registrado': return comprador ? 'Esperando que el vendedor confirme que recibió el pago.' : 'El comprador dice que ya pagó. Confirma cuando lo veas en tu cuenta.';
    case 'entrega_pendiente': return comprador ? 'Pago confirmado. Coordina la entrega con el vendedor.' : 'Pago confirmado. Entrega el ave y márcalo aquí.';
    case 'entrega_confirmada': return comprador ? 'El vendedor dice que ya entregó. Confirma la recepción para cerrar la compra.' : 'Esperando que el comprador confirme que recibió el ave.';
    case 'completada': return 'Compra cerrada: el ave ya está en la granja del comprador.';
    case 'disputada': return 'La operación está en disputa y un moderador la revisará.';
    default: return '';
  }
}

/** «2 d 3 h», «45 min» o «Cerrada». Redondea hacia abajo para no prometer tiempo que no queda. */
export function tiempoRestante(cierre: string | null | undefined, ahora: Date): string {
  if (!cierre) return '';
  const falta = new Date(cierre).getTime() - ahora.getTime();
  if (Number.isNaN(falta) || falta <= 0) return 'Cerrada';
  const minutos = Math.floor(falta / 60_000), horas = Math.floor(minutos / 60), dias = Math.floor(horas / 24);
  if (dias >= 1) return horas % 24 ? `${dias} d ${horas % 24} h` : `${dias} d`;
  if (horas >= 1) return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`;
  return `${Math.max(minutos, 1)} min`;
}

// ---------- publicar ----------

export interface ValoresPublicacion {
  tipoAnuncio: string; // fixed | auction | interest
  itemType: 'ave' | 'lote_pollitos' | 'lote_huevos' | 'insumo';
  loteId: string;
  cantidad: string;
  aves: string[]; // una sola = «Un ave»; dos o más = lote de aves
  precio: string;
  precioInicial: string;
  reserva: string;
  incremento: string;
  horas: string; // duración de la subasta
  antiFrancotirador: boolean;
  descripcion: string;
  zona: string;
  condiciones: string;
}

export const publicacionInicial = (): ValoresPublicacion => ({ tipoAnuncio: 'fixed', itemType: 'ave', loteId: '', cantidad: '', aves: [], precio: '', precioInicial: '', reserva: '', incremento: '', horas: '48', antiFrancotirador: true, descripcion: '', zona: '', condiciones: '' });

/** Solo dígitos: acepta «150.000», «$ 150000» o «150 000». Vacío = sin valor; no numérico = NaN. */
export function aPesos(texto: string): number | null {
  const limpio = texto.replace(/[\s$.,]/g, '');
  if (!limpio) return null;
  return /^\d+$/.test(limpio) ? Number(limpio) : Number.NaN;
}

export function validarPublicacion(v: ValoresPublicacion): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.itemType !== 'ave') {
    if (!v.loteId) e.loteId = 'Elige un lote o insumo.';
    if (!/^\d+$/.test(v.cantidad) || Number(v.cantidad) < 1) e.cantidad = 'La cantidad debe ser un entero mayor que cero.';
  } else if (v.aves.length === 0) e.aves = 'Elige al menos un ave.';
  else if (v.aves.length > 50) e.aves = 'Un lote admite como máximo 50 aves.';
  if (v.tipoAnuncio === 'fixed') {
    const p = aPesos(v.precio);
    if (p === null || Number.isNaN(p) || p <= 0) e.precio = 'Indica un precio en pesos colombianos.';
    else if (p > 1_000_000_000) e.precio = 'El precio es demasiado alto.';
  }
  if (v.tipoAnuncio === 'auction') {
    const inicial = aPesos(v.precioInicial);
    if (inicial === null || Number.isNaN(inicial) || inicial < 1_000) e.precioInicial = 'El precio inicial debe ser de al menos $1.000.';
    const reserva = aPesos(v.reserva);
    if (reserva !== null && (Number.isNaN(reserva) || (inicial !== null && !Number.isNaN(inicial) && reserva < inicial))) e.reserva = 'La reserva no puede ser menor que el precio inicial.';
    const incremento = aPesos(v.incremento);
    if (incremento !== null && (Number.isNaN(incremento) || incremento < 100)) e.incremento = 'El incremento mínimo es de $100.';
    const horas = Number(v.horas);
    if (!Number.isInteger(horas) || horas < 1 || horas > 720) e.horas = 'La subasta dura entre 1 y 720 horas (30 días).';
  }
  if (v.condiciones.length > 1000) e.condiciones = 'Las condiciones superan 1000 caracteres.';
  if (v.descripcion.length > 1200) e.descripcion = 'La descripción supera 1200 caracteres.';
  return e;
}

/** El cuerpo que espera la API a partir de los valores ya validados. */
export function aCuerpoPublicacion(v: ValoresPublicacion, ahora: Date, publicar: boolean): Record<string, unknown> {
  const lote = v.aves.length > 1;
  const existencias = v.itemType !== 'ave';
  const cuerpo: Record<string, unknown> = {
    kind: v.tipoAnuncio, itemType: existencias ? v.itemType : lote ? 'lote_aves' : 'ave', ...(existencias ? { lotId: v.loteId, quantity: Number(v.cantidad) } : lote ? { birdIds: v.aves } : { birdId: v.aves[0] }),
    terms: v.condiciones.trim(), publish: publicar,
    consent: { description: v.descripcion.trim(), deliveryZone: v.zona.trim() },
  };
  if (v.tipoAnuncio === 'fixed') cuerpo.price = aPesos(v.precio);
  if (v.tipoAnuncio === 'auction') {
    cuerpo.auction = {
      startingPrice: aPesos(v.precioInicial), antiSniping: v.antiFrancotirador,
      closesAt: new Date(ahora.getTime() + Number(v.horas) * 3_600_000).toISOString(),
      ...(aPesos(v.reserva) !== null ? { reservePrice: aPesos(v.reserva) } : {}), ...(aPesos(v.incremento) !== null ? { minIncrement: aPesos(v.incremento) } : {}),
    };
  }
  return cuerpo;
}
