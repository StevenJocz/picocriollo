import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { color, radio, sombra } from '@/theme/tokens';

/** Superficie de cristal esmerilado sobre el fondo pastel (nunca como adorno suelto). */
export function Tarjeta({ children, style, relleno = 20 }: { children: ReactNode; style?: StyleProp<ViewStyle>; relleno?: number }) {
  return (
    <View style={[styles.caja, style]}>
      <BlurView intensity={36} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[styles.velo, { padding: relleno }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderRadius: radio.lg, overflow: 'hidden', borderWidth: 1, borderColor: color.bordeVidrio, backgroundColor: color.vidrio, boxShadow: sombra.suave },
  velo: { backgroundColor: 'rgba(255, 255, 255, 0.28)' },
});
