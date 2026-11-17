import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { curva, tiempo } from '@/theme/tokens';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Lo que sube desde abajo mientras aparece (px). */
  distancia?: number;
  /** Si se indica, parte de esta escala (nunca de 0) hasta 1. */
  escala?: number;
  duracion?: number;
  retraso?: number;
  easing?: typeof curva.salida;
}

/**
 * Un bloque que aparece con opacidad y un pequeño desplazamiento. Se anima solo `opacity` y `transform` con valores
 * animados (no con animaciones de layout, que en web dejan el elemento fuera del flujo mientras dura). El bloque ocupa su
 * lugar desde el primer cuadro. Con movimiento reducido: solo un fundido de 200 ms.
 */
export function Aparece({ children, style, distancia = 8, escala, duracion = tiempo.entrada, retraso = 0, easing = curva.salida }: Props) {
  const reducido = useReducedMotion();
  const avance = useSharedValue(0);

  useEffect(() => {
    avance.value = withDelay(reducido ? 0 : retraso, withTiming(1, { duration: reducido ? tiempo.estado : duracion, easing: reducido ? curva.salida : easing }));
  }, [avance, reducido, retraso, duracion, easing]);

  const estilo = useAnimatedStyle(() => {
    if (reducido) return { opacity: avance.value };
    const transformacion = [{ translateY: (1 - avance.value) * distancia }];
    if (escala !== undefined) transformacion.push({ scale: escala + (1 - escala) * avance.value } as never);
    return { opacity: avance.value, transform: transformacion };
  });

  return <Animated.View style={[style, estilo]}>{children}</Animated.View>;
}
