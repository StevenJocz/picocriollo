import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { color, radio, sombra } from '@/theme/tokens';
import { Boton } from './Boton';
import { Texto } from './Texto';

/** Pregunta antes de una acción que no se puede deshacer. (Sin window.confirm: no existe en los navegadores integrados ni en el teléfono.) */
export function Confirmar({ visible, titulo, mensaje, textoConfirmar, cargando = false, alConfirmar, alCancelar }: {
  visible: boolean; titulo: string; mensaje: string; textoConfirmar: string; cargando?: boolean; alConfirmar: () => void; alCancelar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={alCancelar}>
      <Pressable accessibilityLabel="Cancelar" style={styles.fondo} onPress={cargando ? undefined : alCancelar}>
        <Pressable accessibilityRole="alert" style={styles.caja} onPress={() => undefined}>
          <Texto variante="seccion">{titulo}</Texto>
          <Texto variante="subtitulo">{mensaje}</Texto>
          <View style={styles.botones}>
            <Boton titulo={textoConfirmar} variante="peligro" cargando={cargando} onPress={alConfirmar} />
            <Boton titulo="Cancelar" variante="secundario" deshabilitado={cargando} onPress={alCancelar} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(13, 31, 22, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  caja: { width: '100%', maxWidth: 420, gap: 10, padding: 22, borderRadius: radio.lg, backgroundColor: color.blanco, boxShadow: sombra.elevada },
  botones: { gap: 10, marginTop: 8 },
});
