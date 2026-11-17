import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { color, fuente, gradienteVerde, radio, sombra } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

interface Props {
  titulo: string;
  onPress?: () => void;
  variante?: 'primario' | 'secundario' | 'peligro';
  cargando?: boolean;
  deshabilitado?: boolean;
  icono?: ReactNode;
}

/** Botón en píldora. El primario lleva el degradado verde; ambos tienen 54 px de alto (objetivo táctil cómodo). */
export function Boton({ titulo, onPress, variante = 'primario', cargando = false, deshabilitado = false, icono }: Props) {
  const inactivo = deshabilitado || cargando;
  const primario = variante === 'primario';
  const peligro = variante === 'peligro';
  const contenido = (
    <View style={styles.fila}>
      {cargando ? <ActivityIndicator color={primario || peligro ? color.blanco : color.greenDark} /> : null}
      <Texto style={[styles.texto, { color: primario || peligro ? color.blanco : color.greenDark }]}>{cargando ? 'Un momento…' : titulo}</Texto>
      {!cargando && icono ? icono : null}
    </View>
  );
  return (
    <Pulsable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={onPress}
      style={[styles.base, primario ? { boxShadow: sombra.boton } : peligro ? styles.peligro : styles.secundario, inactivo && { opacity: 0.6 }]}
    >
      {primario ? <LinearGradient colors={gradienteVerde} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.relleno}>{contenido}</LinearGradient> : <View style={styles.relleno}>{contenido}</View>}
    </Pulsable>
  );
}

const styles = StyleSheet.create({
  base: { height: 54, borderRadius: radio.pildora, overflow: 'visible' },
  relleno: { flex: 1, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  secundario: { backgroundColor: color.vidrioFuerte, borderWidth: 1, borderColor: color.linea },
  peligro: { backgroundColor: color.error },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  texto: { fontFamily: fuente.tituloMedio, fontSize: 16, lineHeight: 22 },
});
