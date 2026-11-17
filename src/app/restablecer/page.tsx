import type { Metadata } from 'next';
import { ResetPasswordScreen } from '@/features/auth/components/reset-password-screen';

// El token viaja en la URL: sin referrer para que no salga hacia otros sitios, y fuera de los buscadores.
export const metadata: Metadata = { title: 'Nueva contraseña | Pico Criollo', robots: { index: false }, referrer: 'no-referrer' };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetPasswordScreen token={typeof token === 'string' ? token : ''} />;
}
