// Lógica pura de las ventas (sin React ni red): totales, estado del pago, qué se puede vender y el cuerpo que espera la API.
// La API vuelve a validar todo: esto evita botones y viajes inútiles.
import type { Granja } from '../granja/modelos.ts';

export const PRODUCTOS = ['Huevo fértil', 'Huevo consumo', 'Pollito', 'Ave adulta', 'Otro'] as const;
export type Producto = (typeof PRODUCTOS)[number];

export interface LineaBorrador { producto: Producto; origen: string; descripcion: string; cantidad: string; precio: string; descuento: string; unidad: string }
export const lineaVacia = (producto: Producto = 'Huevo fértil'): LineaBorrador => ({ producto, origen: '', descripcion: '', cantidad: '1', precio: '', descuento: '0', unidad: 'unidad' });

/** Un número escrito como lo escriben las personas («2.500», «$ 1000», «2,5»). Vacío no es cero: es «falta el dato». */
const aNumero = (texto: string): number => {
  const limpio = texto.trim().replace(/[\s$]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return limpio === '' ? Number.NaN : Number(limpio);
};

export const totalLinea = (l: Pick<LineaBorrador, 'cantidad' | 'precio' | 'descuento'>): number => {
  const bruto = aNumero(l.cantidad) * aNumero(l.precio), descuento = aNumero(l.descuento || '0');
  return Number.isFinite(bruto) && Number.isFinite(descuento) ? Math.max(0, bruto - descuento) : 0;
};
export const totalVenta = (lineas: LineaBorrador[]): number => lineas.reduce((suma, l) => suma + totalLinea(l), 0);

export type EstadoDePago = 'Pendiente' | 'Parcial' | 'Pagado';

/** El estado que corresponde al abono: nada = pendiente, todo = pagado, en medio = parcial. */
export const estadoDePagoPara = (total: number, abono: number): EstadoDePago => (abono <= 0 ? 'Pendiente' : abono >= total ? 'Pagado' : 'Parcial');

export const cambio = (total: number, recibido: number): number => Math.max(0, recibido - total);

export function tonoDeVenta(estado: string): 'ok' | 'aviso' | 'error' | 'neutro' {
  if (estado === 'Pagado') return 'ok';
  if (estado === 'Pendiente' || estado === 'Parcial' || estado === 'Devuelta parcial') return 'aviso';
  if (estado === 'Cancelada' || estado === 'Devuelta') return 'error';
  return 'neutro';
}

export interface Fuente { valor: string; etiqueta: string; disponible: number; precio?: number; unidad?: string }

/** Lo que se puede vender para cada tipo de producto, según lo que hay disponible en la granja. */
export function fuentesDe(producto: Producto, granja: Granja): Fuente[] {
  switch (producto) {
    case 'Huevo fértil':
    case 'Huevo consumo': {
      const tipo = producto === 'Huevo consumo' ? 'Huevo consumo' : 'Huevo fértil';
      return granja.fertileLots
        .filter(l => l.available > 0 && l.sourceDestination !== 'Incubación' && (l.productType ?? 'Huevo fértil') === tipo)
        .map(l => ({ valor: l.id, etiqueta: `${l.code} · ${l.breed} · ${l.available} disp.`, disponible: l.available, unidad: 'unidad' }));
    }
    case 'Pollito':
      return [
        ...granja.chickLots.filter(l => l.available > 0).map(l => ({ valor: `lote:${l.id}`, etiqueta: `${l.code} · ${l.breed} · ${l.available} disp.`, disponible: l.available, unidad: 'unidad' })),
        ...granja.birds.filter(a => a.sex === 'Pollito' && !['Vendido', 'Fallecido', 'Transferido'].includes(a.status)).map(a => ({ valor: `ave:${a.id}`, etiqueta: `${a.name} (individual)`, disponible: 1, unidad: 'unidad' })),
      ];
    case 'Ave adulta':
      return granja.birds.filter(a => a.sex !== 'Pollito' && !['Vendido', 'Fallecido', 'Transferido'].includes(a.status)).map(a => ({ valor: `ave:${a.id}`, etiqueta: `${a.name}${a.breed ? ` · ${a.breed}` : ''}`, disponible: 1, unidad: 'ave' }));
    case 'Otro':
      return granja.customProducts.filter(p => p.available > 0).map(p => ({ valor: p.id, etiqueta: `${p.name} · ${p.available} ${p.unit} disp.`, disponible: p.available, precio: p.price, unidad: p.unit }));
  }
}

export function validarLinea(l: LineaBorrador, granja: Granja): string | null {
  if (!l.origen) return l.producto === 'Otro' ? 'Elige un producto del catálogo.' : l.producto === 'Ave adulta' ? 'Elige el ave.' : 'Elige de dónde sale.';
  const cantidad = aNumero(l.cantidad), precio = aNumero(l.precio), descuento = aNumero(l.descuento || '0');
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 'La cantidad debe ser mayor que cero.';
  if (l.producto !== 'Otro' && !Number.isInteger(cantidad)) return 'Los huevos, pollitos y aves se venden por unidades enteras.';
  if (l.producto === 'Ave adulta' && cantidad !== 1) return 'Un ave se vende de a una.';
  if (!Number.isFinite(precio) || precio < 0) return 'Escribe el precio unitario.';
  if (!Number.isFinite(descuento) || descuento < 0 || descuento > cantidad * precio) return 'El descuento no puede ser mayor que el valor de la línea.';
  const fuente = fuentesDe(l.producto, granja).find(f => f.valor === l.origen);
  if (!fuente) return 'Lo que elegiste ya no está disponible.';
  if (cantidad > fuente.disponible) return `Solo hay ${fuente.disponible} disponibles.`;
  return null;
}

export interface BorradorDeVenta { clienteId: string; fecha: string; lineas: LineaBorrador[]; abono: string; medio: string; recibido: string; notas: string }

export function validarVenta(b: BorradorDeVenta, granja: Granja): string | null {
  if (b.lineas.length === 0) return 'Agrega al menos un producto a la venta.';
  for (const [i, l] of b.lineas.entries()) { const error = validarLinea(l, granja); if (error) return `Producto ${i + 1}: ${error}`; }
  const total = totalVenta(b.lineas), abono = aNumero(b.abono || '0');
  if (!Number.isFinite(abono) || abono < 0) return 'El abono no es válido.';
  if (abono > total) return 'El abono no puede superar el total de la venta.';
  if (b.medio === 'Efectivo' && abono >= total && total > 0 && aNumero(b.recibido || String(abono)) < total) return 'El efectivo recibido debe cubrir el total.';
  return null;
}

/** El cuerpo de la petición. La clave de idempotencia la pone quien llama: una por intento. */
export function aCuerpoDeVenta(b: BorradorDeVenta, clave: string, granjaNombre: string) {
  const total = totalVenta(b.lineas), abono = aNumero(b.abono || '0');
  return {
    customerId: b.clienteId || undefined, date: b.fecha, paymentStatus: estadoDePagoPara(total, abono), paymentMethod: abono > 0 ? b.medio : undefined, paid: abono,
    tendered: b.medio === 'Efectivo' && abono > 0 ? aNumero(b.recibido || String(abono)) : undefined, farmName: granjaNombre, notes: b.notas.trim(), idempotencyKey: clave,
    lines: b.lineas.map(l => ({
      product: l.producto, description: l.descripcion.trim() || undefined, quantity: aNumero(l.cantidad), unit: l.unidad, unitPrice: aNumero(l.precio), discount: aNumero(l.descuento || '0'),
      ...(l.origen.startsWith('ave:') ? { birdId: l.origen.slice(4) } : { sourceLotId: l.origen.startsWith('lote:') ? l.origen.slice(5) : l.origen }),
    })),
  };
}

export interface PendienteDeLote { recoleccionId: string; etiqueta: string; destino: 'Venta' | 'Consumo' | 'Incubación'; pendiente: number }

/** Huevos de cada recolección que quedaron para venta, consumo o incubación y todavía no están en un lote. */
export function pendientesPorAsignar(granja: Granja): PendienteDeLote[] {
  const filas: PendienteDeLote[] = [];
  for (const r of granja.eggs) {
    for (const [destino, presupuesto] of [['Venta', r.sale], ['Consumo', r.consumption], ['Incubación', r.incubation]] as const) {
      const asignado = granja.fertileLots.filter(l => l.sourceCollectionId === r.id && !l.parentLotId && l.sourceDestination === destino).reduce((suma, l) => suma + l.initial, 0);
      if (presupuesto - asignado > 0) filas.push({ recoleccionId: r.id, etiqueta: `${r.code ?? r.id} · ${r.date} · ${destino.toLowerCase()}`, destino, pendiente: presupuesto - asignado });
    }
  }
  return filas;
}
