import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CabeceraCriador } from '@/components/CabeceraCriador';
import { Reel } from '@/features/social/Reel';
import { Destacados } from '@/features/social/Destacados';
import { Clapperboard, ChevronUp } from 'lucide-react-native';
import { Pulsable } from '@/components/Pulsable';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Buscador } from '@/components/Buscador';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Texto } from '@/components/Texto';
import { ir } from '@/features/mercado/componentes';
import { claveCorta, claveDeReel, debePrecargarSiguiente } from '@/features/social/formato';
import * as s from '@/features/social/servicio';
import { prepararCola } from '@/features/social/colaPrecarga';
import { prepararReel } from '@/features/social/precarga';

const PAGINA = 8;

export default function Reels() {
  const { etiqueta, explorar } = useLocalSearchParams<{ etiqueta?: string; explorar?: string }>();
  const [texto, setTexto] = useState('');
  useEffect(() => { if (etiqueta) setTexto(etiqueta.startsWith('#') ? etiqueta : `#${etiqueta}`); }, [etiqueta]);
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState<s.ElementoReel[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [masCargando, setMasCargando] = useState(false);
  const [error, setError] = useState('');
  const [encabezado, setEncabezado] = useState(false);
  useEffect(() => { if (explorar) setEncabezado(true); }, [explorar]);
  // «Para ti»: lo ya visto y una semilla por visita para que la página siguiente no repita nada y el orden cambie de una visita a otra.
  const vistos = useRef<string[]>([]);
  const lista = useRef<FlatList<s.ElementoReel>>(null);
  const [alto, setAlto] = useState(500);
  const [activo, setActivo] = useState('');
  const [enFoco, setEnFoco] = useState(false);
  const enCurso = useRef(false);
  const solicitud = useRef(0);
  const totalRef = useRef(0);
  const cargarMasRef = useRef(() => undefined);
  const visibilidad = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 200 }).current;
  const alVer = useRef(({ viewableItems }: { viewableItems: { item: s.ElementoReel; index?: number | null }[] }) => {
    const visible = viewableItems[0];
    setActivo(visible?.item.id ?? '');
    if (visible?.index != null && debePrecargarSiguiente(visible.index, totalRef.current)) cargarMasRef.current();
  }).current;
  const semilla = useRef(Math.random().toString(36).slice(2, 10));
  totalRef.current = items.length;

  useFocusEffect(useCallback(() => {
    setEnFoco(true);
    return () => setEnFoco(false);
  }, []));

  useEffect(() => { const t = setTimeout(() => setBusqueda(texto.trim()), 350); return () => clearTimeout(t); }, [texto]);

  const cargar = useCallback(async (reiniciar: boolean) => {
    if (!reiniciar && enCurso.current) return;
    enCurso.current = true;
    const turno = ++solicitud.current;
    const consulta = busqueda.startsWith('#') ? { etiqueta: busqueda.slice(1) } : { q: busqueda || undefined };
    const paraTi = !busqueda;
    if (reiniciar) { vistos.current = []; semilla.current = Math.random().toString(36).slice(2, 10); setCargando(true); setItems([]); } else setMasCargando(true);
    try {
      const pagina = await s.reels({
        limite: PAGINA, ...consulta,
        ...(paraTi ? { vistos: vistos.current.slice(-200).join(','), semilla: semilla.current } : { antes: reiniciar ? undefined : siguiente ?? undefined }),
      });
      if (turno !== solicitud.current) return;
      if (reiniciar) { lista.current?.scrollToOffset({ offset: 0, animated: false }); setActivo(pagina.items[0]?.id ?? ''); }
      vistos.current.push(...pagina.items.map(i => claveCorta(claveDeReel(i.kind as 'post' | 'advertisement', i.id))));
      const preparados: s.ElementoReel[] = [];
      const fallidos = await prepararCola(pagina.items, prepararReel, item => {
        if (turno !== solicitud.current) return;
        if (reiniciar) {
          setItems(actuales => actuales.some(a => a.id === item.id) ? actuales : [...actuales, item]);
          setCargando(false);
        } else preparados.push(item);
      });
      if (turno !== solicitud.current) return;
      if (!reiniciar && preparados.length) {
        const claves = new Set(preparados.map(i => `${i.kind}:${i.id}`));
        const ordenados = pagina.items.filter(i => claves.has(`${i.kind}:${i.id}`));
        setItems(actuales => {
          const existentes = new Set(actuales.map(i => `${i.kind}:${i.id}`));
          return [...actuales, ...ordenados.filter(i => !existentes.has(`${i.kind}:${i.id}`))];
        });
      }
      setSiguiente(pagina.nextBefore ?? null);
      setError(fallidos.length === pagina.items.length && fallidos.length > 0 ? 'No se pudieron preparar las imágenes. Pulsa Reintentar.' : '');
    } catch (e) { if (turno !== solicitud.current) return; setError(e instanceof Error ? e.message : 'No se pudieron cargar los reels.'); }
    finally { if (turno === solicitud.current) { enCurso.current = false; setCargando(false); setMasCargando(false); } }
  }, [busqueda, siguiente]);

  cargarMasRef.current = () => {
    if (siguiente && !cargando && !masCargando) void cargar(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void cargar(true); }, [busqueda]);

  // La segunda página se prepara apenas termina la primera; queda fuera de vista.
  useEffect(() => {
    if (items.length > 0 && items.length <= PAGINA) cargarMasRef.current();
  }, [items.length, siguiente]);

  const cambiar = (nuevo: s.Post) => setItems(actuales => actuales.map(i => (i.kind === 'post' && i.id === nuevo.id ? { ...i, post: nuevo } : i)));
  const quitar = (id: string) => setItems(actuales => actuales.filter(i => i.id !== id));

  return (
    <SafeAreaView style={estilos.raiz} edges={['top', 'bottom']}>
      <View style={estilos.columna}>
        {encabezado && <View style={estilos.cabecera}><CabeceraCriador compacto />
          <Destacados />
          <Cabecera titulo="Para ti" accion={<BotonNuevo titulo="Publicar" alPulsar={() => ir('/reels/nuevo')} />} />
          <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar o escribir #etiqueta" />
          <Pulsable accessibilityRole="button" accessibilityLabel="Ocultar encabezado" onPress={() => setEncabezado(false)} style={estilos.cerrarCabecera}><ChevronUp size={18} color="#286444" /></Pulsable>
        </View>}
        <View style={estilos.feed} onLayout={e => setAlto(Math.max(1, Math.floor(e.nativeEvent.layout.height)))}>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <FlatList ref={lista} data={items} keyExtractor={i => `${i.kind}:${i.id}`} pagingEnabled
            snapToInterval={alto} decelerationRate="fast" disableIntervalMomentum
            showsVerticalScrollIndicator={false} style={{ flex: 1 }}
            getItemLayout={(_, index) => ({ length: alto, offset: alto * index, index })}
            viewabilityConfig={visibilidad} onViewableItemsChanged={alVer}
            refreshing={cargando} onRefresh={() => void cargar(true)}
            onEndReached={() => cargarMasRef.current()} onEndReachedThreshold={1}
            windowSize={5} initialNumToRender={3} maxToRenderPerBatch={3}
            renderItem={({ item, index }) => <Reel item={item} alto={alto} activo={enFoco && activo === item.id} precargar={Math.abs(index - Math.max(0, items.findIndex(i => i.id === activo))) <= 2} alCambiar={cambiar} alEtiqueta={setTexto} />}
            ListEmptyComponent={<EstadoVacio icono={Clapperboard} titulo={cargando ? 'Cargando reels…' : busqueda ? 'No hay coincidencias' : 'Todavía no hay reels'} texto="Fotos, historias y anuncios de nuestra comunidad." accion={error ? 'Reintentar' : 'Publicar'} alPulsar={() => error ? void cargar(true) : ir('/reels/nuevo')} />}
            ListFooterComponent={error && items.length > 0 ? <Boton titulo="Reintentar" onPress={() => void cargar(false)} /> : undefined}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#edf4e9', paddingBottom: 94 },
  columna: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  cabecera: { position: 'absolute', zIndex: 20, top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 6, backgroundColor: '#edf4e9fa', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  cerrarCabecera: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  feed: { flex: 1, minHeight: 0, marginHorizontal: 8, overflow: 'hidden', borderRadius: 24 },
});
