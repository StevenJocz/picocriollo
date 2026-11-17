import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Texto } from '@/components/Texto';
import { color } from '@/theme/tokens';
import { useGranja } from './GranjaProvider';

/** Muestra «cargando» o el error de red antes del contenido; con datos ya cargados, un fallo al refrescar solo se avisa arriba. */
export function ContenidoGranja({ children }: { children: ReactNode }) {
  const { estado, error, recargar } = useGranja();
  if (estado === 'cargando') {
    return (
      <View style={styles.centro} accessibilityRole="progressbar" accessibilityLabel="Cargando tu granja">
        <ActivityIndicator color={color.green} size="large" />
        <Texto variante="subtitulo">Cargando tu granja…</Texto>
      </View>
    );
  }
  if (estado === 'error') {
    return (
      <View style={styles.error}>
        <Aviso tipo="error">{error || 'No se pudo cargar tu granja.'}</Aviso>
        <Boton titulo="Reintentar" onPress={() => void recargar()} />
      </View>
    );
  }
  return (
    <View style={styles.contenido}>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: 'center', gap: 12, paddingVertical: 64 },
  error: { gap: 16, paddingVertical: 24 },
  contenido: { gap: 14 },
});
