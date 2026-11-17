import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useSesion } from '@/auth/sesion';
import { CabeceraCriador } from './CabeceraCriador';
import { Fondo } from './Fondo';

/** Pantalla con el fondo pastel, áreas seguras y teclado que no tapa los campos. */
/** `barra`: deja espacio abajo para la barra de pestañas flotante. */
export function Pantalla({ children, desplazable = true, barra = false }: { children: ReactNode; desplazable?: boolean; barra?: boolean }) {
  const { estado } = useSesion();
  const autenticado = estado === 'autenticado';
  return (
    <View style={styles.raiz}>
      <Fondo />
      <SafeAreaView style={styles.segura} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.segura} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {desplazable ? (
            <ScrollView contentContainerStyle={[styles.contenido, (barra || autenticado) && styles.conBarra]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.columna}>{autenticado && <CabeceraCriador />}{children}</View>
            </ScrollView>
          ) : <View style={[styles.contenido, autenticado && styles.conBarra]}><View style={styles.columna}>{autenticado && <CabeceraCriador />}{children}</View></View>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  segura: { flex: 1 },
  contenido: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
  conBarra: { paddingBottom: 112 },
  // En pantallas anchas (web, tablet) el contenido no se estira más de 480 px.
  columna: { width: '100%', maxWidth: 480, flex: 1 },
});
