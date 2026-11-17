import { useLocalSearchParams } from 'expo-router';
import { useSesion } from '@/auth/sesion';
import { PerfilVista } from '@/features/social/PerfilVista';

export default function PerfilDeOtro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { usuario } = useSesion();
  return <PerfilVista id={id} propio={usuario?.id === id} />;
}
