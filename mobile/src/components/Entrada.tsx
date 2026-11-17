import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { tiempo } from '@/theme/tokens';
import { Aparece } from './Aparece';

/**
 * Entrada corta de un bloque al abrir una pantalla: 280 ms, 8 px, escalón de 30 ms y como máximo 4 escalones
 * (esta pantalla se abre decenas de veces al día).
 */
export function Entrada({ children, indice = 0, style }: { children: ReactNode; indice?: number; style?: StyleProp<ViewStyle> }) {
  return <Aparece retraso={Math.min(indice, 4) * tiempo.escalon} style={style}>{children}</Aparece>;
}
