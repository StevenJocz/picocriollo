import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { color } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

/** Vuelve a la pantalla anterior; si no hay (enlace abierto directo), va a `alternativa`. */
export function Volver({ alternativa = '/bienvenida' }: { alternativa?: '/bienvenida' | '/ingreso' }) {
  return (
    <Pulsable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace(alternativa))} style={styles.boton} hitSlop={8}>
      <ChevronLeft size={20} color={color.ink} strokeWidth={1.8} />
      <Texto variante="etiqueta">Volver</Texto>
    </Pulsable>
  );
}

const styles = StyleSheet.create({
  boton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44, gap: 4, paddingRight: 12 },
});
