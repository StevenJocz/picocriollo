import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { color, radio, sombra } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

/**
 * Una fila de lista: título, detalle y, a la derecha, una etiqueta o un dato.
 * Solo la parte de arriba se pulsa (abre el registro): el pie puede tener sus propios botones sin quedar dentro de otro botón.
 */
export function TarjetaFila({ titulo, detalle, derecha, pie, imagen, alPulsar }: { titulo: string; detalle?: string; derecha?: ReactNode; pie?: ReactNode; imagen?: ReactNode; alPulsar?: () => void }) {
  const superior = (
    <>
      {imagen}
      <View style={styles.textos}>
        <Texto variante="etiqueta" style={styles.titulo} numberOfLines={1}>{titulo}</Texto>
        {detalle ? <Texto variante="pequeno" numberOfLines={3}>{detalle}</Texto> : null}
      </View>
      {derecha}
      {alPulsar ? <ChevronRight size={20} color={color.muted} strokeWidth={1.8} /> : null}
    </>
  );
  return (
    <View style={styles.tarjeta}>
      {alPulsar
        ? <Pulsable accessibilityRole="button" accessibilityLabel={titulo} onPress={alPulsar} style={styles.superior}>{superior}</Pulsable>
        : <View style={styles.superior}>{superior}</View>}
      {pie}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: 10, padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  superior: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 16, lineHeight: 22 },
});
