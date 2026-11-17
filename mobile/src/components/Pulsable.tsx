import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { curva, tiempo } from '@/theme/tokens';

const PulsableAnimado = Animated.createAnimatedComponent(Pressable);

/** Todo lo pulsable baja a scale(.97) al presionar (160 ms, salida fuerte). Con movimiento reducido solo cambia la opacidad. */
export function Pulsable({ style, disabled, children, escala = 0.97, ...props }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; escala?: number }) {
  const reducido = useReducedMotion();
  const valor = useSharedValue(1);
  const estilo = useAnimatedStyle(() => (reducido ? { opacity: 1 - (1 - valor.value) * 5 } : { transform: [{ scale: valor.value }] }));
  const mover = (a: number) => { valor.value = withTiming(a, { duration: tiempo.pulsar, easing: curva.salida }); };

  return (
    <PulsableAnimado
      {...props}
      disabled={disabled}
      onPressIn={e => { mover(escala); props.onPressIn?.(e); }}
      onPressOut={e => { mover(1); props.onPressOut?.(e); }}
      style={[style, estilo]}
    >
      {children}
    </PulsableAnimado>
  );
}
