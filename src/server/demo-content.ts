import { demoData, normalizeFarmData } from '../features/farm/service/farm.service.ts';
import { FARM_ARRAYS } from './farm-template.ts';

type JsonRecord = Record<string, unknown>;
type DemoMarker = { kind: 'onboarding-sample'; version: 1; seededAt: string; idsByCollection: Record<string, string[]> };

/** Creates clearly marked, editable farm examples for the first 19 real accounts. */
export function createOnboardingSample(userId: string, seededAt: string): JsonRecord {
  const data = normalizeFarmData(structuredClone(demoData)) as unknown as JsonRecord;
  const birds = data.birds as JsonRecord[];
  for (const bird of birds) {
    bird.photo = bird.sex === 'Gallo' ? '/fotos/ave-gallo.jpg' : bird.sex === 'Pollito' ? '/fotos/ave-pollito.jpg' : '/fotos/ave-gallina.jpg';
    bird.notes = `${typeof bird.notes === 'string' && bird.notes ? `${bird.notes} ` : ''}Registro ficticio de demostración.`;
  }
  for (const sale of data.sales as JsonRecord[]) sale.notes = 'Venta ficticia de demostración.';
  const idMap = new Map<string, string>();

  for (const collection of FARM_ARRAYS) {
    const rows = data[collection] as JsonRecord[];
    for (const row of rows) {
      if (typeof row.id === 'string') idMap.set(row.id, `sample-${userId}-${row.id}`);
    }
  }

  const remap = (value: unknown): unknown => {
    if (typeof value === 'string') return idMap.get(value) ?? value;
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)]));
    return value;
  };

  for (const collection of FARM_ARRAYS) data[collection] = remap(data[collection]) as unknown[];
  const idsByCollection = Object.fromEntries(FARM_ARRAYS.map(collection => [
    collection,
    (data[collection] as JsonRecord[]).map(row => String(row.id)),
  ]));
  data.demoContent = { kind: 'onboarding-sample', version: 1, seededAt, idsByCollection } satisfies DemoMarker;
  return data;
}

/** Removes onboarding rows and clears references from records created by the account. */
export function removeOnboardingSample(input: JsonRecord): JsonRecord {
  const data = structuredClone(input);
  const marker = data.demoContent as DemoMarker | undefined;
  if (marker?.kind !== 'onboarding-sample' || marker.version !== 1) return data;

  const seededIds = new Set(Object.values(marker.idsByCollection).flat());
  const stripReferences = (value: unknown): unknown => {
    if (typeof value === 'string') return seededIds.has(value) ? '' : value;
    if (Array.isArray(value)) return value.filter(item => !(typeof item === 'string' && seededIds.has(item))).map(stripReferences);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stripReferences(child)]));
    return value;
  };

  for (const collection of FARM_ARRAYS) {
    const rows = Array.isArray(data[collection]) ? data[collection] as JsonRecord[] : [];
    const realRows = rows.filter(row => typeof row.id !== 'string' || !seededIds.has(row.id));
    data[collection] = realRows.map(row => stripReferences(row) as JsonRecord);
  }
  delete data.demoContent;
  return data;
}
