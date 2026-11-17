import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import type { LucideIcon } from 'lucide-react-native';
import { color, curva, fuente, gradienteVerde, radio } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

type Props = TabTriggerSlotProps & { icono: LucideIcon; etiqueta: string };

/** Pestaña de la barra flotante. La activa se ensancha y muestra su nombre; el resto es solo icono. */
export function ItemBarra({ icono: Icono, etiqueta, isFocused = false, href: _href, ref: _ref, ...props }: Props) {
  const reducido = useReducedMotion();
  const crecimiento = useSharedValue(isFocused ? 2.6 : 1);

  useEffect(() => {
    crecimiento.value = withTiming(isFocused ? 2.6 : 1, { duration: reducido ? 0 : 280, easing: curva.hoja });
  }, [isFocused, reducido, crecimiento]);

  const estilo = useAnimatedStyle(() => ({ flexGrow: crecimiento.value }));

  return (
    <Animated.View style={[styles.celda, estilo]}>
      <Pulsable {...props} accessibilityRole="tab" accessibilityLabel={etiqueta} accessibilityState={{ selected: isFocused }} style={styles.pulso} escala={0.92}>
        {isFocused ? (
          <LinearGradient colors={gradienteVerde} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activa}>
            <Icono size={22} color={color.blanco} strokeWidth={1.8} />
            <Texto style={styles.etiqueta} numberOfLines={1}>{etiqueta}</Texto>
          </LinearGradient>
        ) : (
          <View style={styles.inactiva}><Icono size={22} color={color.muted} strokeWidth={1.8} /></View>
        )}
      </Pulsable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  celda: { flexBasis: 0, minWidth: 0 },
  pulso: { height: 54 },
  activa: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: radio.pildora },
  inactiva: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radio.pildora, backgroundColor: color.vidrio, borderWidth: 1, borderColor: color.bordeVidrio },
  etiqueta: { fontFamily: fuente.tituloMedio, fontSize: 11, textTransform: 'uppercase', color: color.blanco },
});
