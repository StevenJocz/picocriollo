import { marketEvents } from '../../market/service/events.ts';
import { profileEvents } from '../../profile/service/events.ts';
import { reminderEvents } from './reminder-events.ts';
import type { EventRegistry } from './events.ts';

// Registro único de tipos de evento. Cada módulo aporta sus definiciones.
export const EVENT_TYPES: EventRegistry = { ...marketEvents, ...profileEvents, ...reminderEvents };
