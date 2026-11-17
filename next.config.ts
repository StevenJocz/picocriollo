import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Permite compilar en una carpeta independiente mientras el servidor local usa `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // El indicador de desarrollo (la «N») se pega sobre la barra inferior móvil al revisar el diseño.
  devIndicators: false,
};

export default nextConfig;

