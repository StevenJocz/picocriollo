import { Denunciar } from '@/features/moderacion/Denunciar';
import { useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Heart, MessageCircle, Play, Share2, Trash2 } from 'lucide-react-native';
import { urlAbsoluta } from '@/api/cliente';
import { Chip } from '@/components/Chip';
import { Confirmar } from '@/components/Confirmar';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { ModalCampo, ir } from '@/features/mercado/componentes';
import { color, fuente, radio, sombra } from '@/theme/tokens';
import { cifra, hace, inicial } from './formato';
import * as s from './servicio';

export function Avatar({ alias, url, tamano = 44 }: { alias: string; url?: string | null; tamano?: number }) {
  const foto = urlAbsoluta(url);
  return (
    <View style={[estilos.avatar, { width: tamano, height: tamano, borderRadius: tamano / 2 }]} accessibilityLabel={`Foto de ${alias}`}>
      {foto ? <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors /> : <Texto style={{ fontFamily: fuente.titulo, fontSize: tamano * 0.42, color: color.greenDark }}>{inicial(alias)}</Texto>}
    </View>
  );
}

function Medios({ medios }: { medios: s.Post['media'] }) {
  const imagenes = medios.filter(m => m.kind === 'image');
  if (!imagenes.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {imagenes.map(m => (
        <Image resizeMode="contain" key={m.id} source={{ uri: urlAbsoluta(m.url) }} accessibilityIgnoresInvertColors accessibilityLabel="Foto de la publicación"
          style={{ width: '100%', aspectRatio: m.width && m.height ? Math.min(Math.max(m.width / m.height, 0.6), 1.8) : 1.2, borderRadius: radio.sm, backgroundColor: color.okFondo }} />
      ))}
    </View>
  );
}

function Video({ video }: { video: NonNullable<s.Post['embed']> }) {
  return (
    <Pulsable accessibilityRole="link" accessibilityLabel={`Ver el video en ${video.label}`} onPress={() => void Linking.openURL(video.url)} style={estilos.video}>
      <View style={estilos.play}><Play size={22} color={color.blanco} fill={color.blanco} /></View>
      <View style={{ flex: 1 }}>
        <Texto variante="etiqueta">Video de {video.label}</Texto>
        <Texto variante="pequeno">Se abre en {video.label}</Texto>
      </View>
    </Pulsable>
  );
}

/** Una publicación del muro o de los reels, con me gusta, comentarios, compartir y, si es tuya, borrar. */
export function TarjetaPost({ post, alCambiar, alBorrar, detalle = false }: { post: s.Post; alCambiar: (p: s.Post) => void; alBorrar?: (id: string) => void; detalle?: boolean }) {
  const [compartiendo, setCompartiendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [fallo, setFallo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function darMeGusta() {
    const nuevo = !post.liked;
    alCambiar({ ...post, liked: nuevo, likes: Math.max(0, post.likes + (nuevo ? 1 : -1)) });
    try { const r = await s.meGusta(post.id, nuevo); alCambiar({ ...post, liked: r.liked, likes: r.likes }); }
    catch { alCambiar(post); }
  }

  async function seguir() {
    try { await s.seguir(post.authorId, true); alCambiar({ ...post, followedByViewer: true, authorFollowers: post.authorFollowers + 1 }); } catch { /* el botón sigue disponible */ }
  }

  async function enviarCompartir() {
    setTrabajando(true);
    setFallo('');
    try { await s.compartir(post.id, texto); setCompartiendo(false); setTexto(''); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo compartir.'); }
    finally { setTrabajando(false); }
  }

  async function borrar() {
    setTrabajando(true);
    try { await s.borrarPost(post.id); setBorrando(false); alBorrar?.(post.id); }
    catch (e) { setBorrando(false); setFallo(e instanceof Error ? e.message : 'No se pudo borrar.'); }
    finally { setTrabajando(false); }
  }

  return (
    <View style={estilos.tarjeta}>
      <View style={estilos.fila}>
        <Pulsable accessibilityRole="link" accessibilityLabel={`Perfil de ${post.authorAlias}`} onPress={() => ir(`/perfil/${post.authorId}`)} style={[estilos.fila, { flex: 1 }]}>
          <Avatar alias={post.authorAlias} url={post.authorAvatarUrl} />
          <View style={{ flex: 1 }}>
            <Texto variante="etiqueta" style={{ fontSize: 15 }} numberOfLines={1}>{post.authorAlias}</Texto>
            <Texto variante="pequeno">{hace(post.createdAt, new Date())}{post.editedAt ? ' · editada' : ''}</Texto>
          </View>
        </Pulsable>
        {!post.mine && !post.followedByViewer ? (
          <Pulsable accessibilityRole="button" accessibilityLabel={`Seguir a ${post.authorAlias}`} onPress={() => void seguir()} style={estilos.seguir}><Texto style={estilos.seguirTexto}>Seguir</Texto></Pulsable>
        ) : null}
      </View>
      {post.hidden ? <Chip texto="La moderación la ocultó: solo tú la ves" tono="aviso" /> : null}
      {post.text ? <Texto variante="cuerpo">{post.text}</Texto> : null}
      {post.shared ? (
        <View style={estilos.original}>
          {post.shared.available ? (
            <>
              <Pulsable accessibilityRole="link" onPress={() => ir(`/perfil/${post.shared!.authorId}`)} style={estilos.fila}>
                <Avatar alias={post.shared.authorAlias ?? '?'} url={post.shared.authorAvatarUrl} tamano={30} />
                <Texto variante="etiqueta" numberOfLines={1}>{post.shared.authorAlias}</Texto>
              </Pulsable>
              {post.shared.text ? <Texto variante="cuerpo">{post.shared.text}</Texto> : null}
              {post.shared.media?.length ? <Medios medios={post.shared.media} /> : null}
              {post.shared.embed ? <Video video={post.shared.embed} /> : null}
            </>
          ) : <Texto variante="subtitulo">La publicación original ya no está disponible.</Texto>}
        </View>
      ) : null}
      <Medios medios={post.media} />
      {post.embed ? <Video video={post.embed} /> : null}
      {fallo && !compartiendo ? <Texto variante="pequeno" style={{ color: color.error }}>{fallo}</Texto> : null}
      <View style={estilos.acciones}>
        <Pulsable accessibilityRole="button" accessibilityState={{ selected: post.liked }} accessibilityLabel={`${post.liked ? 'Quitar me gusta' : 'Me gusta'}. ${post.likes} me gusta`} onPress={() => void darMeGusta()} style={estilos.accion}>
          <Heart size={22} color={post.liked ? color.error : color.ink} fill={post.liked ? color.error : 'transparent'} strokeWidth={1.8} />
          <Texto style={estilos.cifra}>{cifra(post.likes)}</Texto>
        </Pulsable>
        <Pulsable accessibilityRole="button" accessibilityLabel={`Comentarios: ${post.commentCount}`} onPress={() => (detalle ? undefined : ir(`/reels/publicacion/${post.id}`))} style={estilos.accion}>
          <MessageCircle size={22} color={color.ink} strokeWidth={1.8} />
          <Texto style={estilos.cifra}>{cifra(post.commentCount)}</Texto>
        </Pulsable>
        {!post.mine ? (
          <Pulsable accessibilityRole="button" accessibilityLabel="Compartir en mi perfil" onPress={() => { setFallo(''); setCompartiendo(true); }} style={estilos.accion}>
            <Share2 size={22} color={color.ink} strokeWidth={1.8} />
          </Pulsable>
        ) : (
          <Pulsable accessibilityRole="button" accessibilityLabel="Borrar mi publicación" onPress={() => setBorrando(true)} style={estilos.accion}>
            <Trash2 size={22} color={color.muted} strokeWidth={1.8} />
          </Pulsable>
        )}
      </View>
      {!post.mine && <Denunciar tipo="post" id={post.id} />}
      <ModalCampo visible={compartiendo} titulo="Compartir en tu perfil" mensaje="Aparecerá en tu perfil con el nombre de su autor." etiqueta="Tu comentario (opcional)" valor={texto} alCambiar={setTexto} textoConfirmar="Compartir" area cargando={trabajando} error={fallo} alConfirmar={() => void enviarCompartir()} alCancelar={() => setCompartiendo(false)} />
      <Confirmar visible={borrando} titulo="¿Borrar esta publicación?" mensaje="Se borran también sus fotos, me gusta y comentarios. No se puede deshacer." textoConfirmar="Sí, borrar" cargando={trabajando} alConfirmar={() => void borrar()} alCancelar={() => setBorrando(false)} />
    </View>
  );
}

const estilos = StyleSheet.create({
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: color.mint },
  tarjeta: { gap: 12, padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seguir: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radio.pildora, backgroundColor: color.mint },
  seguirTexto: { fontFamily: fuente.textoFuerte, fontSize: 13, color: color.greenDark },
  original: { gap: 8, padding: 12, borderRadius: radio.sm, borderWidth: 1, borderColor: color.linea, backgroundColor: color.fondo },
  video: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radio.sm, backgroundColor: color.okFondo },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.greenDark },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  accion: { minWidth: 56, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  cifra: { fontFamily: fuente.textoFuerte, fontSize: 14, color: color.ink, fontVariant: ['tabular-nums'] },
});
