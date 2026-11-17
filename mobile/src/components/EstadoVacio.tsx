import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Boton } from './Boton';
import { InsigniaIcono, type Tono } from './InsigniaIcono';
import { Texto } from './Texto';

/** Cuando una lista todavía no tiene nada: dice qué va aquí y ofrece el primer paso. */
export function EstadoVacio({ icono, titulo, texto, accion, alPulsar, tono = 'verde' }: { icono: LucideIcon; titulo: string; texto: string; accion?: string; alPulsar?: () => void; tono?: Tono }) {
  return (
    <View style={styles.caja}>
      <InsigniaIcono icono={icono} tono={tono} tamano={64} />
      <Texto variante="seccion" style={styles.centro}>{titulo}</Texto>
      <Texto variante="subtitulo" style={styles.centro}>{texto}</Texto>
      {accion && alPulsar ? <View style={styles.boton}><Boton titulo={accion} onPress={alPulsar} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 12 },
  centro: { textAlign: 'center' },
  boton: { alignSelf: 'stretch', marginTop: 8 },
});
