import { urlAbsoluta } from '@/api/cliente';
import { createContext, useContext, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Bird, Sprout } from 'lucide-react-native';
import { Pulsable } from '@/components/Pulsable';
import { Selector } from '@/components/Selector';
import { Texto } from '@/components/Texto';
import { color, fuente, radio } from '@/theme/tokens';
import type { Ave, Nacimiento } from './modelos';
import { generaciones, hermanos, nombreGeneracion } from './linaje';

const AnchoFamiliar = createContext(128);

function Familiar({ ave, rol, elegir, seleccionado = false }: { ave?: Ave; rol: string; elegir: (id: string) => void; seleccionado?: boolean }) {
  const ancho = useContext(AnchoFamiliar);
  return (
    <Pulsable style={[s.familiar, { width: seleccionado ? Math.min(170, ancho * 2) : ancho }]} disabled={!ave || seleccionado} onPress={() => ave && elegir(ave.id)} accessibilityRole="button" accessibilityLabel={`${rol}: ${ave?.name ?? 'sin registrar'}`}>
      <View style={[s.avatar, { width: Math.min(seleccionado ? 100 : 82, seleccionado ? ancho * 1.5 : ancho - 8), height: Math.min(seleccionado ? 100 : 82, seleccionado ? ancho * 1.5 : ancho - 8) }]}>
        {ave?.photo ? <Image source={{ uri: urlAbsoluta(ave.photo) }} accessibilityLabel={`Foto de ${ave.name}`} style={s.foto} /> : ave ? <Bird size={32} color={color.green} /> : <Texto variante="titulo" style={{ color: color.muted }}>?</Texto>}
      </View>
      <View style={s.cinta}><Texto style={s.rol}>{rol}</Texto></View>
      <Texto variante="etiqueta" style={s.centrado}>{ave?.name ?? 'Sin registrar'}</Texto>
      <Texto variante="pequeno" style={s.centrado}>{ave ? `${ave.sex} · ${ave.breed || 'Raza sin definir'}` : 'Parentesco desconocido'}</Texto>
      {ave?.code && <Texto variante="pequeno" style={s.centrado}>{ave.code}</Texto>}
    </Pulsable>
  );
}

/** Árbol familiar con las fotos registradas, ramas materna/paterna y navegación por cualquier generación. */
export function ArbolGenealogico({ aves, nacimientos, inicial }: { aves: Ave[]; nacimientos: Nacimiento[]; inicial?: string }) {
  const [ancho, setAncho] = useState(320);
  const [id, elegir] = useState(inicial ?? aves.find(a => a.motherId || a.fatherId)?.id ?? aves[0]?.id ?? '');
  const ave = aves.find(a => a.id === id) ?? aves[0];
  const porId = new Map(aves.map(a => [a.id, a]));
  if (!ave) return <Texto variante="subtitulo">Registra las aves y sus padres conocidos para construir el árbol familiar.</Texto>;
  const descendencia = generaciones(aves, ave.id, 'descendencia');
  const ascendencia = generaciones(aves, ave.id, 'ascendencia');
  const familia = hermanos(aves, ave);
  const ramas = [
    { lado: 'materna', rol: 'Madre', padre: porId.get(ave.motherId ?? '') },
    { lado: 'paterna', rol: 'Padre', padre: porId.get(ave.fatherId ?? '') },
  ];
  const camada = nacimientos.filter(n => n.motherId === ave.id || n.fatherId === ave.id);
  return (
    <View style={s.panel} onLayout={e => setAncho(e.nativeEvent.layout.width)}>
      <Texto variante="seccion">Árbol genealógico</Texto>
      <Texto variante="subtitulo">Toca cualquier ave para recorrer su familia. Las fotos corresponden a cada ejemplar registrado.</Texto>
      <Selector etiqueta="Ver la línea familiar de" valor={ave.id} opciones={aves.map(a => ({ valor: a.id, etiqueta: `${a.name} · ${a.code || a.sex}` }))} alCambiar={elegir} />
      <AnchoFamiliar.Provider value={Math.min(128, Math.max(40, (ancho - 24) / 4))}>
        <View style={s.arbol}>
          <View style={s.titulo}><Sprout color={color.green} size={36} /><Texto variante="pequeno">LINAJE DE</Texto><Texto variante="titulo">{ave.name}</Texto></View>
          {ascendencia.slice(2).reverse().map((fila, i) => <View key={i} style={s.generacion}><Texto variante="etiqueta">{nombreGeneracion(ascendencia.length - 1 - i, true)}</Texto><View style={s.fila}>{fila.map(a => <Familiar key={a.id} ave={a} rol="Ancestro" elegir={elegir} />)}</View></View>)}
          <View style={s.ramas}>
            {ramas.map(r => <View key={r.lado} style={s.rama}>
              <Texto variante="pequeno" style={s.centrado}>RAMA {r.lado.toUpperCase()}</Texto>
              <View style={s.fila}>
                <Familiar ave={porId.get(r.padre?.motherId ?? '')} rol="Abuela" elegir={elegir} />
                <Familiar ave={porId.get(r.padre?.fatherId ?? '')} rol="Abuelo" elegir={elegir} />
              </View>
              <View style={s.union} /><View style={s.tallo} />
              <Familiar ave={r.padre} rol={r.rol} elegir={elegir} />
              <View style={s.tallo} />
            </View>)}
          </View>
          <View style={s.unionPadres} /><View style={s.tallo} />
          <Familiar ave={ave} rol="Ejemplar seleccionado" elegir={elegir} seleccionado />
          {familia.length > 0 && <View style={s.generacion}><Texto variante="etiqueta">Hermanos registrados</Texto><View style={s.fila}>{familia.map(a => <Familiar key={a.id} ave={a} rol={a.sex === 'Gallina' ? 'Hermana' : 'Hermano'} elegir={elegir} />)}</View></View>}
          {descendencia.map((fila, i) => <View key={i} style={s.generacion}><View style={s.tallo} /><Texto variante="etiqueta">{nombreGeneracion(i)}</Texto><View style={s.fila}>{fila.map(a => <Familiar key={a.id} ave={a} rol={nombreGeneracion(i)} elegir={elegir} />)}</View></View>)}
          {!descendencia.length && <Texto variante="pequeno">Todavía no hay descendientes individuales registrados.</Texto>}
        </View>
      </AnchoFamiliar.Provider>
      {camada.length > 0 && <View style={{ gap: 6 }}><Texto variante="etiqueta">Nacimientos asociados</Texto>{camada.map(n => <Texto variante="pequeno" key={n.id}>{n.count} pollitos · {n.date} · Madre: {porId.get(n.motherId ?? '')?.name ?? 'desconocida'} · Padre: {porId.get(n.fatherId ?? '')?.name ?? 'desconocido'}</Texto>)}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { gap: 14, marginVertical: 14 }, lienzo: { flexGrow: 1 },
  arbol: { width: '100%', alignItems: 'center', backgroundColor: '#fcf6e9', borderRadius: radio.md, padding: 12, gap: 0 },
  titulo: { alignItems: 'center', gap: 5, marginBottom: 24 },
  ramas: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', gap: 0 }, rama: { alignItems: 'center', gap: 0, flex: 1 },
  fila: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 0 },
  familiar: { width: 128, alignItems: 'center', padding: 6, gap: 4, marginBottom: 8 },
  seleccionado: { width: 170 },
  avatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 2, borderColor: '#708e49', padding: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8eddc' },
  avatarSeleccionado: { width: 100, height: 100, borderRadius: 50 },
  foto: { width: '100%', height: '100%', borderRadius: 50 },
  cinta: { backgroundColor: '#b4d488', borderWidth: 1, borderColor: '#708e49', marginTop: -11, width: '100%', paddingHorizontal: 6, paddingVertical: 3 },
  rol: { fontFamily: fuente.textoMedio, fontSize: 11, textAlign: 'center', color: color.greenDark }, centrado: { textAlign: 'center' },
  union: { width: '50%', height: 15, borderBottomWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderColor: color.greenDark, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  unionPadres: { width: '51%', borderBottomWidth: 2, borderColor: color.greenDark }, tallo: { height: 22, borderLeftWidth: 2, borderColor: color.greenDark },
  generacion: { alignItems: 'center', gap: 10, marginTop: 12, alignSelf: 'stretch' },
});
