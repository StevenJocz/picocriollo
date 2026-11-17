// Cálculos del inicio y de las listas. Funciones puras (sin React ni red) para poder probarlas con `npm test`.
// Replican las cuentas del tablero de la app Next.js (src/features/home/pages/dashboard.tsx y features/farm/service/rules.ts).
import type { Ave, Existencia, Granja, Incubacion, Tarea } from './modelos';

export const DIAS_INCUBACION = 21;
const DIA = 86_400_000;
const ESTADOS_ACTIVOS = ['Activo', 'En reproducción', 'Clueca'];

export const aFecha = (texto: string) => new Date(`${texto}T12:00:00`);
export const fechaTexto = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
export const hoyTexto = () => fechaTexto(new Date());

export function sumarDias(texto: string, dias: number): string {
  const fecha = aFecha(texto);
  fecha.setDate(fecha.getDate() + dias);
  return fechaTexto(fecha);
}

export const fechaEclosion = (inicio: string, ajusteDias = 0) => sumarDias(inicio, DIAS_INCUBACION + ajusteDias);

/** Días transcurridos desde `inicio` hasta `hoy` (nunca negativo). */
export function diasTranscurridos(inicio: string, hoy: string): number {
  return Math.max(0, Math.round((aFecha(hoy).getTime() - aFecha(inicio).getTime()) / DIA));
}

export const avesActivas = (aves: Ave[]) => aves.filter(a => ESTADOS_ACTIVOS.includes(a.status));

export interface ProximaEclosion { incubacion: Incubacion; gallina?: string; fecha: string }

/** La incubación en curso que eclosiona primero (con su gallina), o undefined si no hay ninguna. */
export function proximaEclosion(granja: Granja): ProximaEclosion | undefined {
  return granja.incubations
    .filter(i => i.status === 'En curso')
    .map(incubacion => ({ incubacion, gallina: granja.birds.find(a => a.id === incubacion.henId)?.name, fecha: fechaEclosion(incubacion.startedAt, incubacion.hatchAdjustmentDays ?? 0) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
}

/** Tiempo que falta hasta el mediodía de `fecha`, partido en días, horas, minutos y segundos. */
export function cuentaRegresiva(fecha: string, ahora: Date) {
  const faltan = Math.max(0, aFecha(fecha).getTime() - ahora.getTime());
  return {
    terminada: aFecha(fecha).getTime() - ahora.getTime() <= 0,
    dias: Math.floor(faltan / DIA),
    horas: Math.floor((faltan % DIA) / 3_600_000),
    minutos: Math.floor((faltan % 3_600_000) / 60_000),
    segundos: Math.floor((faltan % 60_000) / 1000),
  };
}

export interface ResumenGranja {
  gallinerosActivos: number;
  gallinerosTotal: number;
  aves: number;
  gallinas: number;
  gallos: number;
  huevosHoy: number;
  huevosSemana: number;
  huevosMes: number;
  gastosMes: number;
  /** Postura aproximada de la semana: huevos / (gallinas ponedoras × 7). null sin gallinas. */
  posturaPct: number | null;
  ultimosSieteDias: { fecha: string; huevos: number }[];
  tareasProximas: Tarea[];
  stockBajo: Existencia[];
}

export function resumenGranja(granja: Granja, hoy: string): ResumenGranja {
  const activas = avesActivas(granja.birds);
  const huevosDesde = (desde: string) => granja.eggs.filter(h => h.date >= desde && h.date <= hoy).reduce((suma, h) => suma + h.eggs, 0);
  const semana = sumarDias(hoy, -6);
  const mes = sumarDias(hoy, -29);
  const huevosSemana = huevosDesde(semana);
  const ponedoras = activas.filter(a => a.sex === 'Gallina' && a.status !== 'Clueca').length;
  return {
    gallinerosActivos: granja.coops.filter(c => c.status === 'Activo').length,
    gallinerosTotal: granja.coops.length,
    aves: activas.length,
    gallinas: activas.filter(a => a.sex === 'Gallina').length,
    gallos: activas.filter(a => a.sex === 'Gallo').length,
    huevosHoy: granja.eggs.filter(h => h.date === hoy).reduce((suma, h) => suma + h.eggs, 0),
    huevosSemana,
    huevosMes: huevosDesde(mes),
    gastosMes: granja.purchases.filter(c => c.date >= mes && c.date <= hoy).reduce((suma, c) => suma + Math.round(c.quantity * c.unitPrice), 0),
    posturaPct: ponedoras ? Math.round((huevosSemana / (ponedoras * 7)) * 100) : null,
    ultimosSieteDias: Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDias(hoy, i - 6);
      return { fecha, huevos: granja.eggs.filter(h => h.date === fecha).reduce((suma, h) => suma + h.eggs, 0) };
    }),
    tareasProximas: granja.maintenance.filter(t => t.status !== 'Completada').sort((a, b) => a.nextDue.localeCompare(b.nextDue)).slice(0, 3),
    stockBajo: granja.stock.filter(s => s.quantity <= s.minimum),
  };
}

/** «Vencida» si la fecha ya pasó y la tarea no está completada, sin importar lo que diga el estado guardado. */
export const tareaVencida = (tarea: Tarea, hoy: string) => tarea.status !== 'Completada' && tarea.nextDue < hoy;

export const pesos = (monto: number) => `$${Math.round(monto).toLocaleString('es-CO')}`;
export const numero = (valor: number) => (Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/\.?0+$/, ''));

const formatoFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
/** «22 oct 2026». Si la fecha no es válida (campo vacío), devuelve «Sin fecha». */
export function fechaLarga(texto?: string): string {
  if (!texto) return 'Sin fecha';
  const fecha = aFecha(texto);
  return Number.isNaN(fecha.getTime()) ? 'Sin fecha' : formatoFecha.format(fecha).replace('.', '');
}

/** «1 gallo», «2 gallos»: el plural correcto para que nunca salga «1 gallos». */
export const conteo = (cantidad: number, singular: string, plural: string) => `${cantidad} ${cantidad === 1 ? singular : plural}`;
