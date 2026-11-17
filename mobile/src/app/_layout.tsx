import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { ProveedorSesion, useSesion } from '@/auth/sesion';
import { color } from '@/theme/tokens';

// El splash nativo se queda hasta tener las fuentes y saber si hay una sesión guardada.
SplashScreen.preventAutoHideAsync();

export default function RaizLayout() {
  const [fuentesListas] = useFonts({ Manrope_700Bold, Manrope_800ExtraBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  return (
    <ProveedorSesion>
      <Navegacion fuentesListas={fuentesListas} />
    </ProveedorSesion>
  );
}

function Navegacion({ fuentesListas }: { fuentesListas: boolean }) {
  const { estado } = useSesion();
  const listo = fuentesListas && estado !== 'cargando';

  useEffect(() => {
    if (listo) SplashScreen.hide();
  }, [listo]);

  if (!listo) return null;
  const autenticado = estado === 'autenticado';

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo }, animation: 'fade' }}>
        <Stack.Protected guard={autenticado}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!autenticado}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* El enlace del correo debe abrir esta pantalla con o sin sesión. */}
        <Stack.Screen name="restablecer" />
      </Stack>
    </>
  );
}
