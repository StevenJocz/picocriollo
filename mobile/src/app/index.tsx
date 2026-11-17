import { Redirect } from 'expo-router';
import { useSesion } from '@/auth/sesion';

export default function Raiz() {
  const { estado } = useSesion();
  return <Redirect href={estado === 'autenticado' ? '/inicio' : '/bienvenida'} />;
}
