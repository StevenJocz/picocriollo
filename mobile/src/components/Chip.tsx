import { StyleSheet, View } from 'react-native';
import { color, fuente } from '@/theme/tokens';
import { Texto } from './Texto';

export type TonoChip = 'neutro' | 'ok' | 'aviso' | 'error';

const tonos: Record<TonoChip, { fondo: string; texto: string }> = {
  neutro: { fondo: '#eef2ee', texto: '#3d5444' },
  ok: { fondo: color.okFondo, texto: '#1f6b3f' },
  aviso: { fondo: '#fdf2d8', texto: '#7a4e0f' },
  error: { fondo: color.errorFondo, texto: color.error },
};

/** Etiqueta pequeña de estado. El color acompaña al texto, nunca lo reemplaza. */
export function Chip({ texto, tono = 'neutro' }: { texto: string; tono?: TonoChip }) {
  return (
    <View style={[styles.caja, { backgroundColor: tonos[tono].fondo }]}>
      <Texto style={[styles.texto, { color: tonos[tono].texto }]}>{texto}</Texto>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  texto: { fontFamily: fuente.textoFuerte, fontSize: 12, lineHeight: 16 },
});
