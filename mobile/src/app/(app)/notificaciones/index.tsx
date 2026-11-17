import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, Settings } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Segmentos } from '@/components/Segmentos';
import { Texto } from '@/components/Texto';
import { Cargado, ir } from '@/features/mercado/componentes';
import { useDatos } from '@/features/mercado/servicio';
import { CATEGORIAS, rutaDeAviso } from '@/features/notificaciones/rutas';
import { hace } from '@/features/social/formato';
import * as s from '@/features/social/servicio';
import { color, radio, sombra } from '@/theme/tokens';

export default function Notificaciones() {
  const [estado, setEstado] = useState('todas');
  const { datos, error, cargando, recargar } = useDatos(() => s.notificaciones({ estado, limite: 50 }), [estado]);
  const [fallo, setFallo] = useState('');
  const [ocupada, setOcupada] = useState(false);

  async function abrir(n: s.Notificacion) {
    try { if (!n.readAt) await s.leerNotificaciones([n.id]); } catch { /* abrir no depende de marcar como leída */ }
    router.push(rutaDeAviso(n.link.view, n.link.id) as never);
  }

  async function marcarTodas() {
    setOcupada(true);
    setFallo('');
    try { await s.leerTodas(); await recargar(); } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo marcar.'); } finally { setOcupada(false); }
  }

  const sinLeer = datos?.filter(n => !n.readAt).length ?? 0;

  return (
    <Pantalla>
      <Cabecera titulo="Notificaciones" atras accion={
        <Pulsable accessibilityRole="button" accessibilityLabel="Preferencias de notificaciones" onPress={() => ir('/notificaciones/preferencias')} style={estilos.ajustes}><Settings size={22} color={color.ink} strokeWidth={1.8} /></Pulsable>
      } />
      <Segmentos valor={estado} alCambiar={setEstado} opciones={[{ valor: 'todas', etiqueta: 'Todas' }, { valor: 'no_leidas', etiqueta: 'Sin leer' }, { valor: 'leidas', etiqueta: 'Leídas' }]} />
      {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
      {sinLeer > 0 ? <Boton titulo="Marcar todas como leídas" variante="secundario" cargando={ocupada} onPress={() => void marcarTodas()} /> : null}
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.map((n, i) => (
          <Entrada key={n.id} indice={Math.min(i, 8)}>
            <Pulsable accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.body}`} onPress={() => void abrir(n)} style={[estilos.aviso, !n.readAt && estilos.sinLeer]}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={estilos.fila}>
                  {!n.readAt ? <View style={estilos.punto} accessibilityLabel="Sin leer" /> : null}
                  <Texto variante="etiqueta" style={{ fontSize: 15, flex: 1 }} numberOfLines={2}>{n.title}</Texto>
                </View>
                <Texto variante="subtitulo" numberOfLines={3}>{n.body}</Texto>
                <View style={estilos.fila}>
                  <Chip texto={CATEGORIAS[n.category] ?? n.category} tono={n.critical || n.priority === 'critica' ? 'aviso' : 'neutro'} />
                  <Texto variante="pequeno">{hace(n.createdAt, new Date())}</Texto>
                </View>
              </View>
            </Pulsable>
          </Entrada>
        ))}
        {datos && datos.length === 0 ? <EstadoVacio icono={Bell} titulo={estado === 'no_leidas' ? 'Estás al día' : 'Sin notificaciones'} texto="Aquí llegan los avisos de tus subastas, compras, mensajes, incubaciones y tareas." /> : null}
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  ajustes: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  aviso: { padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  sinLeer: { backgroundColor: color.okFondo, borderColor: color.mint },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.green },
});
