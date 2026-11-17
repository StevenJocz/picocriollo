import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlarmClock, Check } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Texto } from '@/components/Texto';
import { fechaLarga, hoyTexto, tareaVencida } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { completarTarea } from '@/features/granja/servicio';
import { color, fuente, radio } from '@/theme/tokens';

export default function Agenda() {
  const { granja, recargar } = useGranja();
  const [ocupada, setOcupada] = useState('');
  const [error, setError] = useState('');
  const hoy = hoyTexto();
  const tareas = [...granja.maintenance].sort((a, b) => a.nextDue.localeCompare(b.nextDue));

  async function completar(id: string) {
    setOcupada(id); setError('');
    try {
      await completarTarea(id, hoy);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la tarea.');
    } finally { setOcupada(''); }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Limpieza y mantenimiento" atras accion={granja.coops.length ? <BotonNuevo alPulsar={() => router.push('/formulario/tarea')} /> : undefined} />
      <ContenidoGranja>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {tareas.map((t, i) => {
          const vencida = tareaVencida(t, hoy);
          return (
            <Entrada key={t.id} indice={i}>
              <TarjetaFila
                titulo={t.title}
                detalle={`${granja.coops.find(c => c.id === t.coopId)?.name ?? 'Gallinero'} · cada ${t.frequencyDays} días · próxima ${fechaLarga(t.nextDue)}`}
                derecha={<Chip texto={vencida ? 'Vencida' : t.status} tono={vencida ? 'error' : t.status === 'Completada' ? 'ok' : 'neutro'} />}
                pie={(
                  <View style={styles.pie}>
                    <Pulsable accessibilityRole="button" accessibilityLabel={`Marcar como realizada: ${t.title}`} disabled={ocupada === t.id} onPress={() => void completar(t.id)} style={[styles.hecha, ocupada === t.id && { opacity: 0.6 }]}>
                      <Check size={18} color={color.greenDark} strokeWidth={2} />
                      <Texto style={styles.hechaTexto}>{ocupada === t.id ? 'Guardando…' : 'Marcar como realizada'}</Texto>
                    </Pulsable>
                    {t.lastDone ? <Texto variante="pequeno">Última: {fechaLarga(t.lastDone)}</Texto> : null}
                  </View>
                )}
                alPulsar={() => router.push(`/formulario/tarea?id=${t.id}`)}
              />
            </Entrada>
          );
        })}
        {tareas.length === 0 ? (
          <EstadoVacio
            icono={AlarmClock}
            tono="azul"
            titulo={granja.coops.length ? 'Tu agenda está vacía' : 'Primero, un gallinero'}
            texto={granja.coops.length ? 'Crea tareas con su frecuencia (por ejemplo, limpiar bebederos cada 3 días) y marca cada cumplimiento: la próxima fecha se calcula sola.' : 'Las tareas son de un gallinero. Crea el primero.'}
            accion={granja.coops.length ? 'Crear una tarea' : 'Crear gallinero'}
            alPulsar={() => router.push(granja.coops.length ? '/formulario/tarea' : '/formulario/gallinero')}
          />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  pie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hecha: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radio.pildora, backgroundColor: color.okFondo },
  hechaTexto: { fontFamily: fuente.textoFuerte, fontSize: 13, color: color.greenDark },
});
