// Definición de los formularios de «Mi granja». Cada módulo dice qué campos tiene; una sola pantalla los dibuja.
// Las claves de los campos son las del DTO de la API (name, capacity, startedAt…): el cuerpo se arma sin traducir nada.
// Las validaciones de aquí solo evitan viajes inútiles: la API vuelve a validar todo y es quien manda.
import { hoyTexto, numero } from './calculos.ts';
import type { Granja } from './modelos';
import type { Modulo } from './servicio';

export type TipoCampo = 'texto' | 'area' | 'entero' | 'decimal' | 'fecha' | 'opcion' | 'referencia' | 'multiple' | 'foto';
export type ListaReferencia = 'coops' | 'gallinas' | 'gallos' | 'stock' | 'incubaciones';
export type Valores = Record<string, string>;

export interface CampoDef {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  opciones?: string[];
  lista?: ListaReferencia;
  ayuda?: string;
  placeholder?: string;
  minimo?: number;
  exclusivo?: boolean;
  porDefecto?: string | (() => string);
  /** Si el campo está vacío no se envía (el servidor aplica su valor por defecto o lo deja sin definir). */
  omitirVacio?: boolean;
  visible?: (valores: Valores) => boolean;
}

export interface ModuloDef {
  clave: Modulo;
  titulo: string;
  singular: string;
  /** Para el título: «Nuevo gallinero», «Nueva ave». */
  nuevo: string;
  /** Lista del documento de la granja de donde sale el registro al editar. */
  lista: keyof Granja;
  campos: CampoDef[];
  /** Los consumos solo se crean: no se editan ni se borran desde aquí. */
  soloCrear?: boolean;
}

const notas: CampoDef = { clave: 'notes', etiqueta: 'Observaciones', tipo: 'area' };
const cero = '0';

export const MODULOS: Record<Modulo, ModuloDef> = {
  gallinero: {
    clave: 'gallinero', nuevo: 'Nuevo gallinero', titulo: 'Gallineros', singular: 'gallinero', lista: 'coops',
    campos: [
      { clave: 'name', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'location', etiqueta: 'Ubicación', tipo: 'texto' },
      { clave: 'capacity', etiqueta: 'Capacidad de aves', tipo: 'entero', requerido: true, minimo: 1 },
      { clave: 'type', etiqueta: 'Tipo', tipo: 'opcion', opciones: ['Piso', 'Pastoril', 'Mixto', 'Cría'], omitirVacio: true },
      { clave: 'status', etiqueta: 'Estado', tipo: 'opcion', opciones: ['Activo', 'Inactivo', 'En mantenimiento'], porDefecto: 'Activo' },
      { clave: 'startedAt', etiqueta: 'En funcionamiento desde', tipo: 'fecha' },
      notas,
    ],
  },
  ave: {
    clave: 'ave', nuevo: 'Nueva ave', titulo: 'Mis aves', singular: 'ave', lista: 'birds',
    campos: [
      { clave: 'photo', etiqueta: 'Foto del ave', tipo: 'foto' },
      { clave: 'name', etiqueta: 'Nombre o apodo', tipo: 'texto', requerido: true },
      { clave: 'sex', etiqueta: 'Sexo', tipo: 'opcion', opciones: ['Gallina', 'Gallo', 'Pollito'], requerido: true },
      { clave: 'breed', etiqueta: 'Raza', tipo: 'texto' },
      { clave: 'coopId', etiqueta: 'Gallinero', tipo: 'referencia', lista: 'coops', requerido: true },
      { clave: 'status', etiqueta: 'Estado', tipo: 'opcion', opciones: ['Activo', 'En reproducción', 'Clueca', 'Inactivo', 'Vendido', 'Fallecido'], porDefecto: 'Activo' },
      { clave: 'bornAt', etiqueta: 'Fecha de nacimiento (opcional)', tipo: 'fecha' },
      { clave: 'origin', etiqueta: 'Procedencia', tipo: 'texto' },
      { clave: 'motherId', etiqueta: 'Madre conocida (opcional)', tipo: 'referencia', lista: 'gallinas' },
      { clave: 'fatherId', etiqueta: 'Padre conocido (opcional)', tipo: 'referencia', lista: 'gallos' },
      notas,
    ],
  },
  recoleccion: {
    clave: 'recoleccion', nuevo: 'Nueva recolección', titulo: 'Recolección de huevos', singular: 'recolección', lista: 'eggs',
    campos: [
      { clave: 'date', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'coopId', etiqueta: 'Gallinero', tipo: 'referencia', lista: 'coops', requerido: true },
      { clave: 'henId', etiqueta: 'Gallina que puso (si se conoce)', tipo: 'referencia', lista: 'gallinas' },
      { clave: 'eggs', etiqueta: 'Huevos recolectados', tipo: 'entero', requerido: true, minimo: 0 },
      { clave: 'broken', etiqueta: 'Rotos', tipo: 'entero', minimo: 0, porDefecto: cero },
      { clave: 'dirty', etiqueta: 'Sucios', tipo: 'entero', minimo: 0, porDefecto: cero },
      { clave: 'incubation', etiqueta: 'Para incubación', tipo: 'entero', minimo: 0, porDefecto: cero },
      { clave: 'consumption', etiqueta: 'Para consumo', tipo: 'entero', minimo: 0, porDefecto: cero },
      { clave: 'sale', etiqueta: 'Para venta o clasificación', tipo: 'entero', minimo: 0, porDefecto: cero },
      notas,
    ],
  },
  incubacion: {
    clave: 'incubacion', nuevo: 'Nueva incubación', titulo: 'Cluecas e incubación', singular: 'incubación', lista: 'incubations',
    campos: [
      { clave: 'type', etiqueta: 'Tipo de incubación', tipo: 'opcion', opciones: ['Natural', 'Artificial'], requerido: true, porDefecto: 'Natural' },
      { clave: 'henId', etiqueta: 'Gallina clueca', tipo: 'referencia', lista: 'gallinas', requerido: true, visible: v => v.type !== 'Artificial' },
      { clave: 'equipment', etiqueta: 'Incubadora o equipo', tipo: 'texto', visible: v => v.type === 'Artificial' },
      { clave: 'coopId', etiqueta: 'Gallinero o espacio', tipo: 'referencia', lista: 'coops', requerido: true },
      { clave: 'startedAt', etiqueta: 'Inicio', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'eggs', etiqueta: 'Huevos iniciales', tipo: 'entero', requerido: true, minimo: 1 },
      { clave: 'hatched', etiqueta: 'Pollitos nacidos', tipo: 'entero', minimo: 0, porDefecto: cero },
      { clave: 'removed', etiqueta: 'Retirados o descartados', tipo: 'entero', minimo: 0, porDefecto: cero },
      { clave: 'hatchAdjustmentDays', etiqueta: 'Ajuste a la fecha estimada (días)', tipo: 'entero', minimo: -14, omitirVacio: true, ayuda: 'Opcional. Suma o resta días a los 21 habituales.' },
      { clave: 'status', etiqueta: 'Estado', tipo: 'opcion', opciones: ['En curso', 'Finalizada', 'Interrumpida'], requerido: true, porDefecto: 'En curso' },
      notas,
    ],
  },
  compra: {
    clave: 'compra', nuevo: 'Nueva compra', titulo: 'Compras y gastos', singular: 'compra', lista: 'purchases',
    campos: [
      { clave: 'date', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'product', etiqueta: 'Producto', tipo: 'texto', requerido: true, ayuda: 'Si ya existe en el inventario, se suma a sus existencias.' },
      { clave: 'category', etiqueta: 'Categoría', tipo: 'opcion', opciones: ['Alimento ponedoras', 'Alimento engorde', 'Maíz triturado', 'Viruta y aserrín', 'Veterinaria', 'Materiales', 'Equipos', 'Otros'], porDefecto: 'Otros' },
      { clave: 'quantity', etiqueta: 'Cantidad', tipo: 'decimal', requerido: true, minimo: 0, exclusivo: true },
      { clave: 'unit', etiqueta: 'Unidad', tipo: 'opcion', opciones: ['kg', 'bulto', 'saco', 'unidad', 'litro'], porDefecto: 'kg' },
      { clave: 'unitPrice', etiqueta: 'Precio unitario (COP)', tipo: 'decimal', requerido: true, minimo: 0 },
      { clave: 'supplier', etiqueta: 'Proveedor', tipo: 'texto' },
      { clave: 'coopId', etiqueta: 'Gallinero (opcional)', tipo: 'referencia', lista: 'coops' },
      notas,
    ],
  },
  consumo: {
    clave: 'consumo', nuevo: 'Registrar consumo', titulo: 'Registrar consumo', singular: 'consumo', lista: 'movements', soloCrear: true,
    campos: [
      { clave: 'stockId', etiqueta: 'Producto', tipo: 'referencia', lista: 'stock', requerido: true },
      { clave: 'quantity', etiqueta: 'Cantidad a consumir', tipo: 'decimal', requerido: true, minimo: 0, exclusivo: true },
      { clave: 'date', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'coopId', etiqueta: 'Gallinero (opcional)', tipo: 'referencia', lista: 'coops' },
      { clave: 'notes', etiqueta: 'Motivo o uso', tipo: 'area' },
    ],
  },
  tarea: {
    clave: 'tarea', nuevo: 'Nueva tarea', titulo: 'Limpieza y mantenimiento', singular: 'tarea', lista: 'maintenance',
    campos: [
      { clave: 'title', etiqueta: 'Tarea', tipo: 'texto', requerido: true },
      { clave: 'coopId', etiqueta: 'Gallinero', tipo: 'referencia', lista: 'coops', requerido: true },
      { clave: 'frequencyDays', etiqueta: 'Frecuencia (días)', tipo: 'entero', requerido: true, minimo: 1 },
      { clave: 'lastDone', etiqueta: 'Última realizada', tipo: 'fecha' },
      { clave: 'nextDue', etiqueta: 'Próxima fecha', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'status', etiqueta: 'Estado', tipo: 'opcion', opciones: ['Pendiente', 'Próxima', 'Vencida', 'Completada'], porDefecto: 'Pendiente' },
      { clave: 'stockId', etiqueta: 'Producto usado (opcional)', tipo: 'referencia', lista: 'stock' },
      { clave: 'supplies', etiqueta: 'Cantidad utilizada', tipo: 'decimal', minimo: 0, porDefecto: cero },
      notas,
    ],
  },
  nacimiento: {
    clave: 'nacimiento', nuevo: 'Nuevo nacimiento', titulo: 'Nacimientos', singular: 'nacimiento', lista: 'births',
    campos: [
      { clave: 'incubationId', etiqueta: 'Incubación', tipo: 'referencia', lista: 'incubaciones', requerido: true },
      { clave: 'date', etiqueta: 'Fecha de nacimiento', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'count', etiqueta: 'Pollitos del lote', tipo: 'entero', requerido: true, minimo: 1 },
      { clave: 'motherId', etiqueta: 'Madre conocida', tipo: 'referencia', lista: 'gallinas', ayuda: 'Solo si la conoces; no se asume.' },
      { clave: 'fatherId', etiqueta: 'Padre conocido', tipo: 'referencia', lista: 'gallos', ayuda: 'Solo si lo conoces; no se asume.' },
      { clave: 'parentageStatus', etiqueta: 'Qué tan seguro es el parentesco', tipo: 'opcion', opciones: ['Confirmada', 'Probable', 'Desconocida'], omitirVacio: true },
      { clave: 'coopId', etiqueta: 'Gallinero de cría', tipo: 'referencia', lista: 'coops' },
      { clave: 'breed', etiqueta: 'Raza o cruce conocido', tipo: 'texto' },
      notas,
    ],
  },
  grupo: {
    clave: 'grupo', nuevo: 'Nuevo grupo reproductor', titulo: 'Grupos reproductores', singular: 'grupo reproductor', lista: 'breedingGroups',
    campos: [
      { clave: 'name', etiqueta: 'Nombre del grupo', tipo: 'texto', requerido: true },
      { clave: 'roosterId', etiqueta: 'Gallo', tipo: 'referencia', lista: 'gallos', requerido: true },
      { clave: 'henIds', etiqueta: 'Gallinas', tipo: 'multiple', lista: 'gallinas', requerido: true },
      { clave: 'startedAt', etiqueta: 'Desde', tipo: 'fecha', requerido: true, porDefecto: hoyTexto },
      { clave: 'endedAt', etiqueta: 'Hasta (opcional)', tipo: 'fecha', ayuda: 'Te avisamos cuando se acerque para decidir si continúa.' },
      { clave: 'status', etiqueta: 'Estado', tipo: 'opcion', opciones: ['Activo', 'Finalizado'], porDefecto: 'Activo' },
      { clave: 'coopId', etiqueta: 'Gallinero', tipo: 'referencia', lista: 'coops' },
      { clave: 'breed', etiqueta: 'Raza o cruce', tipo: 'texto' },
      notas,
    ],
  },
  cliente: {
    clave: 'cliente', nuevo: 'Nuevo cliente', titulo: 'Clientes', singular: 'cliente', lista: 'customers',
    campos: [
      { clave: 'name', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'phone', etiqueta: 'Teléfono', tipo: 'texto', placeholder: '300 123 4567' },
      { clave: 'contact', etiqueta: 'Otro dato de contacto', tipo: 'texto' },
      notas,
    ],
  },
  producto: {
    clave: 'producto', nuevo: 'Nuevo producto', titulo: 'Catálogo de productos', singular: 'producto', lista: 'customProducts',
    campos: [
      { clave: 'name', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'category', etiqueta: 'Categoría', tipo: 'texto', placeholder: 'Alimento, equipos…', omitirVacio: true },
      { clave: 'unit', etiqueta: 'Unidad', tipo: 'texto', requerido: true, placeholder: 'kg, bulto, unidad…' },
      { clave: 'price', etiqueta: 'Precio de venta (COP)', tipo: 'decimal', requerido: true, minimo: 0 },
      { clave: 'available', etiqueta: 'Existencia', tipo: 'decimal', requerido: true, minimo: 0 },
    ],
  },
};

export const esModulo = (valor: string | undefined): valor is Modulo => !!valor && valor in MODULOS;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const comoTexto = (valor: unknown) => (valor === undefined || valor === null ? '' : Array.isArray(valor) ? valor.join(',') : typeof valor === 'number' ? numero(valor) : String(valor));

/** Valores de un formulario nuevo (con los predeterminados) o de un registro que se edita. Todo como texto, que es lo que escriben las personas. */
export function valoresIniciales(def: ModuloDef, fila?: object): Valores {
  const origen = fila as Record<string, unknown> | undefined;
  const valores: Valores = {};
  for (const campo of def.campos) {
    const porDefecto = typeof campo.porDefecto === 'function' ? campo.porDefecto() : (campo.porDefecto ?? '');
    valores[campo.clave] = origen ? comoTexto(origen[campo.clave]) || (campo.tipo === 'opcion' ? porDefecto : '') : porDefecto;
  }
  return valores;
}

const aNumero = (texto: string) => Number(texto.trim().replace(',', '.'));

/** Errores por campo (clave → mensaje). Vacío si todo está bien. */
export function validar(def: ModuloDef, valores: Valores): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const campo of def.campos) {
    if (campo.visible && !campo.visible(valores)) continue;
    const valor = (valores[campo.clave] ?? '').trim();
    if (!valor) {
      if (campo.requerido) errores[campo.clave] = campo.tipo === 'opcion' || campo.tipo === 'referencia' ? 'Elige una opción.' : campo.tipo === 'multiple' ? 'Elige al menos una.' : 'Este dato es obligatorio.';
      continue;
    }
    if (campo.tipo === 'fecha' && !FECHA.test(valor)) errores[campo.clave] = 'Usa el formato AAAA-MM-DD, por ejemplo 2026-10-22.';
    if (campo.tipo === 'entero' || campo.tipo === 'decimal') {
      const n = aNumero(valor);
      if (!Number.isFinite(n)) errores[campo.clave] = 'Escribe un número válido.';
      else if (campo.tipo === 'entero' && !Number.isInteger(n)) errores[campo.clave] = 'Escribe un número entero.';
      else if (campo.minimo !== undefined && (campo.exclusivo ? n <= campo.minimo : n < campo.minimo))
        errores[campo.clave] = campo.exclusivo ? `Debe ser mayor que ${campo.minimo}.` : `Debe ser ${campo.minimo === 0 ? 'cero o mayor' : `al menos ${campo.minimo}`}.`;
    }
  }
  return errores;
}

/** El cuerpo de la petición: números como números, y sin los campos vacíos que el servidor completa o ignora. */
export function aCuerpo(def: ModuloDef, valores: Valores): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {};
  for (const campo of def.campos) {
    if (campo.visible && !campo.visible(valores)) continue;
    const valor = (valores[campo.clave] ?? '').trim();
    if (campo.tipo === 'multiple') cuerpo[campo.clave] = valor ? valor.split(',').map(x => x.trim()).filter(Boolean) : [];
    else if (campo.tipo === 'entero' || campo.tipo === 'decimal') {
      if (valor) cuerpo[campo.clave] = aNumero(valor);
      else if (!campo.omitirVacio) cuerpo[campo.clave] = 0;
    } else if (valor || !campo.omitirVacio) cuerpo[campo.clave] = valor;
  }
  return cuerpo;
}

export interface OpcionLista { valor: string; etiqueta: string }

/** Las personas, gallineros o productos entre los que se elige en los campos de referencia. */
export function opcionesDe(lista: ListaReferencia, granja: Granja): OpcionLista[] {
  switch (lista) {
    case 'coops': return granja.coops.map(c => ({ valor: c.id, etiqueta: c.name }));
    case 'gallinas': return granja.birds.filter(a => a.sex === 'Gallina' && a.status !== 'Vendido' && a.status !== 'Fallecido').map(a => ({ valor: a.id, etiqueta: a.name }));
    case 'gallos': return granja.birds.filter(a => a.sex === 'Gallo' && a.status !== 'Vendido' && a.status !== 'Fallecido').map(a => ({ valor: a.id, etiqueta: a.name }));
    case 'incubaciones': return granja.incubations.map(i => ({ valor: i.id, etiqueta: `${i.type === 'Artificial' ? 'Incubadora' : 'Clueca'}${i.code ? ` ${i.code}` : ''} · ${i.startedAt} · ${i.status}` }));
    case 'stock': return granja.stock.map(s => ({ valor: s.id, etiqueta: `${s.product} (${numero(s.quantity)} ${s.unit})` }));
  }
}
