import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { color, fuente, gradienteVerde, radio, sombra } from '@/theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

/** Título de pantalla con «volver» opcional y una acción a la derecha. */
export function Cabecera({ titulo, atras = false, accion }: { titulo: string; atras?: boolean; accion?: ReactNode }) {
  return (
    <View style={styles.fila}>
      {atras ? (
        <Pulsable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inicio'))} style={styles.atras} hitSlop={8}>
          <ChevronLeft size={22} color={color.ink} strokeWidth={1.8} />
        </Pulsable>
      ) : null}
      <Texto variante="titulo" style={styles.titulo} numberOfLines={2}>{titulo}</Texto>
      {accion}
    </View>
  );
}

/** Botón pequeño «+ Nuevo» para la esquina de la cabecera. */
export function BotonNuevo({ titulo = 'Nuevo', alPulsar }: { titulo?: string; alPulsar: () => void }) {
  return (
    <Pulsable accessibilityRole="button" accessibilityLabel={titulo} onPress={alPulsar} style={[styles.nuevo, { boxShadow: sombra.boton }]}>
      <LinearGradient colors={gradienteVerde} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nuevoRelleno}>
        <Plus size={18} color={color.blanco} strokeWidth={2} />
        <Texto style={styles.nuevoTexto}>{titulo}</Texto>
      </LinearGradient>
    </Pulsable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, paddingBottom: 14 },
  atras: { width: 44, height: 44, marginLeft: -8, alignItems: 'center', justifyContent: 'center', borderRadius: radio.pildora },
  titulo: { flex: 1, fontSize: 26, lineHeight: 30 },
  nuevo: { height: 44, borderRadius: radio.pildora },
  nuevoRelleno: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: radio.pildora },
  nuevoTexto: { fontFamily: fuente.tituloMedio, fontSize: 14, color: color.blanco },
});
