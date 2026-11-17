// Datos de la comunidad de ejemplo: 24 criaderos con aspecto real para revisar el diseño con la app llena.
// Todo es inventado (nombres, lugares y textos). Las cuentas no pueden iniciar sesión y se pueden borrar con `removeSeedCommunity`.

export const SEED_EMAIL_DOMAIN = 'semilla.pico-criollo.invalid';

export interface SeedProfile {
  slug: string;
  name: string;
  city: string;
  region: string;
  /** Razas del criadero (la primera es la principal). */
  breeds: string[];
  coops: { name: string; type: string; location: string }[];
  /** `raza`: recorte de una foto de la raza; `photo`: recorte de las fotos del diseño; `logo`: monograma. */
  avatar: { kind: 'raza'; photo: string } | { kind: 'photo'; variant: number } | { kind: 'logo'; initials: string; color: string };
  years: number;
}

const COOPS = (...items: [string, string, string][]) => items.map(([name, type, location]) => ({ name, type, location }));

export const PROFILES: SeedProfile[] = [
  { slug: 'guayacanes', name: 'Finca Los Guayacanes', city: 'Rionegro', region: 'Antioquia', breeds: ['Criolla', 'Ponedora', 'Wyandotte'], coops: COOPS(['La Arboleda', 'Pastoril', 'Ladera norte'], ['Nido tibio', 'Cría', 'Zona protegida']), avatar: { kind: 'raza', photo: 'raza-wyandotte-1' }, years: 9 },
  { slug: 'alba', name: 'Criadero El Alba', city: 'Duitama', region: 'Boyacá', breeds: ['Brahma', 'Criolla', 'Orpington'], coops: COOPS(['El Nogal', 'Mixto', 'Patio central'], ['Casa de cría', 'Cría', 'Costado sur']), avatar: { kind: 'logo', initials: 'EA', color: '#3f7d4e' }, years: 6 },
  { slug: 'rosa', name: 'Gallinas de Doña Rosa', city: 'Fusagasugá', region: 'Cundinamarca', breeds: ['Criolla', 'Rhode Island Red'], coops: COOPS(['El Patio', 'Pastoril', 'Detrás de la casa']), avatar: { kind: 'photo', variant: 2 }, years: 14 },
  { slug: 'sanisidro', name: 'Hacienda San Isidro Aves', city: 'Palmira', region: 'Valle del Cauca', breeds: ['Gigante', 'Cubana', 'Australorp'], coops: COOPS(['Galpón 1', 'Intensivo', 'Lote bajo'], ['Galpón 2', 'Mixto', 'Lote alto'], ['Nido tibio', 'Cría', 'Cerca de la casa']), avatar: { kind: 'raza', photo: 'raza-negra-1' }, years: 12 },
  { slug: 'aurora', name: 'Criadero La Aurora', city: 'Chinchiná', region: 'Caldas', breeds: ['Cubana', 'Criolla', 'Leghorn'], coops: COOPS(['Los Cafetales', 'Pastoril', 'Entre los cafetales'], ['Pollera', 'Cría', 'Junto al beneficiadero']), avatar: { kind: 'raza', photo: 'raza-leghorn-1' }, years: 5 },
  { slug: 'villanora', name: 'Finca Villa Nora', city: 'Ibagué', region: 'Tolima', breeds: ['Ponedora', 'Rhode Island Red', 'Sussex'], coops: COOPS(['Gallinero grande', 'Mixto', 'Patio']), avatar: { kind: 'logo', initials: 'VN', color: '#b0562f' }, years: 4 },
  { slug: 'paramo', name: 'Aves del Páramo', city: 'Pasto', region: 'Nariño', breeds: ['Brahma', 'Orpington', 'Cochin'], coops: COOPS(['Refugio', 'Cubierto', 'Ladera fría'], ['Pollera alta', 'Cría', 'Parte alta']), avatar: { kind: 'raza', photo: 'raza-brahma-gallina' }, years: 7 },
  { slug: 'evelio', name: 'Criadero Don Evelio', city: 'Barbosa', region: 'Santander', breeds: ['Criolla', 'Marans', 'Plymouth Rock'], coops: COOPS(['El Corral', 'Pastoril', 'Al lado del trapiche'], ['Gallos', 'Individual', 'Cerca del establo']), avatar: { kind: 'raza', photo: 'raza-marans-gallo' }, years: 21 },
  { slug: 'ceiba', name: 'La Ceiba Avícola', city: 'Montería', region: 'Córdoba', breeds: ['Criolla', 'Ponedora', 'Araucana'], coops: COOPS(['Sombra de ceiba', 'Pastoril', 'Bajo la ceiba'], ['Levante', 'Cría', 'Corral techado']), avatar: { kind: 'logo', initials: 'LC', color: '#2f6f73' }, years: 8 },
  { slug: 'paraiso', name: 'Granja El Paraíso', city: 'Villavicencio', region: 'Meta', breeds: ['Ponedora', 'Gigante', 'Leghorn'], coops: COOPS(['Galpón principal', 'Intensivo', 'Lote 1'], ['Recría', 'Cría', 'Lote 2']), avatar: { kind: 'photo', variant: 6 }, years: 10 },
  { slug: 'robles', name: 'Criadero Los Tres Robles', city: 'Santa Rosa de Osos', region: 'Antioquia', breeds: ['Brahma', 'Plymouth Rock', 'Wyandotte'], coops: COOPS(['Roble mayor', 'Mixto', 'Alto de la finca'], ['Casa de pollitos', 'Cría', 'Junto a la cocina']), avatar: { kind: 'raza', photo: 'raza-plymouth-1' }, years: 11 },
  { slug: 'esperanza', name: 'Finca La Esperanza', city: 'Neiva', region: 'Huila', breeds: ['Cubana', 'Criolla', 'Sedosa'], coops: COOPS(['Patio de atrás', 'Pastoril', 'Patio trasero']), avatar: { kind: 'photo', variant: 7 }, years: 3 },
  { slug: 'pradera', name: 'Gallinero La Pradera', city: 'Pereira', region: 'Risaralda', breeds: ['Criolla', 'Ponedora', 'Brahma'], coops: COOPS(['La Pradera', 'Pastoril', 'Potrero'], ['Nido tibio', 'Cría', 'Zona protegida']), avatar: { kind: 'photo', variant: 8 }, years: 6 },
  { slug: 'milplumas', name: 'Criadero Mil Plumas', city: 'Envigado', region: 'Antioquia', breeds: ['Gigante', 'Brahma', 'Cochin'], coops: COOPS(['Terraza', 'Cubierto', 'Terraza trasera'], ['Pollera', 'Cría', 'Cuarto de cría']), avatar: { kind: 'logo', initials: 'MP', color: '#7b4a8a' }, years: 5 },
  { slug: 'mirador', name: 'Finca El Mirador', city: 'Pamplona', region: 'Norte de Santander', breeds: ['Criolla', 'Australorp', 'Sussex'], coops: COOPS(['El Mirador', 'Pastoril', 'Ladera']), avatar: { kind: 'raza', photo: 'raza-sussex' }, years: 13 },
  { slug: 'marta', name: 'Aves Doña Marta', city: 'Popayán', region: 'Cauca', breeds: ['Criolla', 'Cubana', 'Araucana'], coops: COOPS(['Huerta', 'Pastoril', 'Entre la huerta'], ['Pollera', 'Cría', 'Costado de la casa']), avatar: { kind: 'raza', photo: 'raza-araucana-2' }, years: 16 },
  { slug: 'camino', name: 'Criadero Camino Real', city: 'Villa de Leyva', region: 'Boyacá', breeds: ['Brahma', 'Orpington', 'Sedosa'], coops: COOPS(['Casona', 'Cubierto', 'Patio de la casona'], ['Pollera', 'Cría', 'Cuarto aparte']), avatar: { kind: 'raza', photo: 'raza-orpington-gallo' }, years: 8 },
  { slug: 'margaritas', name: 'Finca Las Margaritas', city: 'Armenia', region: 'Quindío', breeds: ['Ponedora', 'Criolla', 'Marans'], coops: COOPS(['Las Margaritas', 'Pastoril', 'Jardín trasero']), avatar: { kind: 'logo', initials: 'LM', color: '#8a7a2c' }, years: 2 },
  { slug: 'cantaclaro', name: 'Criadero Cantaclaro', city: 'Buga', region: 'Valle del Cauca', breeds: ['Cubana', 'Wyandotte', 'Plymouth Rock'], coops: COOPS(['Gallos', 'Individual', 'Corredor de los gallos'], ['Gallinero', 'Mixto', 'Patio']), avatar: { kind: 'logo', initials: 'CC', color: '#a8402f' }, years: 9 },
  { slug: 'nogales', name: 'Granja Los Nogales', city: 'Silvania', region: 'Cundinamarca', breeds: ['Criolla', 'Brahma', 'Ponedora'], coops: COOPS(['Nogal viejo', 'Pastoril', 'Bajo los nogales'], ['Pollera', 'Cría', 'Cerca de la huerta']), avatar: { kind: 'photo', variant: 12 }, years: 7 },
  { slug: 'sol', name: 'Aves del Sol', city: 'Girardot', region: 'Cundinamarca', breeds: ['Rhode Island Red', 'Ponedora', 'Leghorn'], coops: COOPS(['Galpón del sol', 'Mixto', 'Patio grande'], ['Pollera', 'Cría', 'Costado norte']), avatar: { kind: 'raza', photo: 'raza-rhode-gallo' }, years: 6 },
  { slug: 'villaesperanza', name: 'Granja Villa Esperanza', city: 'La Ceja', region: 'Antioquia', breeds: ['Marans', 'Araucana', 'Orpington'], coops: COOPS(['Cafetal', 'Pastoril', 'Entre el cafetal'], ['Nido tibio', 'Cría', 'Cerca de la casa']), avatar: { kind: 'raza', photo: 'raza-araucana-1' }, years: 4 },
  { slug: 'palmas', name: 'Criadero Las Palmas', city: 'Bucaramanga', region: 'Santander', breeds: ['Sedosa', 'Cochin', 'Brahma'], coops: COOPS(['Las Palmas', 'Cubierto', 'Terraza'], ['Pollera', 'Cría', 'Cuarto de cría']), avatar: { kind: 'raza', photo: 'raza-sedosa-1' }, years: 5 },
  { slug: 'sanjorge', name: 'Finca San Jorge', city: 'Tunja', region: 'Boyacá', breeds: ['Sussex', 'Leghorn', 'Criolla'], coops: COOPS(['San Jorge', 'Pastoril', 'Potrero'], ['Pollera', 'Cría', 'Junto al establo']), avatar: { kind: 'raza', photo: 'raza-cochin-1' }, years: 10 },
];

export const seedEmail = (slug: string) => `${slug}@${SEED_EMAIL_DOMAIN}`;

/** Enlaces de ejemplo a las redes del criadero (usuarios inventados: es posible que las páginas no existan). Todos tienen Instagram; algunos, TikTok y canal de YouTube. */
export function seedSocialLinks(slug: string, index: number): { tiktok?: string; instagram: string; youtube?: string } {
  return {
    instagram: `https://www.instagram.com/picocriollo.${slug}/`,
    ...(index % 5 !== 3 ? { tiktok: `https://www.tiktok.com/@picocriollo.${slug}` } : {}),
    ...(index % 5 < 2 ? { youtube: `https://www.youtube.com/@picocriollo-${slug}` } : {}),
  };
}

// ── Generador determinista (misma semilla → mismos datos) ─────────────────────────────────────────────────────────────
export function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = <T,>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)];
export const between = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
export function shuffled<T>(random: () => number, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

export const HEN_NAMES = ['Canela', 'Mariposa', 'Pepita', 'Reina', 'Chispa', 'Luna', 'Mora', 'Nube', 'Sol', 'Rosita', 'Paloma', 'Azucena', 'Margarita', 'Perla', 'Lola', 'Estrella', 'Panela', 'Cleopatra', 'Fiona', 'Dulce', 'Violeta', 'Tulipán', 'Gardenia', 'Maracuyá', 'Coqueta', 'Chiquita', 'Mandarina', 'Brisa', 'Aurora', 'Jazmín', 'Esmeralda', 'Capuchina', 'Alondra', 'Bonita', 'Moñitos', 'Princesa'];
export const ROOSTER_NAMES = ['Capitán', 'Rey', 'Tigre', 'Bruno', 'Tizón', 'Zeus', 'Pelayo', 'Comandante', 'Gavilán', 'Centella', 'Pancho', 'Mayor', 'Sultán', 'Don Crispín', 'Trueno', 'Faraón', 'General', 'Torero', 'Cacique', 'Lucero'];
export const CHICK_NAMES = ['Piquito', 'Miel', 'Pelusa', 'Maní', 'Chispita', 'Bolita', 'Motas', 'Gotica'];
export const STATUS_HEN = ['Activo', 'Activo', 'Activo', 'En reproducción', 'Clueca'] as const;

// ── Fotos por raza (archivos de public/seed; el sembrador usa `<nombre>.jpg` o `<nombre>-s.jpg` según el tamaño) ───────
export interface BreedPhotos { hen: string[]; rooster: string[]; chick: string[]; }
const CHICKS = ['bird-09', 'bird-10'];
export const BREED_PHOTOS: Record<string, BreedPhotos> = {
  Criolla: { hen: ['bird-01', 'bird-03', 'bird-05', 'bird-02'], rooster: ['bird-07', 'bird-08'], chick: CHICKS },
  Ponedora: { hen: ['raza-rhode-1', 'raza-rhode-2'], rooster: ['raza-rhode-gallo'], chick: CHICKS },
  Cubana: { hen: ['bird-04', 'bird-06'], rooster: ['bird-08', 'bird-07'], chick: CHICKS },
  Gigante: { hen: ['raza-negra-1'], rooster: ['raza-negra-2'], chick: CHICKS },
  Brahma: { hen: ['raza-brahma-gallina', 'raza-brahma-gallo'], rooster: ['raza-brahma-gallo'], chick: CHICKS },
  Orpington: { hen: ['raza-orpington-1', 'raza-orpington-2'], rooster: ['raza-orpington-gallo'], chick: CHICKS },
  'Plymouth Rock': { hen: ['raza-plymouth-1', 'raza-plymouth-2'], rooster: ['raza-plymouth-1'], chick: CHICKS },
  Sedosa: { hen: ['raza-sedosa-1', 'raza-sedosa-2'], rooster: ['raza-sedosa-1'], chick: ['raza-sedosa-pollitos'] },
  'Rhode Island Red': { hen: ['raza-rhode-1', 'raza-rhode-2'], rooster: ['raza-rhode-gallo'], chick: CHICKS },
  Leghorn: { hen: ['raza-leghorn-1'], rooster: ['raza-leghorn-gallo'], chick: CHICKS },
  Araucana: { hen: ['raza-araucana-1', 'raza-araucana-2'], rooster: ['raza-araucana-1'], chick: CHICKS },
  Marans: { hen: ['raza-marans-gallo'], rooster: ['raza-marans-gallo'], chick: CHICKS },
  Sussex: { hen: ['raza-sussex'], rooster: ['raza-sussex'], chick: CHICKS },
  Wyandotte: { hen: ['raza-wyandotte-1', 'raza-wyandotte-2'], rooster: ['raza-wyandotte-2'], chick: CHICKS },
  Cochin: { hen: ['raza-cochin-1'], rooster: ['raza-cochin-gallo'], chick: CHICKS },
  Australorp: { hen: ['raza-negra-1'], rooster: ['raza-negra-2'], chick: CHICKS },
};
export const EGG_PHOTOS = ['huevos-fertiles-1', 'huevos-fertiles-2'];

// ── Insumos que se pueden vender para las aves ────────────────────────────────────────────────────────────────────────
export interface SupplyDef { name: string; category: 'Alimento' | 'Equipos' | 'Incubación'; unit: string; min: number; max: number; stock: [number, number]; photos: string[]; note: string; }
export const SUPPLIES: SupplyDef[] = [
  { name: 'Maíz triturado', category: 'Alimento', unit: 'kg', min: 2200, max: 2800, stock: [120, 400], photos: ['insumo-maiz-1'], note: 'Maíz limpio y seco, triturado en la finca. Sin moho ni humedad.' },
  { name: 'Maíz amarillo en grano', category: 'Alimento', unit: 'kg', min: 2000, max: 2600, stock: [150, 500], photos: ['insumo-maiz-2'], note: 'Grano entero de la última cosecha, bien seleccionado.' },
  { name: 'Concentrado para ponedoras', category: 'Alimento', unit: 'kg', min: 2800, max: 3400, stock: [100, 300], photos: ['insumo-cuido-1'], note: 'Cuido con calcio y proteína para buena postura. Bulto de 40 kg.' },
  { name: 'Concentrado de iniciación para pollitos', category: 'Alimento', unit: 'kg', min: 3300, max: 4000, stock: [60, 200], photos: ['insumo-cuido-2'], note: 'Cuido molido fino para las primeras semanas, con alta proteína.' },
  { name: 'Mezcla de granos para gallinas', category: 'Alimento', unit: 'kg', min: 2400, max: 3100, stock: [80, 250], photos: ['insumo-cuido-2'], note: 'Maíz, sorgo y trigo partido para complementar el concentrado.' },
  { name: 'Cuido de levante', category: 'Alimento', unit: 'kg', min: 2900, max: 3500, stock: [80, 240], photos: ['insumo-cuido-1'], note: 'Para aves entre las 6 y las 18 semanas de edad.' },
  { name: 'Bebedero automático', category: 'Equipos', unit: 'unidad', min: 18000, max: 38000, stock: [6, 20], photos: ['insumo-equipos-2'], note: 'Bebedero de campana con base roja, fácil de limpiar. Para pollitos y adultas.' },
  { name: 'Comedero tipo tolva', category: 'Equipos', unit: 'unidad', min: 26000, max: 62000, stock: [5, 16], photos: ['insumo-equipos-1'], note: 'Comedero tolva con capacidad de 8 kg que evita el desperdicio.' },
  { name: 'Nidal ponedero de 4 puestos', category: 'Equipos', unit: 'unidad', min: 90000, max: 180000, stock: [2, 8], photos: ['insumo-equipos-1'], note: 'Madera tratada, techo inclinado y puestos amplios.' },
  { name: 'Incubadora de 48 huevos', category: 'Incubación', unit: 'unidad', min: 380000, max: 690000, stock: [1, 4], photos: ['insumo-incubadora'], note: 'Con control digital de temperatura y volteo automático.' },
  { name: 'Ovoscopio para huevos', category: 'Incubación', unit: 'unidad', min: 28000, max: 60000, stock: [3, 10], photos: ['insumo-incubadora'], note: 'Linterna LED para revisar la fertilidad desde el día 7.' },
];

// ── Textos de las publicaciones del muro ───────────────────────────────────────────────────────────────────────────────
export type PostKind = 'hen' | 'rooster' | 'chick' | 'eggs' | 'supply' | 'text';
export interface PostPlan { kind: PostKind; text: string; breed: string; supply?: SupplyDef; daysAgo: number; }

const TEMPLATES: Record<PostKind, string[]> = {
  hen: [
    'Esta es {hen}, una {breed} de {years} generaciones en la finca. Mansa y buena ponedora. #{tag} #Gallinas',
    'Así luce {hen}, mi {breed} consentida del gallinero {coop}. Tiene un carácter... pero pone todos los días. #{tag} #Gallinas',
    'Mañana de sol en {city} y {hen} (raza {breed}) tomando su baño de arena. Así da gusto criar. #{tag} #Criadero',
    'Plumaje perfecto en {hen}. La {breed} da gusto cuando se le cuida la alimentación y el espacio. #{tag} #Gallinas',
    'Les presento a {hen}, de nuestra línea {breed}. Hoy cumplió su primer año y ya va por la segunda postura. #{tag} #Ponedora',
    '{hen} posando para la foto. Las {breed} son tranquilas, buenas madres y se adaptan bien al clima de {region}. #{tag} #Avicultura',
  ],
  rooster: [
    'Mi gallo {rooster}, {breed}, cuidando el corral como todas las mañanas. Siempre atento y bien plantado. #{tag} #Gallos',
    '{rooster} estrenando cresta y plumaje de la temporada. Un {breed} de buen porte, hijo de mis mejores reproductores. #{tag} #Gallos',
    'Así canta {rooster} desde las cinco de la mañana, un {breed} que no deja dormir a nadie en {city}. #{tag} #Gallos #Criadero',
    'Reproductor {breed} de la línea de la finca: {rooster}. Tranquilo con las gallinas y de muy buena fertilidad. #{tag} #Reproductores',
  ],
  chick: [
    'Salieron {n} pollitos {breed} de la última incubación. Todos activos y comiendo bien. #Pollitos #{tag}',
    'Camada nueva en el gallinero {coop}: {n} pollitos {breed} con calor y agua con panela. #Pollitos #Criadero',
    'Primera semana de los pollitos {breed}. Piar, comer y dormir juntitos bajo la criadora. #Pollitos #{tag}',
    '{n} pollitos de {breed} ya con plumas y listos para pasar a la pollera grande. Gracias a {hen}, la mejor mamá. #Pollitos #{tag}',
  ],
  eggs: [
    'Hoy recogimos {n} huevos fértiles de {breed}. Los guardamos frescos para incubar y para quienes los pidieron. #HuevosFértiles #{tag}',
    'Huevos fértiles de {breed} disponibles esta semana, de gallinas con gallo en reproducción. Pregunten por el mercado. #HuevosFértiles #Avicultura',
    'Mirando a contraluz los huevos de la incubadora: {n} con embrión al día 7. Buenísimo resultado esta vez. #Incubación #HuevosFértiles',
    'Nido lleno: {n} huevos de {breed} en un solo día. Así es la postura en {city} con este clima. #Huevos #{tag}',
  ],
  supply: [
    'Llegó {supplyL} nuevo a la finca. Para quienes preguntaron, queda disponible en el mercado. #Insumos #Avicultura',
    'Tenemos {supplyL} disponible a buen precio, directo de la finca en {city}. Escríbannos por el mercado. #Insumos #Criadero',
    'Consejo: con {supplyL} bien dosificado las aves rinden más y gastan menos. Lo uso hace {years} años. #Insumos #Avicultura',
    'Reorganizando el depósito de la finca: quedó {supplyL} listo para despachar. #Insumos #Gallinero',
  ],
  text: [
    'Amaneció fresco en {city} y las aves salieron temprano al patio. Así empieza el día en {name}. #Gallinas #Criadero',
    'Llevo {years} años criando aves en {region} y cada lote enseña algo nuevo. Gracias a todos los que nos siguen por aquí. #Criadero #Comunidad',
    'Consejo de la semana: el agua limpia y fresca es lo más importante del gallinero. Cámbienla todos los días, sobre todo con calor. #Avicultura #Gallinas',
    'Si sus gallinas dejan de poner de un día para otro, revisen estrés, muda de plumas y cantidad de luz. Casi siempre es una de las tres. #Ponedora #Huevos',
    'La viruta seca y limpia en los nidos evita huevos sucios y problemas de patas. Renovamos cada dos semanas en el gallinero {coop}. #Gallinero #Avicultura',
    'No mezclen aves recién compradas con el lote de una vez: unos días en cuarentena y se evitan sustos. #Bioseguridad #Gallinas',
    'El calcio no puede faltar: cáscara de huevo molida o conchuela, aparte del concentrado. Se nota en la cáscara. #Ponedora #Huevos',
    'Los gallos no se llevan bien en el mismo corral. Uno por grupo y listo, así hay paz. #Gallos #Criadero',
    'Revisen cada tanto patas y plumas con una linterna: los ácaros se esconden de noche. Un baño de arena ayuda mucho. #Gallinas #Avicultura',
    'Pregunta para la comunidad: ¿qué concentrado le dan a las aves en {region}? Estoy comparando precios y resultados. #Avicultura #Comunidad',
    'Por fin llegó la lluvia y los patios se pusieron verdes. Las gallinas felices escarbando. #Gallinas #{tag}',
    'Visita de fin de semana en el criadero: vinieron a conocer las aves y se fueron muy contentos. Aquí siempre son bienvenidos. #Criadero #{cityTag}',
    'Hoy limpiamos el gallinero {coop}: viruta nueva, bebederos lavados y todo en orden. #Gallinero #Avicultura',
    'Gracias a quienes nos compraron esta semana por Pico Criollo. Cada venta con su registro y su factura, así da confianza. #Mercado #Comunidad',
  ],
};

export interface PostContext { profile: SeedProfile; hens: Record<string, string[]>; roosters: Record<string, string[]>; }

/** Plan de las publicaciones del muro de un criadero: textos y foto de la raza que se menciona. */
export function buildPostPlans(profile: SeedProfile, context: PostContext, random: () => number, count: number, supplies: SupplyDef[]): PostPlan[] {
  const kinds: PostKind[] = ['hen', 'hen', 'rooster', 'rooster', 'chick', 'chick', 'eggs', 'eggs', 'supply', 'supply', 'text', 'text', 'text', 'hen', 'chick', 'supply'];
  const order = shuffled(random, kinds).slice(0, count);
  const used = new Map<string, number>();
  const tagOf = (breed: string) => breed.replace(/\s/g, '');
  return order.map((kind, index) => {
    const breed = pick(random, profile.breeds);
    const hen = pick(random, context.hens[breed] ?? Object.values(context.hens).flat());
    const rooster = pick(random, context.roosters[breed] ?? Object.values(context.roosters).flat());
    const supply = kind === 'supply' ? pick(random, supplies) : undefined;
    const templates = TEMPLATES[kind];
    // No se repite la misma plantilla dentro de un mismo muro mientras haya otras.
    const turn = used.get(kind) ?? 0; used.set(kind, turn + 1);
    const template = templates[(Math.floor(random() * templates.length) + turn) % templates.length];
    const text = template
      .replaceAll('{breed}', breed).replaceAll('{tag}', tagOf(breed)).replaceAll('{hen}', hen).replaceAll('{rooster}', rooster)
      .replaceAll('{city}', profile.city).replaceAll('{cityTag}', tagOf(profile.city)).replaceAll('{region}', profile.region).replaceAll('{coop}', profile.coops[0].name)
      .replaceAll('{n}', String(between(random, 6, 38))).replaceAll('{years}', String(Math.max(2, Math.min(profile.years, between(random, 2, 9)))))
      .replaceAll('{name}', profile.name).replaceAll('{supplyL}', supply ? supply.name.toLocaleLowerCase('es-CO') : 'cuido');
    return { kind, text, breed, ...(supply ? { supply } : {}), daysAgo: Math.round(1 + index * (26 / count) + random() * 2) };
  });
}

export const COMMENT_POOL = [
  '¡Qué belleza de ejemplares! Felicitaciones.',
  'Se ven muy sanas, buen trabajo.',
  'Hermosa, ¿de qué línea es?',
  'Gracias por compartir, me sirvió mucho el consejo.',
  'Qué buen plumaje, así da gusto.',
  'Excelente, se nota el cuidado que le ponen.',
  'Muy bonito el gallinero, ordenado y limpio.',
  '¿Todavía tienen disponibles? Me interesa.',
  'Bendiciones para el criadero, sigan así.',
  'Qué orgullo de aves, felicitaciones.',
  'Me encantó, voy a pasar por ahí pronto.',
  'Buenísimo, justo lo que estaba buscando.',
  '¿Cuánto cuesta el despacho a Medellín?',
  'Ese precio está muy bueno para la calidad.',
  'Yo compré con ustedes el año pasado y quedé feliz.',
];
export const REPLY_POOL = ['¡Gracias, qué amable!', 'Con gusto, por aquí los esperamos.', 'Gracias por pasar por aquí.', 'Claro que sí, escríbanos por el mercado.', 'Con mucho gusto, quedamos atentos.'];

export const LISTING_NOTES = {
  Gallina: [
    'Gallina sana, criada en pastoreo y de buen carácter.',
    'Se entrega con registro de la granja y su historial. Vacunación al día.',
    'Buena postura y muy mansa; criada en corral amplio con luz natural.',
    'De línea propia, hija de padres conocidos. Ideal para reproducción.',
    'Ave activa y vigorosa, alimentada con concentrado y maíz.',
  ],
  Gallo: [
    'Gallo sano, criado en pastoreo y de buen porte.',
    'Se entrega con registro de la granja y su historial. Vacunación al día.',
    'Buen plumaje y carácter tranquilo; criado en corral amplio con luz natural.',
    'De línea propia, hijo de padres conocidos. Ideal como reproductor.',
    'Ave activa y vigorosa, alimentada con concentrado y maíz.',
  ],
} as const;
export const HEALTH_NOTES = {
  Gallina: ['Vacunada contra Newcastle y viruela.', 'Desparasitada hace 30 días.', 'Sin síntomas de enfermedad; revisada esta semana.', 'Vacunación completa y cuarentena cumplida.'],
  Gallo: ['Vacunado contra Newcastle y viruela.', 'Desparasitado hace 30 días.', 'Sin síntomas de enfermedad; revisado esta semana.', 'Vacunación completa y cuarentena cumplida.'],
} as const;
