import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { color, fuente, radio, sombra } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

export interface Opcion { valor: string; etiqueta: string }

interface Props {
  etiqueta: string;
  valor: string;
  opciones: Opcion[];
  alCambiar: (valor: string) => void;
  /** Si no es obligatorio, se ofrece «Sin elegir». */
  opcional?: boolean;
  error?: string;
  ayuda?: string;
  vacio?: string;
}

/** Elegir una opción de una lista. Se abre como hoja sobre la pantalla; funciona igual en iOS, Android y web. */
export function Selector({ etiqueta, valor, opciones, alCambiar, opcional = false, error, ayuda, vacio = 'Todavía no hay opciones para elegir.' }: Props) {
  const [abierto, setAbierto] = useState(false);
  const actual = opciones.find(o => o.valor === valor);
  const elegir = (nuevo: string) => { alCambiar(nuevo); setAbierto(false); };

  return (
    <View style={styles.grupo}>
      <Texto variante="etiqueta">{etiqueta}</Texto>
      <Pulsable accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${actual?.etiqueta ?? 'sin elegir'}`} onPress={() => setAbierto(true)} style={[styles.caja, !!error && styles.conError]}>
        <Texto style={[styles.valor, !actual && { color: color.placeholder }]} numberOfLines={1}>{actual?.etiqueta ?? 'Elegir…'}</Texto>
        <ChevronDown size={20} color={color.muted} strokeWidth={1.8} />
      </Pulsable>
      {error ? <Texto accessibilityLiveRegion="polite" variante="pequeno" style={{ color: color.error }}>{error}</Texto> : ayuda ? <Texto variante="pequeno">{ayuda}</Texto> : null}

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable accessibilityLabel="Cerrar" style={styles.fondo} onPress={() => setAbierto(false)}>
          <Pressable style={styles.hoja} onPress={() => undefined}>
            <Texto variante="seccion" style={{ marginBottom: 8 }}>{etiqueta}</Texto>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {opcional ? <Fila texto="Sin elegir" activa={!valor} alPulsar={() => elegir('')} /> : null}
              {opciones.map(o => <Fila key={o.valor} texto={o.etiqueta} activa={o.valor === valor} alPulsar={() => elegir(o.valor)} />)}
              {!opciones.length ? <Texto variante="subtitulo" style={{ paddingVertical: 12 }}>{vacio}</Texto> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Fila({ texto, activa, alPulsar }: { texto: string; activa: boolean; alPulsar: () => void }) {
  return (
    <Pulsable accessibilityRole="button" accessibilityState={{ selected: activa }} onPress={alPulsar} style={[styles.fila, activa && styles.filaActiva]}>
      <Texto style={styles.filaTexto}>{texto}</Texto>
      {activa ? <Check size={20} color={color.green} strokeWidth={2} /> : null}
    </Pulsable>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: 6 },
  caja: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 54, paddingHorizontal: 16, borderRadius: radio.sm, backgroundColor: color.blanco, borderWidth: 1.5, borderColor: color.linea },
  conError: { borderColor: color.error },
  valor: { flex: 1, fontFamily: fuente.texto, fontSize: 16, color: color.ink },
  fondo: { flex: 1, backgroundColor: 'rgba(13, 31, 22, 0.42)', justifyContent: 'flex-end', alignItems: 'center' },
  hoja: { width: '100%', maxWidth: 480, padding: 20, paddingBottom: 28, borderTopLeftRadius: radio.lg, borderTopRightRadius: radio.lg, backgroundColor: color.blanco, boxShadow: sombra.elevada },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 12, borderRadius: radio.sm },
  filaActiva: { backgroundColor: color.okFondo },
  filaTexto: { flex: 1, fontFamily: fuente.textoMedio, fontSize: 16, color: color.ink },
});
