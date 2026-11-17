import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, MessageCircle, Sprout } from 'lucide-react-native';
import { useSesion } from '@/auth/sesion';
import { color, fuente, radio, sombra } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

/** El acceso al perfil es independiente del mercado, como en la cabecera original. */
export function CabeceraCriador({ compacto = false }: { compacto?: boolean }) {
  const { usuario } = useSesion();
  const nombre = usuario?.nombreUsuario || 'Criador';
  return (
    <View style={[s.fila, compacto && { paddingBottom: 4 }]}>
      <Pulsable style={s.perfil} accessibilityLabel={`Mi perfil: ${nombre}`} accessibilityRole="button" onPress={() => router.navigate('/perfil')}>
        <View style={s.avatar}><Texto style={s.inicial}>{nombre.trim().charAt(0).toUpperCase()}</Texto></View>
        <View style={s.nombre}>
          <View style={s.rol}><Texto variante="pequeno">Criador</Texto><Sprout size={12} color={color.green} /></View>
          <Texto variante="seccion" numberOfLines={1}>{nombre}</Texto>
        </View>
      </Pulsable>
      <Pulsable style={s.accion} accessibilityLabel="Mensajes" accessibilityRole="button" onPress={() => router.push('/mercado/mensajes')}><MessageCircle size={20} color={color.greenDark} /></Pulsable>
      <Pulsable style={s.accion} accessibilityLabel="Notificaciones" accessibilityRole="button" onPress={() => router.push('/notificaciones')}><Bell size={20} color={color.greenDark} /></Pulsable>
    </View>
  );
}
const s = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 20 },
  perfil: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  nombre: { flex: 1, minWidth: 0 }, rol: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { width: 44, height: 44, borderRadius: radio.pildora, backgroundColor: '#dfead9', alignItems: 'center', justifyContent: 'center' },
  inicial: { fontFamily: fuente.titulo, color: color.green, fontSize: 18 },
  accion: { width: 46, height: 46, borderRadius: 18, backgroundColor: color.vidrioFuerte, alignItems: 'center', justifyContent: 'center', boxShadow: sombra.suave },
});
