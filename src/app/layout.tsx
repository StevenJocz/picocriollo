import type { Metadata, Viewport } from 'next';
import './globals.css';
import './mobile-type.css';
import './theme.css';
import './reels.css';
import './modern.css';
import { DialogProvider } from '@/shared/components/dialogs';
import { PrimaryDock } from '@/shared/components/primary-dock';

// viewport-fit=cover permite usar las áreas seguras (muesca y barra inferior) en la barra flotante.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#2c7048' };

export const metadata: Metadata = {
 title: 'Pico Criollo | Gestión de granja',
 description: 'Una forma sencilla y cercana de cuidar tu gallinero.',
 manifest: '/manifest.webmanifest',
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="es"><body><DialogProvider>{children}<PrimaryDock /></DialogProvider></body></html>;
}
