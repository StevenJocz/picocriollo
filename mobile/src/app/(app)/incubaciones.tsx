import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Flame } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip, type TonoChip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Texto } from '@/components/Texto';
import { DIAS_INCUBACION, diasTranscurridos, fechaEclosion, fechaLarga, hoyTexto } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { color } from '@/theme/tokens';

const tonoDe = (estado: string): TonoChip => (estado === 'En curso' ? 'aviso' : estado === 'Finalizada' ? 'ok' : 'neutro');

export default function Incubaciones() {
  const { granja } = useGranja();
  const hoy = hoyTexto();
  const lista = [...granja.incubations].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <Pantalla>
      <Cabecera titulo="Incubación" atras accion={granja.coops.length ? <BotonNuevo alPulsar={() => router.push('/formulario/incubacion')} /> : undefined} />
      <ContenidoGranja>
        {lista.map((inc, i) => {
          const quien = granja.birds.find(a => a.id === inc.henId)?.name ?? inc.equipment ?? 'Incubación';
          const dia = Math.min(DIAS_INCUBACION, diasTranscurridos(inc.startedAt, hoy));
          return (
            <Entrada key={inc.id} indice={i}>
              <TarjetaFila
                titulo={`${quien} · ${inc.eggs} huevos`}
                detalle={`${inc.type ?? 'Incubación'} · inicio ${fechaLarga(inc.startedAt)} · eclosión aprox. ${fechaLarga(fechaEclosion(inc.startedAt, inc.hatchAdjustmentDays ?? 0))}`}
                derecha={<Chip texto={inc.status} tono={tonoDe(inc.status)} />}
                pie={inc.status === 'En curso' ? (
                  <View style={{ gap: 6 }}>
                    <View style={styles.pista} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: DIAS_INCUBACION, now: dia }}>
                      <View style={[styles.avance, { width: `${(dia / DIAS_INCUBACION) * 100}%` }]} />
                    </View>
                    <Texto variante="pequeno">Día {dia} de {DIAS_INCUBACION}</Texto>
                  </View>
                ) : inc.hatched || inc.removed ? <Texto variante="pequeno">{inc.hatched} nacidos · {inc.removed} retirados</Texto> : undefined}
                alPulsar={() => router.push(`/formulario/incubacion?id=${inc.id}`)}
              />
            </Entrada>
          );
        })}
        {lista.length === 0 ? (
          <EstadoVacio
            icono={Flame}
            tono="dorado"
            titulo={granja.coops.length ? 'Aún no hay incubaciones' : 'Primero, un gallinero'}
            texto={granja.coops.length ? 'Registra una clueca o una incubadora y te mostramos los 21 días y la fecha estimada de eclosión.' : 'La incubación sucede en un espacio de tu granja. Crea el primero.'}
            accion={granja.coops.length ? 'Registrar una incubación' : 'Crear gallinero'}
            alPulsar={() => router.push(granja.coops.length ? '/formulario/incubacion' : '/formulario/gallinero')}
          />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  pista: { height: 8, borderRadius: 4, backgroundColor: '#e3ece6', overflow: 'hidden' },
  avance: { height: '100%', borderRadius: 4, backgroundColor: color.green },
});
