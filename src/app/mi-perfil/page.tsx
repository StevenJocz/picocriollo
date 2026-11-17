import type { Metadata } from 'next';
import { MyPublicProfile } from '@/features/profile/components/my-public-profile';

export const metadata: Metadata = { title: 'Mi perfil público | Pico Criollo' };

export default function MyPublicProfilePage() {
  return <MyPublicProfile />;
}
