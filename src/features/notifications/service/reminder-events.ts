import type { Category, Priority } from '../../../server/storage/types.ts';
import type { EventDef, EventRegistry } from './events.ts';

type P = Record<string, unknown>;
const s = (value: unknown) => String(value ?? '');
const date = (iso: unknown) => new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${s(iso)}T12:00:00Z`));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const HEALTH_NOTE = ' Este aviso se basa en lo que registraste y no sustituye la evaluación de un veterinario.';

function selfEvent(category: Category, priority: Priority, view: string, make: (p: P) => { title: string; body: string }, critical = false): EventDef {
  return {
    category, priority, critical,
    recipients: async (_tx, event) => [s(event.payload.userId)],
    render: async (_tx, event) => ({ ...make(event.payload), link: { view, id: event.aggregateId } }),
  };
}

// Recordatorios y eventos de la propia granja: el destinatario es siempre el dueño de los datos.
export const reminderEvents: EventRegistry = {
  // Tres estados distintos: eclosión próxima, fecha estimada y nacimiento confirmado (solo con registro de nacimiento).
  'incubation.hatch_approaching': selfEvent('incubacion', 'normal', 'incubaciones', p => ({ title: 'Eclosión próxima', body: `${s(p.label)}: la fecha estimada de eclosión es el ${date(p.estimated)} (en ${s(p.left)} ${plural(Number(p.left), 'día', 'días')}). Es una estimación; los tiempos reales pueden variar.` })),
  'incubation.hatch_today': selfEvent('incubacion', 'alta', 'incubaciones', p => ({ title: 'Hoy es la fecha estimada de eclosión', body: `${s(p.label)}. Que llegue la fecha no confirma nacimientos: registra el nacimiento cuando lo veas.` })),
  'incubation.overdue': selfEvent('incubacion', 'alta', 'incubaciones', p => ({ title: 'La incubación lleva más tiempo del esperado', body: `${s(p.label)} superó en ${s(p.late)} ${plural(Number(p.late), 'día', 'días')} la fecha estimada (${date(p.estimated)}). Revisa los huevos y actualiza el estado de la incubación.` })),
  'incubation.stale': selfEvent('incubacion', 'normal', 'incubaciones', p => ({ title: 'Incubación sin actualizar', body: `${s(p.label)} lleva ${s(p.days)} días sin cambios en tus registros. Si sigue en curso, confirma su estado.` })),
  'birth.recorded': selfEvent('incubacion', 'normal', 'nacimientos', p => ({ title: 'Nacimiento confirmado', body: `Registraste ${s(p.count)} ${plural(Number(p.count), 'pollito', 'pollitos')}${p.mother ? ` de ${s(p.mother)}` : ''}.` })),
  'incubation.unhatched': selfEvent('incubacion', 'normal', 'incubaciones', p => ({ title: 'Huevos que no eclosionaron', body: `${s(p.label)} cerró con ${s(p.hatched)} ${plural(Number(p.hatched), 'pollito nacido', 'pollitos nacidos')} de ${s(p.eggs)} huevos; ${s(p.unhatched)} no eclosionaron o se retiraron.` })),
  'incubation.interrupted': selfEvent('incubacion', 'alta', 'incubaciones', p => ({ title: 'Incubación interrumpida', body: `${s(p.label)} quedó registrada como interrumpida. Revisa si hace falta anotar la causa en las observaciones.` })),
  'breeding.review_due': selfEvent('incubacion', 'normal', 'reproduccion', p => ({ title: 'Revisión del grupo reproductor', body: `El grupo «${s(p.name)}» llega a su fecha de cierre el ${date(p.date)}. Decide si continúa o se finaliza.` })),
  'maintenance.due_soon': selfEvent('mantenimiento', 'normal', 'mantenimiento', p => ({ title: 'Tarea próxima', body: `«${s(p.title)}» vence el ${date(p.due)}.` })),
  'maintenance.overdue': selfEvent('mantenimiento', 'alta', 'mantenimiento', p => ({ title: 'Tarea vencida', body: `«${s(p.title)}» venció el ${date(p.due)} (${s(p.late)} ${plural(Number(p.late), 'día', 'días')}).` })),
  // Cuidados de salud registrados en el plan (vacunas, tratamientos, controles): no sustituyen al veterinario.
  'health.due_soon': selfEvent('salud', 'normal', 'mantenimiento', p => ({ title: 'Cuidado de salud próximo', body: `«${s(p.title)}» vence el ${date(p.due)}.${HEALTH_NOTE}` })),
  'health.overdue': selfEvent('salud', 'alta', 'mantenimiento', p => ({ title: 'Cuidado de salud vencido', body: `«${s(p.title)}» venció el ${date(p.due)} (${s(p.late)} ${plural(Number(p.late), 'día', 'días')}).${HEALTH_NOTE}` })),
  'stock.low': selfEvent('inventario', 'alta', 'inventario', p => ({ title: `Existencia baja: ${s(p.product)}`, body: `Quedan ${s(p.quantity)} ${s(p.unit)} (mínimo ${s(p.minimum)}). Registra una compra para reponer.` })),
  'stock.variation': selfEvent('inventario', 'normal', 'inventario', p => ({ title: `Variación importante: ${s(p.product)}`, body: `La existencia pasó de ${s(p.from)} a ${s(p.to)} ${s(p.unit)}. Revisa que el movimiento sea correcto.` })),
  'bird.deceased': selfEvent('inventario', 'alta', 'aves', p => ({ title: 'Mortalidad registrada', body: `Se registró la baja de ${s(p.name)}${p.code ? ` (${s(p.code)})` : ''}. Si hay varias bajas seguidas, consulta a un veterinario.` })),
  'operation.needs_attention': selfEvent('transferencia', 'alta', 'compras-mercado', p => ({ title: 'Una operación espera tu respuesta', body: `Una operación del mercado lleva ${s(p.days)}+ ${plural(Number(p.days), 'día', 'días')} esperando tu acción (${s(p.status).replace(/_/g, ' ')}). Revisa «Mis publicaciones» o «Mis compras».` })),
  'system.sync_conflict': selfEvent('sistema', 'normal', 'inicio', () => ({ title: 'Se evitó sobrescribir tus datos', body: 'Tus cambios no se guardaron porque la granja se modificó en otra sesión. Recarga la página y repite el cambio.' })),
};
