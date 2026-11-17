import { createContext, useContext, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Bird, Sprout } from 'lucide-react-native';
import { type components, urlAbsoluta } from '@/api/cliente';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { color } from '@/theme/tokens';

type Ancestro = components['schemas']['Ancestro'];
type Ficha = components['schemas']['FichaPublica'];
type Paso = { ave: Ancestro; relacion: string };

const AnchoFamiliar = createContext(128);

function Familiar({ ave, relacion, elegir, foto, seleccionado = false }: {
  ave?: Ancestro | null; relacion: string; elegir?: () => void; foto?: string | null; seleccionado?: boolean;
}) {
  const ancho = useContext(AnchoFamiliar);
  return <Pulsable style={[s.familiar, { width: seleccionado ? Math.min(170, ancho * 2) : ancho }]} disabled={!elegir || !ave}
    accessibilityRole="button" accessibilityLabel={`${relacion}: ${ave?.name || 'No registrado'}. Ver linaje`} onPress={elegir}>
    <View style={[s.avatar, { width: Math.min(76, ancho - 8), height: Math.min(76, ancho - 8) }, !ave && s.desconocido]}>
      {foto ? <Image resizeMode="contain" source={{ uri: urlAbsoluta(foto) }} style={s.foto} accessibilityLabel={`Foto de ${ave?.name}`} /> : ave ? <Bird size={32} color={color.greenDark} /> : <Texto variante="titulo">?</Texto>}
    </View>
    <View style={s.cinta}><Texto style={s.rol}>{relacion}</Texto></View>
    <Texto variante="etiqueta" style={s.centro}>{ave?.name || 'No registrado'}</Texto>
    <Texto variante="pequeno" style={s.centro}>{ave ? `${ave.sex} · ${ave.breed || 'Raza sin definir'}` : 'Parentesco desconocido'}</Texto>
  </Pulsable>;
}

/** Navega solo por el linaje público del anuncio, sin consultar la granja privada del vendedor. */
export function ArbolLinaje({ ficha }: { ficha: Ficha }) {
  const [ancho, setAncho] = useState(320);
  const [recorrido, setRecorrido] = useState<Paso[]>([]);
  const raiz: Ancestro = { name: ficha.name, code: ficha.code, breed: ficha.breed, sex: ficha.sex,
    species: ficha.species, mother: ficha.genealogy?.mother ?? null, father: ficha.genealogy?.father ?? null };
  const actual = recorrido.at(-1)?.ave ?? raiz;
  const enfocar = (ave: Ancestro, relacion: string) => setRecorrido(p => [...p, { ave, relacion }]);
  if (!ficha.genealogy) return <View style={s.panel} onLayout={e => setAncho(e.nativeEvent.layout.width)}><Texto variante="seccion">Linaje declarado</Texto><Texto variante="subtitulo">El vendedor aún no tiene un linaje publicado para esta ave.</Texto></View>;
  return <View style={s.panel} onLayout={e => setAncho(e.nativeEvent.layout.width)}>
    <Texto variante="seccion">Árbol genealógico</Texto>
    {recorrido.length > 0 && <View style={s.recorrido}>
      <Pulsable accessibilityRole="button" onPress={() => setRecorrido([])}><Texto variante="enlace">{ficha.name}</Texto></Pulsable>
      {recorrido.map((p, i) => <Pulsable key={i} accessibilityRole="button" onPress={() => setRecorrido(r => r.slice(0, i + 1))}><Texto variante="enlace">› {p.relacion}: {p.ave.name}</Texto></Pulsable>)}
    </View>}
    <Texto variante="pequeno">Toca un familiar para ver su ficha y recorrer sus antepasados.</Texto>
    <AnchoFamiliar.Provider value={Math.min(132, Math.max(40, (ancho - 24) / 4))}>
      <View style={s.arbol}>
        <Sprout size={32} color={color.green} /><Texto variante="pequeno">LINAJE DE</Texto><Texto variante="seccion">{actual.name}</Texto>
        <View style={s.ramas}>
          {([{ lado: 'materna', rol: 'Madre', ave: actual.mother }, { lado: 'paterna', rol: 'Padre', ave: actual.father }] as const).map(r => <View key={r.lado} style={s.rama}>
            <Texto variante="etiqueta" style={s.ramaTitulo}>Rama {r.lado}</Texto>
            <View style={s.abuelos}>
              <Familiar ave={r.ave?.mother} relacion={`Abuela ${r.lado}`} elegir={() => r.ave?.mother && enfocar(r.ave.mother, `Abuela ${r.lado}`)} />
              <Familiar ave={r.ave?.father} relacion={`Abuelo ${r.lado}`} elegir={() => r.ave?.father && enfocar(r.ave.father, `Abuelo ${r.lado}`)} />
            </View>
            <View style={s.union} /><View style={s.tallo} />
            <Familiar ave={r.ave} relacion={r.rol} elegir={() => r.ave && enfocar(r.ave, r.rol)} />
            <View style={s.tallo} />
          </View>)}
        </View>
        <View style={s.unionPadres} /><View style={s.tallo} />
        <Familiar ave={actual} relacion={recorrido.at(-1)?.relacion ?? 'Esta ave'} foto={recorrido.length ? undefined : ficha.photoUrl} seleccionado />
      </View>
    </AnchoFamiliar.Provider>
    {recorrido.length > 0 && <View style={s.ficha}>
      <Texto variante="etiqueta">{recorrido.at(-1)?.relacion} de {recorrido.length > 1 ? recorrido[recorrido.length - 2].ave.name : ficha.name}</Texto>
      <Texto>{actual.sex} · {actual.breed || 'Raza sin definir'}</Texto>
      {!!actual.code && <Texto>Código: {actual.code}</Texto>}
      <Texto>Madre: {actual.mother?.name || 'No registrada'}</Texto>
      <Texto>Padre: {actual.father?.name || 'No registrado'}</Texto>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  panel: { gap: 12, marginVertical: 14 }, recorrido: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  arbol: { width: '100%', padding: 12, alignItems: 'center', backgroundColor: '#fcf6e9', borderRadius: 22 },
  ramas: { flexDirection: 'row', width: '100%', marginTop: 20 }, rama: { flex: 1, alignItems: 'center' }, ramaTitulo: { marginBottom: 14 },
  abuelos: { flexDirection: 'row', alignItems: 'stretch' },
  familiar: { width: 132, alignItems: 'center', gap: 4, paddingHorizontal: 5, paddingBottom: 8 }, seleccionado: { width: 170 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: '#708e49', backgroundColor: '#e8eddc', alignItems: 'center', justifyContent: 'center', padding: 3 },
  desconocido: { opacity: .55 }, foto: { width: '100%', height: '100%', borderRadius: 38 },
  cinta: { backgroundColor: '#b4d488', borderWidth: 1, borderColor: '#708e49', marginTop: -10, width: '100%', padding: 4 },
  rol: { color: color.greenDark, textAlign: 'center', fontSize: 11 }, centro: { textAlign: 'center' },
  union: { width: '50%', height: 14, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderColor: color.greenDark, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  tallo: { height: 20, borderLeftWidth: 2, borderColor: color.greenDark }, unionPadres: { width: '50%', borderBottomWidth: 2, borderColor: color.greenDark },
  ficha: { padding: 14, borderRadius: 16, backgroundColor: '#e8eddc', gap: 5 },
});
