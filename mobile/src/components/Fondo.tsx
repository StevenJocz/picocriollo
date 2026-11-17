import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { color, curva } from '@/theme/tokens';

const manchas = [
  { id: 'menta', cx: 14, cy: 8, r: 46, tono: color.mint, opacidad: 0.85 },
  { id: 'cielo', cx: 92, cy: 12, r: 40, tono: color.sky, opacidad: 0.8 },
  { id: 'lila', cx: 76, cy: 92, r: 46, tono: color.lilac, opacidad: 0.75 },
  { id: 'durazno', cx: 4, cy: 86, r: 36, tono: color.peach, opacidad: 0.75 },
] as const;

/**
 * Fondo pastel: manchas de menta, cielo, lila y durazno. Es el único movimiento ambiental de la app:
 * deriva muy despacio y se queda quieto si la persona pidió reducir el movimiento.
 */
export function Fondo() {
  const reducido = useReducedMotion();
  const avance = useSharedValue(0);

  useEffect(() => {
    if (reducido) return;
    avance.value = withRepeat(withTiming(1, { duration: 26000, easing: curva.enPantalla }), -1, true);
  }, [reducido, avance]);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: -10 + avance.value * 20 }, { translateY: -6 + avance.value * 12 }, { scale: 1 + avance.value * 0.06 }],
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.fondo, overflow: 'hidden' }]}>
      <Animated.View style={[styles.capa, estilo]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <Defs>
            {manchas.map(m => (
              <RadialGradient key={m.id} id={m.id} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m.tono} stopOpacity={m.opacidad} />
                <Stop offset="1" stopColor={m.tono} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {manchas.map(m => <Circle key={m.id} cx={m.cx} cy={m.cy} r={m.r} fill={`url(#${m.id})`} />)}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  capa: { position: 'absolute', left: '-10%', top: '-10%', width: '120%', height: '120%' },
});
