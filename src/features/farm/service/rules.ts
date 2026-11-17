export const INCUBATION_DAYS = 21;
export function estimatedHatchDate(startedAt: string, adjustmentDays = 0): string {
 const date = new Date(`${startedAt}T12:00:00`);
 date.setDate(date.getDate() + INCUBATION_DAYS + adjustmentDays);
 return date.toISOString().slice(0, 10);
}
export function elapsedDays(startedAt: string, now = new Date()): number {
 const start = new Date(`${startedAt}T00:00:00`).getTime();
 return Math.max(0, Math.floor((new Date(`${now.toISOString().slice(0,10)}T00:00:00`).getTime() - start) / 86_400_000));
}
export function nextMaintenanceDate(lastDone: string, frequencyDays: number): string {
 const date = new Date(`${lastDone}T12:00:00`);
 date.setDate(date.getDate() + frequencyDays);
 return date.toISOString().slice(0,10);
}
export function validateNumeric(value: unknown, label: string, minimum = 0): string | null {
 const n = Number(value);
 if (!Number.isFinite(n)) return `${label}: escribe un número válido.`;
 if (n < minimum) return `${label}: el valor debe ser ${minimum ? `al menos ${minimum}` : 'cero o mayor'}.`;
 return null;
}
export function eggAllocationValid(total: number, incubation: number, consumption: number, sale: number): boolean {
 return incubation + consumption + sale <= total;
}
export function canConsume(requested: number, available: number): boolean {
 return Number.isFinite(requested) && requested > 0 && requested <= available;
}
export function purchaseTotal(quantity: number, unitPrice: number): number {
 return Math.round(quantity * unitPrice);
}
