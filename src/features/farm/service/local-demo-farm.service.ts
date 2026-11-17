import type { FarmData } from '@/models/farm';
import type { FarmService } from './farm.service';

const empty: FarmData = { coops: [], birds: [], rings: [], birdEvents: [], eggs: [], incubations: [], births: [], breedingGroups: [], purchases: [], stock: [], movements: [], maintenance: [], fertileLots: [], chickLots: [], customers: [], sales: [], lotMovements: [], customProducts: [] };

class LocalDemoFarmService implements FarmService {
  private userId = '';
  private queue: Promise<void> = Promise.resolve();
  setUserId(id: string) { this.userId = id; }
  clear() { return structuredClone(empty); }
  private key() {
    if (!this.userId) throw new Error('Inicia sesión de nuevo para abrir los datos de esta cuenta.');
    return `pico-criollo.local-demo.farm.${this.userId}.v1`;
  }
  async load(): Promise<FarmData> {
    try {
      const stored = localStorage.getItem(this.key());
      return stored ? { ...structuredClone(empty), ...JSON.parse(stored) as Partial<FarmData> } : structuredClone(empty);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Inicia sesión')) throw error;
      throw new Error('No se pudieron leer los datos locales de la granja.');
    }
  }
  async save(data: FarmData): Promise<void> {
    try { localStorage.setItem(this.key(), JSON.stringify(data)); }
    catch { throw new Error('No se pudieron guardar los datos en este navegador.'); }
  }
  async read() { return this.load(); }
  async write(data: FarmData) { return this.save(data); }
  async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) return navigator.locks.request('pico-criollo.local-demo.transaction', operation);
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}

export const localDemoFarmService = new LocalDemoFarmService();
