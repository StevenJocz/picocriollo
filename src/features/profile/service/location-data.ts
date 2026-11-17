// Ciudades y municipios principales con su departamento. Sin dependencias: lo usan el servidor y el navegador.

export interface Location { city: string; region?: string }

/** Ciudades y municipios principales con su departamento: sirven para sugerir, completar el departamento y comparar sin errores de tildes. */
export const COLOMBIA_PLACES: readonly Location[] = [
  ['Bogotá', 'Bogotá D.C.'], ['Medellín', 'Antioquia'], ['Cali', 'Valle del Cauca'], ['Barranquilla', 'Atlántico'], ['Cartagena', 'Bolívar'], ['Cúcuta', 'Norte de Santander'],
  ['Bucaramanga', 'Santander'], ['Pereira', 'Risaralda'], ['Santa Marta', 'Magdalena'], ['Ibagué', 'Tolima'], ['Manizales', 'Caldas'], ['Villavicencio', 'Meta'],
  ['Pasto', 'Nariño'], ['Neiva', 'Huila'], ['Armenia', 'Quindío'], ['Popayán', 'Cauca'], ['Montería', 'Córdoba'], ['Valledupar', 'Cesar'], ['Sincelejo', 'Sucre'],
  ['Tunja', 'Boyacá'], ['Duitama', 'Boyacá'], ['Sogamoso', 'Boyacá'], ['Villa de Leyva', 'Boyacá'], ['Florencia', 'Caquetá'], ['Yopal', 'Casanare'], ['Riohacha', 'La Guajira'],
  ['Quibdó', 'Chocó'], ['Arauca', 'Arauca'], ['Mocoa', 'Putumayo'], ['San Andrés', 'San Andrés y Providencia'], ['Leticia', 'Amazonas'], ['Inírida', 'Guainía'],
  ['San José del Guaviare', 'Guaviare'], ['Mitú', 'Vaupés'], ['Puerto Carreño', 'Vichada'],
  ['Envigado', 'Antioquia'], ['Itagüí', 'Antioquia'], ['Bello', 'Antioquia'], ['Sabaneta', 'Antioquia'], ['Rionegro', 'Antioquia'], ['La Ceja', 'Antioquia'], ['Marinilla', 'Antioquia'],
  ['Guarne', 'Antioquia'], ['Copacabana', 'Antioquia'], ['Girardota', 'Antioquia'], ['Santa Rosa de Osos', 'Antioquia'], ['Apartadó', 'Antioquia'], ['Turbo', 'Antioquia'],
  ['Caucasia', 'Antioquia'], ['Jardín', 'Antioquia'], ['Santa Fe de Antioquia', 'Antioquia'], ['El Retiro', 'Antioquia'], ['Concordia', 'Antioquia'],
  ['Palmira', 'Valle del Cauca'], ['Buga', 'Valle del Cauca'], ['Tuluá', 'Valle del Cauca'], ['Cartago', 'Valle del Cauca'], ['Buenaventura', 'Valle del Cauca'], ['Jamundí', 'Valle del Cauca'],
  ['Soacha', 'Cundinamarca'], ['Fusagasugá', 'Cundinamarca'], ['Girardot', 'Cundinamarca'], ['Zipaquirá', 'Cundinamarca'], ['Chía', 'Cundinamarca'], ['Facatativá', 'Cundinamarca'],
  ['Silvania', 'Cundinamarca'], ['Villeta', 'Cundinamarca'],
  ['Chinchiná', 'Caldas'], ['Dosquebradas', 'Risaralda'], ['Calarcá', 'Quindío'], ['Montenegro', 'Quindío'], ['Barbosa', 'Santander'], ['San Gil', 'Santander'], ['Barrancabermeja', 'Santander'],
  ['Floridablanca', 'Santander'], ['Girón', 'Santander'], ['Pamplona', 'Norte de Santander'], ['Ocaña', 'Norte de Santander'], ['Sabanalarga', 'Atlántico'], ['Soledad', 'Atlántico'],
  ['Magangué', 'Bolívar'], ['Lorica', 'Córdoba'], ['Sahagún', 'Córdoba'], ['Espinal', 'Tolima'], ['Honda', 'Tolima'], ['Garzón', 'Huila'], ['Pitalito', 'Huila'], ['Acacías', 'Meta'],
  ['Ipiales', 'Nariño'], ['Tumaco', 'Nariño'], ['Santander de Quilichao', 'Cauca'],
].map(([city, region]) => ({ city, region }));

