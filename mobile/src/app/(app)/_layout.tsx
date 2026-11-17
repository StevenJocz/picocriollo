import { View } from 'react-native';
import { BarraPrincipal } from '@/components/BarraPrincipal';
import { Stack } from 'expo-router';
import { GranjaProvider } from '@/features/granja/GranjaProvider';
import { useAbrirAvisoPush } from '@/features/notificaciones/push';
import { color } from '@/theme/tokens';

// La granja se carga una vez al entrar con sesión y la comparten todas las pantallas de esta zona.
export default function AppLayout() {
  useAbrirAvisoPush();
  return (
    <GranjaProvider>
      <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: color.fondo } }} />
      <BarraPrincipal />
      </View>
    </GranjaProvider>
  );
}
