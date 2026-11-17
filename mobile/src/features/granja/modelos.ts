// Forma del documento de la granja (la misma que src/models/farm.ts de la app Next.js). Solo los campos que esta app usa.

export interface Gallinero { id: string; code?: string; name: string; location?: string; capacity: number; type?: string; status: string; startedAt?: string; notes?: string }
export interface Ave { id: string; code?: string; name: string; species?: string; sex: 'Gallina' | 'Gallo' | 'Pollito'; breed?: string; coopId: string; status: string; bornAt?: string; origin?: string; motherId?: string; fatherId?: string; photo?: string; notes?: string }
export interface Recoleccion { id: string; code?: string; date: string; coopId: string; henId?: string; breedingGroupId?: string; eggs: number; broken: number; dirty: number; incubation: number; consumption: number; sale: number; notes?: string }
export interface Incubacion { id: string; code?: string; type?: 'Natural' | 'Artificial'; equipment?: string; henId?: string; coopId: string; startedAt: string; eggs: number; hatched: number; removed: number; hatchAdjustmentDays?: number; status: 'En curso' | 'Finalizada' | 'Interrumpida'; notes?: string }
export interface Compra { id: string; date: string; product: string; category?: string; quantity: number; unit?: string; unitPrice: number; supplier?: string; coopId?: string; notes?: string }
export interface Existencia { id: string; product: string; category?: string; quantity: number; unit: string; minimum: number }
export interface Movimiento { id: string; stockId: string; date: string; kind: 'Compra' | 'Consumo' | 'Ajuste'; quantity: number; coopId?: string; notes?: string }
export interface Tarea { id: string; title: string; coopId: string; frequencyDays: number; lastDone?: string; nextDue: string; status: string; stockId?: string; supplies: number; notes?: string }
export interface Nacimiento { id: string; code?: string; incubationId: string; date: string; count: number; motherId?: string; fatherId?: string; parentageStatus?: string; coopId?: string; breed?: string; notes?: string }
export interface GrupoReproductor { id: string; code?: string; name: string; coopId?: string; breed?: string; roosterId: string; henIds: string[]; startedAt: string; endedAt?: string; status: string; notes?: string }
export interface Anillo { id: string; number: number; birdId?: string; status: 'Asignado' | 'Temporalmente sin uso' | 'Retirado'; assignedAt: string; endedAt?: string; notes?: string }
export interface EventoAve { id: string; birdId: string; kind: 'Observación' | 'Salud' | 'Reproductivo'; date: string; title: string; details?: string; transferredFrom?: string }
export interface Cliente { id: string; code?: string; name: string; phone?: string; contact?: string; notes?: string }
export interface Producto { id: string; code?: string; name: string; category?: string; unit: string; price: number; available: number }
export interface LoteHuevos { id: string; code: string; sourceCollectionId: string; parentLotId?: string; sourceDestination?: 'Venta' | 'Consumo' | 'Incubación'; productType?: string; date: string; coopId: string; breed: string; initial: number; available: number; sold: number; incubated: number; discarded: number; fertility: string; storageNotes?: string; notes?: string }
export interface LineaDeVenta { id: string; product: string; sourceLotId?: string; sourceCode?: string; birdId?: string; description: string; quantity: number; returned?: number; unit?: string; unitPrice: number; discount: number }
export interface PagoDeVenta { id: string; date: string; amount: number; method: string; notes?: string }
export interface Venta { id: string; code: string; receiptCode?: string; createdAt?: string; date: string; customerId: string; lines: LineaDeVenta[]; paymentStatus: string; paymentMethod?: string; paid: number; refunded?: number; returnedTotal?: number; payments?: PagoDeVenta[]; notes?: string; receiptSnapshot?: { farmName: string; customerName: string; subtotal: number; discount: number; total: number; paid: number; tendered: number; change: number } }
export interface LotePollitos { id: string; code: string; birthId: string; breed: string; initial: number; available: number; sold: number }

export interface Granja {
  coops: Gallinero[];
  birds: Ave[];
  eggs: Recoleccion[];
  incubations: Incubacion[];
  purchases: Compra[];
  stock: Existencia[];
  movements: Movimiento[];
  maintenance: Tarea[];
  breedingGroups: GrupoReproductor[];
  births: Nacimiento[];
  rings: Anillo[];
  birdEvents: EventoAve[];
  chickLots: LotePollitos[];
  customers: Cliente[];
  customProducts: Producto[];
  fertileLots: LoteHuevos[];
  sales: Venta[];
}

export const granjaVacia = (): Granja => ({ coops: [], birds: [], eggs: [], incubations: [], purchases: [], stock: [], movements: [], maintenance: [], breedingGroups: [], births: [], rings: [], birdEvents: [], chickLots: [], customers: [], customProducts: [], fertileLots: [], sales: [] });

/** Completa las listas que falten (una granja vieja puede no traerlas todas). */
export function normalizarGranja(datos: unknown): Granja {
  const base = granjaVacia();
  if (!datos || typeof datos !== 'object') return base;
  const origen = datos as Record<string, unknown>;
  for (const clave of Object.keys(base) as (keyof Granja)[]) {
    const valor = origen[clave];
    if (Array.isArray(valor)) (base[clave] as unknown[]) = valor;
  }
  return base;
}
