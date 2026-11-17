import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Egg } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Texto } from '@/components/Texto';
import { fechaLarga, hoyTexto, resumenGranja } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { color, fuente, radio, sombra } from '@/theme/tokens';

export default function Huevos() {
  const { granja } = useGranja();
  const resumen = resumenGranja(granja, hoyTexto());
  const recolecciones = [...granja.eggs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Pantalla barra>
      <Cabecera titulo="Recolección de huevos" accion={granja.coops.length ? <BotonNuevo alPulsar={() => router.push('/formulario/recoleccion')} /> : undefined} />
      <ContenidoGranja>
        {recolecciones.length > 0 ? (
          <Entrada indice={0}>
            <View style={styles.resumen}>
              {[['Hoy', resumen.huevosHoy], ['Semana', resumen.huevosSemana], ['30 días', resumen.huevosMes]].map(([titulo, valor]) => (
                <View key={titulo} style={styles.dato}>
                  <Texto style={styles.numero}>{valor}</Texto>
                  <Texto variante="pequeno">{titulo}</Texto>
                </View>
              ))}
            </View>
          </Entrada>
        ) : null}
        {recolecciones.map((r, i) => {
          const destinos = [r.incubation && `Incubación ${r.incubation}`, r.consumption && `Consumo ${r.consumption}`, r.sale && `Venta ${r.sale}`].filter(Boolean) as string[];
          const gallinero = granja.coops.find(c => c.id === r.coopId)?.name ?? 'Gallinero';
          const gallina = granja.birds.find(a => a.id === r.henId)?.name;
          return (
            <Entrada key={r.id} indice={i}>
              <TarjetaFila
                titulo={fechaLarga(r.date)}
                detalle={`${gallinero}${gallina ? ` · puso ${gallina}` : ''}`}
                derecha={<Texto style={styles.total}>{r.eggs}</Texto>}
                pie={destinos.length || r.broken || r.dirty ? (
                  <View style={styles.chips}>
                    {destinos.map(d => <Chip key={d} texto={d} tono="ok" />)}
                    {r.broken ? <Chip texto={`Rotos ${r.broken}`} tono="error" /> : null}
                    {r.dirty ? <Chip texto={`Sucios ${r.dirty}`} tono="aviso" /> : null}
                  </View>
                ) : undefined}
                alPulsar={() => router.push(`/formulario/recoleccion?id=${r.id}`)}
              />
            </Entrada>
          );
        })}
        {recolecciones.length === 0 ? (
          <EstadoVacio
            icono={Egg}
            tono="rosa"
            titulo={granja.coops.length ? 'Aún no registras huevos' : 'Primero, un gallinero'}
            texto={granja.coops.length ? 'Anota cada jornada: cuántos huevos salieron y para qué se usan. Con eso se calcula tu postura.' : 'La recolección se registra por gallinero. Crea el primero para empezar.'}
            accion={granja.coops.length ? 'Registrar la primera recolección' : 'Crear gallinero'}
            alPulsar={() => router.push(granja.coops.length ? '/formulario/recoleccion' : '/formulario/gallinero')}
          />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  resumen: { flexDirection: 'row', gap: 10 },
  dato: { flex: 1, alignItems: 'center', gap: 2, padding: 14, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  numero: { fontFamily: fuente.titulo, fontSize: 26, lineHeight: 32, letterSpacing: -0.6, color: color.ink, fontVariant: ['tabular-nums'] },
  total: { fontFamily: fuente.titulo, fontSize: 24, lineHeight: 28, color: color.greenDark, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
