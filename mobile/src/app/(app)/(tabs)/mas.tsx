import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlarmClock, Bell, Clapperboard, Egg, Flame, Heart, House, LogOut, Receipt, Store, UserRound, type LucideIcon } from 'lucide-react-native';
import { Boton } from '@/components/Boton';
import { Chip } from '@/components/Chip';
import { resumenNotificaciones } from '@/features/social/servicio';
import { useDatos } from '@/features/mercado/servicio';
import { Cabecera } from '@/components/Cabecera';
import { Entrada } from '@/components/Entrada';
import { InsigniaIcono, type Tono } from '@/components/InsigniaIcono';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { useSesion } from '@/auth/sesion';
import { color, radio, sombra } from '@/theme/tokens';

const atajos: { nombre: string; texto: string; icono: LucideIcon; tono: Tono; ruta: string }[] = [
  { nombre: 'Gallineros', texto: 'Espacios, capacidad y estado de tus instalaciones.', icono: House, tono: 'verde', ruta: '/gallineros' },
  { nombre: 'Cluecas e incubación', texto: 'Seguimiento de 21 días con la fecha estimada de eclosión.', icono: Flame, tono: 'dorado', ruta: '/incubaciones' },
  { nombre: 'Notificaciones', texto: 'Tus avisos de subastas, compras, mensajes, incubaciones y tareas.', icono: Bell, tono: 'dorado', ruta: '/notificaciones' },
  { nombre: 'Reels', texto: 'Fotos y videos de otros criadores, y lo tuyo.', icono: Clapperboard, tono: 'rosa', ruta: '/reels' },
  { nombre: 'Mi perfil', texto: 'Tu foto, tus redes, tus seguidores y tus publicaciones.', icono: UserRound, tono: 'azul', ruta: '/perfil' },
  { nombre: 'Árbol genealógico', texto: 'Padres, abuelos y descendencia con las fotos de tus aves.', icono: Heart, tono: 'verde', ruta: '/linaje' },
  { nombre: 'Nacimientos', texto: 'Lotes de pollitos y sus padres conocidos.', icono: Egg, tono: 'verde', ruta: '/nacimientos' },
  { nombre: 'Grupos reproductores', texto: 'Gallo y gallinas de cada cruce, con su historial.', icono: Heart, tono: 'rosa', ruta: '/grupos' },
  { nombre: 'Ventas', texto: 'Vende huevos, pollitos, aves y productos; lotes, clientes, reportes y trazabilidad.', icono: Receipt, tono: 'dorado', ruta: '/ventas' },
  { nombre: 'Limpieza y mantenimiento', texto: 'Tareas con frecuencia y próxima fecha.', icono: AlarmClock, tono: 'azul', ruta: '/agenda' },
];

export default function Mas() {
  const { usuario, salir } = useSesion();
  const { datos: avisos } = useDatos(resumenNotificaciones);
  const [saliendo, setSaliendo] = useState(false);

  return (
    <Pantalla barra>
      <Cabecera titulo="Más" />
      <View style={styles.lista}>
        {[...atajos, ...(['admin', 'moderator'].includes(usuario?.rol ?? '') ? [{ nombre: 'Moderación', texto: 'Denuncias y disputas pendientes de revisión.', icono: UserRound, tono: 'rosa' as Tono, ruta: '/moderacion' }] : [])].map((a, i) => (
          <Entrada key={a.nombre} indice={i}>
            <Pulsable accessibilityRole="button" accessibilityLabel={a.nombre} onPress={() => router.push(a.ruta as never)} style={styles.atajo}>
              <InsigniaIcono icono={a.icono} tono={a.tono} />
              <View style={{ flex: 1, gap: 2 }}>
                <Texto variante="etiqueta" style={{ fontSize: 16, lineHeight: 22 }}>{a.nombre}</Texto>
                <Texto variante="pequeno">{a.texto}</Texto>
                {a.nombre === 'Notificaciones' && avisos && avisos.unread + avisos.unreadMessages > 0 ? <Chip texto={`${avisos.unread + avisos.unreadMessages} sin leer`} tono="aviso" /> : null}
              </View>
            </Pulsable>
          </Entrada>
        ))}
        <Entrada indice={6}>
          <Pulsable accessibilityRole="button" accessibilityLabel="Mercado avícola" onPress={() => router.push('/mercado' as never)} style={styles.atajo}>
            <InsigniaIcono icono={Store} tono="rosa" />
            <View style={{ flex: 1, gap: 2 }}>
              <Texto variante="etiqueta" style={{ fontSize: 16, lineHeight: 22 }}>Mercado avícola</Texto>
              <Texto variante="pequeno">Publica tus aves, ofertas en subastas, compras, mensajes y facturas.</Texto>
            </View>
          </Pulsable>
        </Entrada>
        <Entrada indice={7}>
          <Tarjeta>
            <View style={{ gap: 14 }}>
              <Texto variante="seccion">Tu cuenta</Texto>
              <View style={{ gap: 2 }}>
                <Texto variante="cuerpo">{usuario?.nombreUsuario ?? 'Criador'}</Texto>
                <Texto variante="pequeno">{usuario?.correo}</Texto>
              </View>
              <Boton titulo="Cerrar sesión" variante="secundario" icono={<LogOut size={20} color={color.greenDark} strokeWidth={1.8} />} cargando={saliendo} onPress={async () => { setSaliendo(true); await salir(); }} />
            </View>
          </Tarjeta>
        </Entrada>
      </View>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  lista: { gap: 12 },
  atajo: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
});
