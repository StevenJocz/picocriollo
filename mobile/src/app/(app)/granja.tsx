import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AlarmClock, Bird, Egg, Flame, House, Package, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react-native';
import { Boton } from '@/components/Boton';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { InsigniaIcono, type Tono } from '@/components/InsigniaIcono';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { BannerEclosion } from '@/features/granja/BannerEclosion';
import { conteo, fechaLarga, hoyTexto, numero, pesos, proximaEclosion, resumenGranja, tareaVencida } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { color, fuente, radio, sombra } from '@/theme/tokens';

const categorias: { nombre: string; icono: LucideIcon; tono: Tono; ruta: string }[] = [
  { nombre: 'Mis aves', icono: Bird, tono: 'verde', ruta: '/aves' },
  { nombre: 'Recolección', icono: Egg, tono: 'rosa', ruta: '/huevos' },
  { nombre: 'Incubación', icono: Flame, tono: 'dorado', ruta: '/incubaciones' },
  { nombre: 'Inventario', icono: Package, tono: 'gris', ruta: '/inventario' },
  { nombre: 'Agenda', icono: AlarmClock, tono: 'azul', ruta: '/agenda' },
  { nombre: 'Gallineros', icono: House, tono: 'verde', ruta: '/gallineros' },
];

const iniciales = (texto: string) => texto.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';

export default function Inicio() {
  const { granja } = useGranja();
  const hoy = hoyTexto();
  const resumen = resumenGranja(granja, hoy);
  const eclosion = proximaEclosion(granja);
  const maximo = Math.max(1, ...resumen.ultimosSieteDias.map(d => d.huevos));
  const sinGallineros = granja.coops.length === 0;

  return (
    <Pantalla barra>
      <Entrada indice={1} style={styles.saludo}>
        <Texto variante="titulo" style={styles.tituloInicio}>¿Qué estamos <Text style={{ color: color.green }}>criando</Text> hoy?</Texto>
      </Entrada>

      <ContenidoGranja>
        <Entrada indice={2}>
          <View style={styles.principal}>
            <View style={{ flex: 1, gap: 8 }}>
              <Texto variante="seccion">{sinGallineros ? 'Empieza por tu gallinero' : 'Registra la recolección de hoy'}</Texto>
              <Texto variante="subtitulo">{sinGallineros ? 'Crea tu primer gallinero para registrar aves, huevos e incubaciones.' : `Hoy llevas ${resumen.huevosHoy} huevo${resumen.huevosHoy === 1 ? '' : 's'}. Anota cada jornada y mira cómo va la postura.`}</Texto>
              <View style={{ marginTop: 6 }}>
                <Boton titulo={sinGallineros ? 'Crear gallinero' : 'Registrar huevos'} onPress={() => router.push(sinGallineros ? '/formulario/gallinero' : '/formulario/recoleccion')} />
              </View>
            </View>
          </View>
        </Entrada>

        <Entrada indice={3}>
          <View style={styles.mini}>
            <Texto variante="seccion">Explora</Texto>
            <Texto variante="pequeno">Desliza para ver más</Texto>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tira} style={styles.tiraExterior}>
            {categorias.map(c => (
              <Pulsable key={c.nombre} accessibilityRole="button" accessibilityLabel={c.nombre} onPress={() => router.push(c.ruta as never)} style={styles.categoria}>
                <InsigniaIcono icono={c.icono} tono={c.tono} />
                <Texto style={styles.categoriaNombre}>{c.nombre}</Texto>
              </Pulsable>
            ))}
          </ScrollView>
        </Entrada>

        {eclosion ? <Entrada indice={4}><BannerEclosion proxima={eclosion} /></Entrada> : null}

        <Entrada indice={4}>
          <Texto variante="seccion" style={styles.encabezado}>Tu panorama</Texto>
          <View style={styles.rejilla}>
            <Metrica icono={House} tono="verde" etiqueta="Gallineros activos" valor={String(resumen.gallinerosActivos)} detalle={conteo(resumen.gallinerosTotal, 'registrado', 'registrados')} />
            <Metrica icono={Bird} tono="dorado" etiqueta="Aves activas" valor={String(resumen.aves)} detalle={`${conteo(resumen.gallinas, 'gallina', 'gallinas')} · ${conteo(resumen.gallos, 'gallo', 'gallos')}`} />
            <Metrica icono={Egg} tono="rosa" etiqueta="Huevos esta semana" valor={String(resumen.huevosSemana)} detalle={`${resumen.huevosHoy} hoy · ${resumen.huevosMes} en 30 días`} />
            <Metrica icono={Wallet} tono="azul" etiqueta="Gastos del mes" valor={pesos(resumen.gastosMes)} detalle="Compras de los últimos 30 días" />
          </View>
        </Entrada>

        <Entrada indice={4}>
          <View style={styles.panel}>
            <View style={styles.mini}>
              <Texto variante="seccion">Ritmo de postura</Texto>
              <Texto variante="pequeno">{resumen.posturaPct === null ? 'Sin gallinas ponedoras' : resumen.posturaPct > 100 ? 'Registra todas tus gallinas para calcularla' : `${resumen.posturaPct}% aprox.`}</Texto>
            </View>
            <View style={styles.barras} accessibilityRole="image" accessibilityLabel={`Huevos por día, últimos 7 días: ${resumen.ultimosSieteDias.map(d => d.huevos).join(', ')}`}>
              {resumen.ultimosSieteDias.map((d, i) => (
                <View key={d.fecha} style={styles.columna}>
                  <Texto style={styles.valorBarra}>{d.huevos}</Texto>
                  <View style={styles.pista}><View style={[styles.barra, { height: `${Math.max(6, (d.huevos / maximo) * 100)}%`, backgroundColor: i === 6 ? color.green : '#b9dcc6' }]} /></View>
                  <Texto variante="pequeno">{new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(new Date(`${d.fecha}T12:00:00`)).replace('.', '')}</Texto>
                </View>
              ))}
            </View>
          </View>
        </Entrada>

        <Entrada indice={4}>
          <View style={styles.panel}>
            <View style={styles.mini}>
              <Texto variante="seccion">Próximos cuidados</Texto>
              <Pulsable accessibilityRole="link" onPress={() => router.push('/agenda')} hitSlop={10}><Texto variante="enlace">Ver agenda</Texto></Pulsable>
            </View>
            {resumen.tareasProximas.length ? resumen.tareasProximas.map(t => (
              <View key={t.id} style={styles.filaSimple}>
                <View style={{ flex: 1 }}>
                  <Texto variante="etiqueta" numberOfLines={1}>{t.title}</Texto>
                  <Texto variante="pequeno">{granja.coops.find(c => c.id === t.coopId)?.name ?? 'Gallinero'} · {fechaLarga(t.nextDue)}</Texto>
                </View>
                <Chip texto={tareaVencida(t, hoy) ? 'Vencida' : t.status} tono={tareaVencida(t, hoy) ? 'error' : 'neutro'} />
              </View>
            )) : <Texto variante="subtitulo">No tienes tareas pendientes. Crea una en la agenda.</Texto>}
          </View>
        </Entrada>

        {resumen.stockBajo.length ? (
          <Entrada indice={4}>
            <View style={styles.panel}>
              <Texto variante="seccion">Para tener en cuenta</Texto>
              {resumen.stockBajo.map(s => (
                <View key={s.id} style={styles.filaSimple}>
                  <TriangleAlert size={20} color={color.error} strokeWidth={1.8} />
                  <View style={{ flex: 1 }}>
                    <Texto variante="etiqueta">{s.product} está por debajo del mínimo</Texto>
                    <Texto variante="pequeno">Quedan {numero(s.quantity)} {s.unit}. Mínimo: {numero(s.minimum)}.</Texto>
                  </View>
                </View>
              ))}
            </View>
          </Entrada>
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}

function Metrica({ icono, tono, etiqueta, valor, detalle }: { icono: LucideIcon; tono: Tono; etiqueta: string; valor: string; detalle: string }) {
  return (
    <View style={styles.metrica}>
      <InsigniaIcono icono={icono} tono={tono} tamano={40} />
      <Texto variante="pequeno" style={{ fontFamily: fuente.textoFuerte, color: color.ink }}>{etiqueta}</Texto>
      <Texto style={styles.valor}>{valor}</Texto>
      <Texto variante="pequeno">{detalle}</Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dcebdc' },
  iniciales: { fontFamily: fuente.titulo, fontSize: 16, color: color.greenDark },
  saludo: { marginTop: 18, marginBottom: 6 },
  tituloInicio: { fontSize: 32, lineHeight: 36 },
  principal: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 20, borderRadius: radio.lg, backgroundColor: color.okFondo, borderWidth: 1, borderColor: color.bordeVidrio, boxShadow: sombra.suave },
  mini: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  tiraExterior: { marginHorizontal: -20 },
  tira: { gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  categoria: { width: 108, minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  categoriaNombre: { fontFamily: fuente.textoFuerte, fontSize: 13, lineHeight: 16, color: color.ink, textAlign: 'center' },
  encabezado: { marginBottom: 12, marginTop: 4 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metrica: { flexGrow: 1, flexBasis: '45%', gap: 4, padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  valor: { fontFamily: fuente.titulo, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, color: color.ink, fontVariant: ['tabular-nums'] },
  panel: { gap: 12, padding: 18, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  barras: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140 },
  columna: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  valorBarra: { fontFamily: fuente.textoFuerte, fontSize: 12, lineHeight: 16, color: color.muted, fontVariant: ['tabular-nums'] },
  pista: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barra: { width: '100%', borderRadius: 8 },
  filaSimple: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
