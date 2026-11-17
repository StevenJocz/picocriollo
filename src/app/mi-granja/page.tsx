import type { Metadata } from 'next';
import { AppShell } from '@/features/app-shell/components/app-shell';

export const metadata: Metadata = {
  title: 'Mi granja | Pico Criollo',
  description: 'Administra tus gallineros, aves y registros privados.',
};

export default function MyFarmPage() {
  return <AppShell />;
}
