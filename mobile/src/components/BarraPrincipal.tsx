import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bird, House, Menu, Plus, Store, UserRound } from 'lucide-react-native';
import { ItemBarra } from './ItemBarra';
import { seccionDeRuta } from './navegacion';
import { Pulsable } from './Pulsable';

const accesos = [
  { id: 'inicio', ruta: '/reels', nombre: 'Inicio', icono: House },
  { id: 'granja', ruta: '/granja', nombre: 'Mi granja', icono: Bird },
  { id: 'mercado', ruta: '/mercado', nombre: 'Mercado', icono: Store },
  { id: 'perfil', ruta: '/perfil', nombre: 'Perfil', icono: UserRound },
  { id: 'mas', ruta: '/mas', nombre: 'Más', icono: Menu },
] as const;

/** Vive en el layout autenticado: también está presente en fichas y formularios. */
export function BarraPrincipal() {
  const margen = useSafeAreaInsets().bottom;
  const activa = seccionDeRuta(usePathname());
  return (
    <View pointerEvents="box-none" style={[styles.marco, { bottom: 12 + margen }]}>
      <View style={styles.barra} accessibilityLabel="Menú principal">
        {accesos.map(a => <Fragment key={a.id}>
          <ItemBarra icono={a.icono} etiqueta={a.nombre} isFocused={activa === a.id} onPress={() => router.navigate(a.ruta as never)} />
          {activa === 'inicio' && a.id === 'granja' ? <Pulsable
            accessibilityRole="button"
            accessibilityLabel="Explorar reels"
            onPress={() => router.setParams({ explorar: String(Date.now()) })}
            style={styles.explorar}
            escala={0.9}
          ><Plus size={31} strokeWidth={2.4} color="#fff" /></Pulsable> : null}
        </Fragment>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marco: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  barra: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 6 },
  explorar: { width: 54, height: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#163d27', borderWidth: 2, borderColor: '#62c38b' },
});
