// Estructura vacía de una granja nueva (misma forma que FarmData en src/models/farm.ts).
export const FARM_ARRAYS = ['coops', 'birds', 'rings', 'birdEvents', 'eggs', 'incubations', 'births', 'breedingGroups', 'purchases', 'stock', 'movements', 'maintenance', 'fertileLots', 'chickLots', 'customers', 'sales', 'lotMovements', 'customProducts'] as const;

export function emptyFarmData(): Record<string, unknown[]> {
  return Object.fromEntries(FARM_ARRAYS.map(key => [key, []]));
}
