import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: color.fondo } }} />;
}
