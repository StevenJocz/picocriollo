import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';

export type Tono = 'verde' | 'dorado' | 'rosa' | 'azul' | 'gris';

// Mismos tonos que el tema web (theme.css .ib-*): el icono lleva el color de tinta del tono y el fondo, un degradado suave.
const tonos: Record<Tono, { tinta: string; a: string; b: string }> = {
  verde: { tinta: '#1f6b3f', a: '#eaf6e6', b: '#cde7c7' },
  dorado: { tinta: '#8a5a14', a: '#fdf2d8', b: '#f3d99a' },
  rosa: { tinta: '#a2453a', a: '#fdeceb', b: '#f6cdc8' },
  azul: { tinta: '#2c6a94', a: '#e8f3fb', b: '#c4def2' },
  gris: { tinta: '#3d5444', a: '#f0f4ef', b: '#dbe4d8' },
};

export function InsigniaIcono({ icono: Icono, tono = 'verde', tamano = 46 }: { icono: LucideIcon; tono?: Tono; tamano?: number }) {
  const t = tonos[tono];
  return (
    <LinearGradient colors={[t.a, t.b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.caja, { width: tamano, height: tamano, borderRadius: tamano * 0.35 }]}>
      <Icono size={tamano * 0.48} color={t.tinta} strokeWidth={1.8} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  caja: { alignItems: 'center', justifyContent: 'center' },
});
