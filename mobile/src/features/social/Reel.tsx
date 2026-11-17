import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, View, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MessageCircle, Share2, Store, X, Sprout, ChevronRight } from 'lucide-react-native';
import { urlAbsoluta } from '@/api/cliente';
import { Texto } from '@/components/Texto';
import { Pulsable } from '@/components/Pulsable';
import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { ModalCampo, ir } from '@/features/mercado/componentes';
import { Denunciar } from '@/features/moderacion/Denunciar';
import { Avatar } from './componentes';
import { cifra, hace, claveDeReel } from './formato';
import { VideoReel } from './VideoReel';
import { VideoLocal } from './VideoLocal';
import { fotosPublicacion } from '@/features/mercado/fotos';
import * as api from './servicio';

export function Reel({ item, alto, activo, precargar = activo, alCambiar, alEtiqueta }: {
  item: api.ElementoReel; alto: number; activo: boolean; precargar?: boolean;
  alCambiar: (p: api.Post) => void; alEtiqueta: (tag: string) => void;
}) {
  const post = item.post;
  const anuncio = item.listing;
  const original = post?.shared?.available ? post.shared : null;
  const medios = original?.media ?? post?.media ?? [];
  const video = original?.embed ?? post?.embed;
  const videoPropio = medios.find(m => m.kind === 'video');
  const fotos = medios.filter(m => m.kind === 'image').map(m => urlAbsoluta(m.url));
  fotos.push(...fotosPublicacion(anuncio?.snapshot));
  const [ancho, setAncho] = useState(1);
  const [foto, setFoto] = useState(0);
  const [expandido, setExpandido] = useState(false);
  const [comentarios, setComentarios] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const [texto, setTexto] = useState('');
  const [fallo, setFallo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const bloqueo = useRef(false);
  const ultimoToque = useRef(0);
  const corazon = useRef(new Animated.Value(0)).current;
  const alias = post?.authorAlias ?? anuncio?.sellerAlias ?? '';
  const autor = post?.authorId ?? anuncio?.sellerId ?? '';
  const caption = original?.text ?? post?.text ?? anuncio?.snapshot.description ?? '';
  const compacto = alto < 460;
  useEffect(() => {
    if (!activo) return;
    const inicio = Date.now();
    return () => { const ms = Date.now() - inicio; if (ms >= 200) void api.enviarSenales([{ key: claveDeReel(item.kind as 'post' | 'advertisement', item.id), type: 'view', ms }]).catch(() => undefined); };
  }, [activo, item.id, item.kind]);
  async function accion(fn: () => Promise<void>) {
    if (bloqueo.current) return;
    bloqueo.current = true; setOcupado(true); setFallo('');
    try { await fn(); } catch (e) { setFallo(e instanceof Error ? e.message : 'Inténtalo de nuevo.'); }
    finally { bloqueo.current = false; setOcupado(false); }
  }
  function dobleToque() {
    if (!post) return;
    const ahora = Date.now();
    if (ahora - ultimoToque.current > 320) { ultimoToque.current = ahora; return; }
    ultimoToque.current = 0;
    const celebrar = () => {
      corazon.stopAnimation(); corazon.setValue(1);
      Animated.timing(corazon, { toValue: 0, duration: 800, useNativeDriver: true }).start();
    };
    if (post.liked) { celebrar(); return; }
    void accion(async () => { const r = await api.meGusta(post.id, true); alCambiar({ ...post, likes: r.likes, liked: r.liked }); celebrar(); });
  }
  const abrirAnuncio = () => {
    void api.enviarSenales([{ key: claveDeReel('advertisement', item.id), type: 'open' }]).catch(() => undefined);
    ir(`/mercado/${item.id}`);
  };
  return <View style={[s.reel, { height: alto }]} onLayout={e => setAncho(e.nativeEvent.layout.width)}>
    <LinearGradient colors={anuncio ? ['#aa8e45', '#253d29'] : ['#54835d', '#102a1b']} style={StyleSheet.absoluteFill} />
    {!!fotos.length && <Image source={{ uri: fotos[Math.min(foto, fotos.length - 1)] }} resizeMode="cover" blurRadius={24} style={[StyleSheet.absoluteFill, { opacity: .55 }]} accessible={false} />}
    {fotos.length ? <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={StyleSheet.absoluteFill}
      onMomentumScrollEnd={e => setFoto(Math.round(e.nativeEvent.contentOffset.x / ancho))}>
      {fotos.map((uri, i) => <Pressable key={`${uri}-${i}`} onPress={dobleToque} accessible={false}><Image source={{ uri }} resizeMode="contain" style={{ width: ancho, height: alto }} accessibilityLabel={`Foto ${i + 1} de ${fotos.length}`} /></Pressable>)}
    </ScrollView> : !video && !videoPropio ? <View style={s.arte}><Sprout size={56} color="#d5edc9" /><Texto style={s.textoArte} numberOfLines={6}>{anuncio?.snapshot.title ?? anuncio?.snapshot.name ?? caption}</Texto></View> : null}
    {video ? <VideoReel video={video} activo={activo && !comentarios && !compartir && !expandido} precargar={precargar} /> : null}
    {videoPropio && <VideoLocal url={videoPropio.url} portada={videoPropio.thumbUrl} activo={activo && !comentarios && !compartir && !expandido} precargar={precargar} />}
    {(video || videoPropio) && post && <Pressable accessible={false} onPress={dobleToque} style={{ position: 'absolute', top: '20%', left: 0, right: 76, height: '35%' }} />}
    {post && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: '40%', alignSelf: 'center', opacity: corazon, transform: [{ scale: corazon.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }] }}><Heart size={82} fill="#fff" color="#fff" /></Animated.View>}
    <LinearGradient pointerEvents="none" colors={['transparent', '#07100a55', '#07100aef']} locations={[0, .42, 1]} style={[StyleSheet.absoluteFill, { top: '35%' }]} />
    <View style={s.superior} pointerEvents="box-none">
      {anuncio ? <View style={s.publicidad}><Store size={15} color="#172018" /><Texto style={{ color: '#172018', fontSize: 12, fontWeight: '800' }}>Mercado</Texto></View> : <Texto style={s.pildora}>{original ? 'Compartido' : 'Para ti'}</Texto>}
      {fotos.length > 1 && <Texto style={s.pildora}>{foto + 1}/{fotos.length}</Texto>}
    </View>
    <View style={[s.lateral, { height: post ? 260 : 210, marginTop: post ? -130 : -105 }, compacto && { gap: 5 }]}>
      <Pulsable accessibilityRole="link" accessibilityLabel={`Perfil de ${alias}`} onPress={() => ir(`/perfil/${autor}`)}><Avatar alias={alias} url={post?.authorAvatarUrl} tamano={46} /></Pulsable>
      {post && <>
        <Pulsable disabled={ocupado} accessibilityRole="button" accessibilityLabel={`${post.liked ? 'Quitar me gusta' : 'Me gusta'}: ${post.likes}`} onPress={() => void accion(async () => { const r = await api.meGusta(post.id, !post.liked); alCambiar({ ...post, likes: r.likes, liked: r.liked }); })} style={s.accion}>
          <Heart size={30} color={post.liked ? '#ff697c' : '#fff'} fill={post.liked ? '#ff697c' : '#ffffff44'} /><Texto style={s.blanco}>{cifra(post.likes)}</Texto>
        </Pulsable>
        <Pulsable accessibilityRole="button" accessibilityLabel={`Comentarios: ${post.commentCount}`} onPress={() => setComentarios(true)} style={s.accion}><MessageCircle size={30} color="#fff" /><Texto style={s.blanco}>{cifra(post.commentCount)}</Texto></Pulsable>
      </>}
      <Pulsable accessibilityRole="button" accessibilityLabel="Compartir publicación" onPress={() => setCompartir(true)} style={s.accion}><Share2 size={29} color="#fff" /><Texto style={s.mini}>Compartir</Texto></Pulsable>
      {anuncio && <Pulsable accessibilityRole="button" accessibilityLabel="Ver anuncio en el mercado" onPress={abrirAnuncio} style={s.accion}><Store size={30} color="#fff" /><Texto style={s.mini}>Mercado</Texto></Pulsable>}
    </View>
    <View style={[s.contenido, compacto && { left: 14, right: 74, bottom: 12, gap: 4 }]}>
      <View style={s.autor}>
        <Pulsable style={{ flex: 1 }} accessibilityRole="link" onPress={() => ir(`/perfil/${autor}`)}><Texto style={s.nombre} numberOfLines={1}>{alias}</Texto></Pulsable>
        {post && !post.mine && <Pulsable disabled={ocupado} accessibilityRole="button" onPress={() => void accion(async () => { await api.seguir(autor, !post.followedByViewer); alCambiar({ ...post, followedByViewer: !post.followedByViewer, authorFollowers: Math.max(0, post.authorFollowers + (post.followedByViewer ? -1 : 1)) }); })} style={s.seguir}><Texto style={s.mini}>{post.followedByViewer ? 'Siguiendo' : 'Seguir'}</Texto></Pulsable>}
      </View>
      {post && !compacto && <Texto style={s.mini}>{cifra(post.authorFollowers)} seguidores · {hace(post.createdAt, new Date())}</Texto>}
      {original && <Texto style={s.mini}>Original de {original.authorAlias}</Texto>}
      {anuncio && <><Texto numberOfLines={compacto ? 1 : 2} style={[s.nombre, compacto && { fontSize: 14 }]}>{anuncio.snapshot.title || anuncio.snapshot.name}</Texto><Texto numberOfLines={1} style={[s.precio, compacto && { fontSize: 18 }]}>{anuncio.kind === 'interest' ? 'Consultar disponibilidad' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(anuncio.auction?.currentPrice ?? anuncio.price)}</Texto>{!compacto && <Texto numberOfLines={1} style={s.mini}>{anuncio.snapshot.deliveryZone} · {anuncio.snapshot.breed}</Texto>}</>}
      <Texto style={s.blanco} numberOfLines={compacto ? 1 : 2}>{caption.split(/(#[\p{L}\p{N}_]+)/gu).map((parte, i) => <Texto key={i} style={[s.blanco, parte.startsWith('#') && { fontWeight: '800', color: '#cdebc0' }]} onPress={parte.startsWith('#') ? () => alEtiqueta(parte) : undefined}>{parte}</Texto>)}</Texto>
      {!!caption && <Pulsable accessibilityRole="button" accessibilityLabel="Ver descripción completa" onPress={() => setExpandido(true)} style={{ minHeight: 28, justifyContent: 'center' }}><Texto style={s.mini}>Ver más</Texto></Pulsable>}
      {anuncio && <Pulsable accessibilityRole="button" onPress={abrirAnuncio} style={[s.cta, compacto && { padding: 10 }]}><Texto numberOfLines={1} style={{ flex: 1, color: '#17331f', fontWeight: '800', fontSize: compacto ? 12 : 14 }}>{compacto ? 'Ver anuncio y procedencia' : 'Ver procedencia y anuncio'}</Texto><ChevronRight size={18} color="#17331f" /></Pulsable>}
      {fallo && !compartir ? <Texto style={s.blanco}>{fallo}</Texto> : null}
    </View>
    <Modal visible={expandido} transparent animationType="slide" onRequestClose={() => setExpandido(false)}>
      <View style={[s.modal, { justifyContent: 'flex-end' }]}><View style={s.hoja}>
        <Texto variante="seccion">{anuncio?.snapshot.title || alias}</Texto>
        <ScrollView><Texto>{caption}</Texto></ScrollView>
        <Boton titulo="Cerrar descripción" onPress={() => setExpandido(false)} />
      </View></View>
    </Modal>
    <ModalCampo visible={compartir} titulo="Compartir" mensaje={post && !post.mine ? 'Comparte esta publicación en tu perfil con su autor original.' : 'Comparte el enlace de esta publicación.'} etiqueta="Comentario" valor={texto} alCambiar={setTexto} area textoConfirmar="Compartir" cargando={ocupado} error={fallo} alCancelar={() => setCompartir(false)} alConfirmar={() => void accion(async () => {
      if (post && !post.mine) await api.compartir(post.id, texto);
      else await Share.share({ message: `${texto}\n${typeof window !== 'undefined' ? window.location.origin : ''}/${post ? `reels/publicacion/${post.id}` : `mercado/${item.id}`}` });
      setCompartir(false); setTexto('');
    })} />
    {post && comentarios && <Comentarios post={post} cerrar={() => setComentarios(false)} alCambiar={alCambiar} />}
  </View>;
}

function Comentarios({ post, cerrar, alCambiar }: { post: api.Post; cerrar: () => void; alCambiar: (p: api.Post) => void }) {
  const [filas, setFilas] = useState<api.Comentario[]>([]);
  const [siguiente, setSiguiente] = useState<string | undefined>();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [respuesta, setRespuesta] = useState<api.Comentario | null>(null);
  async function cargar(mas = false) {
    try { const r = await api.comentarios(post.id, mas ? siguiente : undefined); setFilas(f => mas ? [...f, ...r.items] : r.items); setSiguiente(r.nextAfter ?? undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los comentarios.'); }
  }
  useEffect(() => { void cargar(); }, [post.id]);
  async function ejecutar(fn: () => Promise<void>) { if (ocupado) return; setOcupado(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Inténtalo otra vez.'); } finally { setOcupado(false); } }
  const fila = (c: api.Comentario, hija = false) => <View key={c.id} style={{ marginLeft: hija ? 24 : 0, gap: 6, paddingVertical: 10 }}>
    <Texto variante="etiqueta">{c.authorAlias}</Texto><Texto>{c.deleted ? 'Comentario eliminado' : c.text}</Texto>
    {!c.deleted && <View style={s.autor}><Pulsable onPress={() => setRespuesta(c)}><Texto variante="enlace">Responder</Texto></Pulsable>{c.canDelete && <Pulsable onPress={() => void ejecutar(async () => { await api.borrarComentario(c.id); await cargar(); alCambiar(await api.post(post.id)); })}><Texto variante="enlace">Borrar</Texto></Pulsable>}{!c.mine && <Denunciar tipo="comment" id={c.id} />}</View>}
    {!hija && c.replies?.map(r => fila(r, true))}
    {!hija && c.repliesTotal > (c.replies?.length ?? 0) && <Pulsable onPress={() => void ejecutar(async () => { const replies = await api.respuestas(c.id); setFilas(f => f.map(row => row.id === c.id ? { ...row, replies } : row)); })}><Texto variante="enlace">Ver respuestas ({c.repliesTotal})</Texto></Pulsable>}
  </View>;
  return <Modal visible transparent animationType="slide" onRequestClose={cerrar}>
    <View style={s.modal}><Pulsable style={{ flex: 1 }} accessibilityLabel="Cerrar comentarios" onPress={cerrar} /><View style={s.hoja}>
      <View style={s.autor}><Texto variante="seccion" style={{ flex: 1 }}>Comentarios ({post.commentCount})</Texto><Pulsable accessibilityLabel="Cerrar comentarios" onPress={cerrar}><X /></Pulsable></View>
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">{filas.map(c => fila(c))}{siguiente && <Boton titulo="Más comentarios" onPress={() => void cargar(true)} />}{filas.length === 0 && <Texto>Sé el primero en comentar.</Texto>}</ScrollView>
      {respuesta && <Pulsable onPress={() => setRespuesta(null)}><Texto>Respondiendo a {respuesta.authorAlias} · Cancelar</Texto></Pulsable>}
      <Campo etiqueta="Tu comentario" value={texto} onChangeText={setTexto} maxLength={1000} />
      {!!error && <Texto>{error}</Texto>}
      <Boton titulo="Enviar" cargando={ocupado} deshabilitado={!texto.trim()} onPress={() => void ejecutar(async () => { await api.comentar(post.id, texto, respuesta?.id); setTexto(''); setRespuesta(null); await cargar(); alCambiar(await api.post(post.id)); })} />
      <Pulsable onPress={() => { cerrar(); ir(`/reels/publicacion/${post.id}`); }}><Texto variante="enlace">Ver publicación y opciones</Texto></Pulsable>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({
  reel: { width: '100%', overflow: 'hidden', borderRadius: 24, backgroundColor: '#102319' },
  arte: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 44, paddingBottom: 150, gap: 18 },
  textoArte: { color: '#fff', fontSize: 25, lineHeight: 34, textAlign: 'center', fontWeight: '800' },
  superior: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  pildora: { color: '#fff', backgroundColor: '#10231899', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: 12 },
  publicidad: { backgroundColor: '#f5d66e', borderRadius: 20, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  lateral: { position: 'absolute', right: 10, top: '50%', justifyContent: 'center', alignItems: 'center', gap: 18, width: 58 },
  accion: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', gap: 4 },
  contenido: { position: 'absolute', left: 18, right: 80, bottom: 26, gap: 8 },
  autor: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nombre: { color: '#fff', fontSize: 17, fontWeight: '800' }, blanco: { color: '#fff', fontSize: 14, lineHeight: 20 },
  mini: { color: '#e6f0e1', fontSize: 11, lineHeight: 16 }, precio: { color: '#ffe69b', fontSize: 22, fontWeight: '800' },
  seguir: { borderWidth: 1, borderColor: '#ffffff88', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  cta: { backgroundColor: '#e7f5dc', borderRadius: 24, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modal: { flex: 1, backgroundColor: '#0008', alignItems: 'center' },
  hoja: { width: '100%', maxWidth: 560, maxHeight: '80%', backgroundColor: '#f4f8f0', padding: 22, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12 },
});
