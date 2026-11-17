import { StyleSheet, View } from 'react-native';
import { CircleCheck, TriangleAlert } from 'lucide-react-native';
import { color, tiempo } from '@/theme/tokens';
import { Aparece } from './Aparece';
import { Texto } from './Texto';

/** Mensaje de resultado. El error usa role=alert (se anuncia al instante); el éxito, una región educada. */
export function Aviso({ tipo, children }: { tipo: 'ok' | 'error'; children: string }) {
  const ok = tipo === 'ok';
  const Icono = ok ? CircleCheck : TriangleAlert;
  return (
    <Aparece distancia={6} duracion={tiempo.estado}>
      <View accessibilityRole={ok ? undefined : 'alert'} accessibilityLiveRegion={ok ? 'polite' : 'assertive'} style={[styles.caja, ok ? styles.ok : styles.error]}>
      <View style={styles.icono}><Icono size={18} color={ok ? color.green : color.error} strokeWidth={1.8} /></View>
      <Texto style={{ flex: 1, color: ok ? color.okTexto : color.error }} variante="cuerpo">{children}</Texto>
    </View>
    </Aparece>
  );
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  ok: { backgroundColor: color.okFondo, borderColor: 'rgba(44, 140, 88, 0.22)' },
  error: { backgroundColor: color.errorFondo, borderColor: 'rgba(162, 69, 58, 0.22)' },
  icono: { paddingTop: 2 },
});
