// Tipos de ave de corral que se pueden registrar y vender. El campo `sex` de cada ave conserva sus tres valores de siempre
// (Gallina = hembra adulta, Gallo = macho adulto, Pollito = cría) para todas las especies; lo que cambia es cómo se nombran en pantalla.
// Sin dependencias: lo usan el servidor y el navegador.

export const SPECIES = ['Gallinas', 'Patos', 'Gansos', 'Pavos', 'Codornices', 'Pintadas', 'Palomas', 'Otras'] as const;
export type Species = (typeof SPECIES)[number];
export const DEFAULT_SPECIES: Species = 'Gallinas';

export const SPECIES_LABELS: Record<Species, string> = {
  Gallinas: 'Gallinas y gallos', Patos: 'Patos', Gansos: 'Gansos', Pavos: 'Pavos (piscos)', Codornices: 'Codornices',
  Pintadas: 'Pintadas (gallinas de guinea)', Palomas: 'Palomas', Otras: 'Otras aves de corral',
};

/** Especie de un ave; las fichas anteriores (sin el campo) son gallinas. */
export const speciesOf = (value?: string | null): Species => ((SPECIES as readonly string[]).includes(value ?? '') ? (value as Species) : DEFAULT_SPECIES);

type Sex = 'Gallina' | 'Gallo' | 'Pollito';
const SEX_WORDS: Record<Species, Record<Sex, string>> = {
  Gallinas: { Gallina: 'Gallina', Gallo: 'Gallo', Pollito: 'Pollito' },
  Patos: { Gallina: 'Pata', Gallo: 'Pato', Pollito: 'Patito' },
  Gansos: { Gallina: 'Gansa', Gallo: 'Ganso', Pollito: 'Gansito' },
  Pavos: { Gallina: 'Pava', Gallo: 'Pavo', Pollito: 'Pavito' },
  Codornices: { Gallina: 'Hembra', Gallo: 'Macho', Pollito: 'Cría' },
  Pintadas: { Gallina: 'Hembra', Gallo: 'Macho', Pollito: 'Cría' },
  Palomas: { Gallina: 'Paloma', Gallo: 'Palomo', Pollito: 'Pichón' },
  Otras: { Gallina: 'Hembra', Gallo: 'Macho', Pollito: 'Cría' },
};

/** Cómo se nombra el sexo de un ave de esa especie (la pata, el palomo…). Un valor desconocido se devuelve igual. */
export function sexLabel(sex: string, species?: string | null): string {
  const words = SEX_WORDS[speciesOf(species)];
  return (words as Record<string, string>)[sex] ?? sex;
}

/** Opciones del selector de sexo para una especie: el valor guardado y el nombre que se ve. */
export function sexOptions(species?: string | null): { value: string; label: string }[] {
  return (['Gallina', 'Gallo', 'Pollito'] as const).map(value => ({ value, label: sexLabel(value, species) }));
}

export const speciesOptions = (): { value: string; label: string }[] => SPECIES.map(value => ({ value, label: SPECIES_LABELS[value] }));

export const BREEDS_BY_SPECIES: Record<Species, string[]> = {
  Gallinas: ['Criolla', 'Ponedora', 'Cubana', 'Gigante', 'Brahma', 'Orpington', 'Plymouth Rock', 'Sedosa', 'Rhode Island Red', 'Leghorn', 'Araucana', 'Marans', 'Sussex', 'Wyandotte', 'Cochin', 'Australorp', 'Cruce', 'Otra'],
  Patos: ['Criollo', 'Pekín', 'Muscovy (real)', 'Khaki Campbell', 'Rouen', 'Corredor indio', 'Mulard', 'Cruce', 'Otra'],
  Gansos: ['Criollo', 'Embden (blanco)', 'Toulouse', 'China', 'Africano', 'Cruce', 'Otra'],
  Pavos: ['Criollo', 'Bronceado', 'Blanco de Beltsville', 'Bourbon Red', 'Narragansett', 'Cruce', 'Otra'],
  Codornices: ['Japonesa (Coturnix)', 'Bobwhite', 'Otra'],
  Pintadas: ['Perlada', 'Blanca', 'Lavanda', 'Otra'],
  Palomas: ['Criolla', 'Mensajera', 'Buchona', 'Colipava', 'Otra'],
  Otras: ['Otra'],
};

export const breedOptions = (species?: string | null): string[] => BREEDS_BY_SPECIES[speciesOf(species)];
