import { ScrollView, StyleSheet } from 'react-native';
import { color, fuente, radio } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

export interface Segmento<T extends string> { valor: T; etiqueta: string }

/** Filtros o pestañas internas de una pantalla: una fila de píldoras, la elegida en verde oscuro. */
export function Segmentos<T extends string>({ opciones, valor, alCambiar }: { opciones: Segmento<T>[]; valor: T; alCambiar: (valor: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila} style={styles.exterior} accessibilityRole="tablist">
      {opciones.map(o => {
        const activo = o.valor === valor;
        return (
          <Pulsable key={o.valor} accessibilityRole="tab" accessibilityState={{ selected: activo }} onPress={() => alCambiar(o.valor)} style={[styles.pildora, activo && styles.activa]}>
            <Texto style={[styles.texto, activo && { color: color.blanco }]}>{o.etiqueta}</Texto>
          </Pulsable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  exterior: { marginHorizontal: -20, flexGrow: 0 },
  fila: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  pildora: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: radio.pildora, backgroundColor: color.vidrioFuerte, borderWidth: 1, borderColor: color.linea },
  activa: { backgroundColor: color.greenDark, borderColor: color.greenDark },
  texto: { fontFamily: fuente.textoFuerte, fontSize: 14, color: color.ink },
});
