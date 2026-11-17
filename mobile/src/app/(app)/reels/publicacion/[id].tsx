import { Denunciar } from '@/features/moderacion/Denunciar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { Cargado, ir } from '@/features/mercado/componentes';
import { Avatar, TarjetaPost } from '@/features/social/componentes';
import { hace } from '@/features/social/formato';
import * as s from '@/features/social/servicio';
import { useDatos } from '@/features/mercado/servicio';
import { color, radio } from '@/theme/tokens';

export default function Publicacion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const publicacion = useDatos(() => s.post(id), [id]);
  const lista = useDatos(() => s.comentarios(id), [id]);
  const [post, setPost] = useState<s.Post | null>(null);
  const [texto, setTexto] = useState('');
  const [respondiendoA, setRespondiendoA] = useState<s.Comentario | null>(null);
  const [abiertas, setAbiertas] = useState<Record<string, s.Comentario[]>>({});
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const actual = post ?? publicacion.datos;

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setFallo('');
    try {
      await s.comentar(id, texto, respondiendoA ? respondiendoA.id : undefined);
      setTexto('');
      if (respondiendoA) setAbiertas(a => { const { [respondiendoA.parentId ?? respondiendoA.id]: _x, ...resto } = a; return resto; });
      setRespondiendoA(null);
      await Promise.all([lista.recargar(), publicacion.recargar()]);
      setPost(null);
    } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo comentar.'); }
    finally { setEnviando(false); }
  }

  async function verRespuestas(c: s.Comentario) {
    try { setAbiertas(a => ({ ...a, [c.id]: [] })); const r = await s.respuestas(c.id); setAbiertas(a => ({ ...a, [c.id]: r })); } catch { setAbiertas(a => { const { [c.id]: _x, ...resto } = a; return resto; }); }
  }

  async function borrar(c: s.Comentario) {
    try { await s.borrarComentario(c.id); await Promise.all([lista.recargar(), publicacion.recargar()]); setAbiertas({}); } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo borrar.'); }
  }

  const Fila = ({ c, respuesta = false }: { c: s.Comentario; respuesta?: boolean }) => (
    <View style={[estilos.comentario, respuesta && { marginLeft: 36 }]}>
      <Avatar alias={c.authorAlias} url={c.authorAvatarUrl} tamano={respuesta ? 28 : 36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Texto variante="etiqueta">{c.authorAlias}{c.replyTo ? ` → ${c.replyTo.alias}` : ''} <Texto variante="pequeno">· {hace(c.createdAt, new Date())}{c.editedAt ? ' · editado' : ''}</Texto></Texto>
        {!c.mine && !c.deleted && <Denunciar tipo="comment" id={c.id} />}
        {c.deleted ? <Texto variante="subtitulo">Comentario eliminado</Texto> : <Texto variante="cuerpo">{c.text}</Texto>}
        {!c.deleted ? (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pulsable accessibilityRole="button" onPress={() => { setRespondiendoA(c); setFallo(''); }} hitSlop={8}><Texto variante="enlace">Responder</Texto></Pulsable>
            {c.canDelete ? <Pulsable accessibilityRole="button" onPress={() => void borrar(c)} hitSlop={8}><Texto variante="enlace" style={{ color: color.error }}>Borrar</Texto></Pulsable> : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Pantalla>
      <Cabecera titulo="Publicación" atras />
      <Cargado cargando={publicacion.cargando} error={publicacion.error} alReintentar={() => void publicacion.recargar()} hayDatos={actual !== null}>
        {actual ? <TarjetaPost post={actual} detalle alCambiar={setPost} alBorrar={() => (router.canGoBack() ? router.back() : ir('/reels'))} /> : null}
        <Texto variante="seccion">Comentarios{lista.datos ? ` (${lista.datos.total})` : ''}</Texto>
        <Cargado cargando={lista.cargando} error={lista.error} alReintentar={() => void lista.recargar()} hayDatos={lista.datos !== null}>
          {lista.datos?.items.map(c => (
            <View key={c.id} style={{ gap: 10 }}>
              <Fila c={c} />
              {(abiertas[c.id] ?? c.replies ?? []).map(r => <Fila key={r.id} c={r} respuesta />)}
              {c.repliesTotal > (abiertas[c.id] ?? c.replies ?? []).length ? (
                <Pulsable accessibilityRole="button" onPress={() => void verRespuestas(c)} style={{ marginLeft: 36 }} hitSlop={8}><Texto variante="enlace">Ver las {c.repliesTotal} respuestas</Texto></Pulsable>
              ) : null}
            </View>
          ))}
          {lista.datos && lista.datos.items.length === 0 ? <Texto variante="subtitulo">Aún no hay comentarios. Escribe el primero.</Texto> : null}
        </Cargado>
        <View style={estilos.caja}>
          {respondiendoA ? (
            <Pulsable accessibilityRole="button" onPress={() => setRespondiendoA(null)}><Texto variante="pequeno">Respondiendo a {respondiendoA.authorAlias} · toca para cancelar</Texto></Pulsable>
          ) : null}
          <Campo etiqueta={respondiendoA ? 'Tu respuesta' : 'Tu comentario'} value={texto} onChangeText={setTexto} area autoCapitalize="sentences" maxLength={1000} />
          {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
          <Boton titulo="Comentar" cargando={enviando} deshabilitado={!texto.trim()} onPress={() => void enviar()} />
        </View>
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  comentario: { flexDirection: 'row', gap: 10 },
  caja: { gap: 10, padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea },
});
