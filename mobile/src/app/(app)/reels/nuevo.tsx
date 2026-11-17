import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSesion } from '@/auth/sesion';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Video, X } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import * as s from '@/features/social/servicio';
import { color, radio } from '@/theme/tokens';

import { consultarVideo, guardarPendiente, leerPendiente, subirVideo, type TrabajoVideo } from '@/features/social/subidaVideo';

const MAXIMO_FOTOS = 4;

export default function NuevoReel() {
  const usuarioId = useSesion().usuario?.id ?? '';
  const [texto, setTexto] = useState('');
  const [video, setVideo] = useState('');
  const [fotos, setFotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [archivoVideo, setArchivoVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [trabajo, setTrabajo] = useState<TrabajoVideo | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { void leerPendiente(usuarioId).then(p => { if (p) { setTexto(p.texto); setTrabajo({ jobId: p.jobId, status: 'pending' }); } }); }, [usuarioId]);
  useEffect(() => {
    if (!trabajo || trabajo.status === 'ready' || trabajo.status === 'failed') return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const r = await consultarVideo(trabajo.jobId);
        if (cancelado) return;
        setTrabajo(r); setError(r.error ?? '');
        if (r.status === 'failed') await guardarPendiente(usuarioId, null);
        if (r.status === 'ready' || r.status === 'failed') return;
      } catch (e) { if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo consultar el video.'); }
      if (!cancelado) timer = setTimeout(() => void consultar(), 2500);
    };
    void consultar();
    return () => { cancelado = true; clearTimeout(timer); };
  }, [trabajo?.jobId, trabajo?.status]);

  async function elegirVideo() {
    setError('');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false });
    if (r.canceled) return;
    const v = r.assets[0];
    if (v.duration && v.duration > 50000) { setError('El video debe durar como máximo 50 segundos.'); return; }
    if (v.fileSize && v.fileSize > 80 * 1024 * 1024) { setError('El video admite hasta 80 MB.'); return; }
    setArchivoVideo(v); setFotos([]); setVideo(''); setTrabajo(null);
    await guardarPendiente(usuarioId, null);
  }

  async function elegir() {
    setError('');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAXIMO_FOTOS - fotos.length, quality: 0.8 });
    if (!r.canceled) { setFotos(actuales => [...actuales, ...r.assets].slice(0, MAXIMO_FOTOS)); setArchivoVideo(null); setTrabajo(null); await guardarPendiente(usuarioId, null); }
  }

  async function publicar() {
    setError('');
    if (!texto.trim() && !video.trim() && fotos.length === 0 && !archivoVideo && !trabajo) { setError('Escribe algo o agrega una foto o un enlace de video.'); return; }
    if (video.trim() && (fotos.length || archivoVideo || trabajo)) { setError('Publica un enlace de video o fotos, no ambos.'); return; }
    setEnviando(true);
    try {
      if (archivoVideo && (!trabajo || trabajo.status === 'failed')) {
        const blob = await (await fetch(archivoVideo.uri)).blob();
        const r = await subirVideo(blob.type ? blob : new Blob([blob], { type: archivoVideo.mimeType ?? 'video/mp4' }));
        setTrabajo(r); await guardarPendiente(usuarioId, { jobId: r.jobId, texto }); return;
      }
      if (trabajo && trabajo.status !== 'ready') { setError('Espera a que termine el procesamiento.'); return; }
      const ids: string[] = trabajo?.mediaId ? [trabajo.mediaId] : [];
      for (const foto of fotos) {
        const blob = await (await fetch(foto.uri)).blob();
        ids.push((await s.subirFoto(blob.type ? blob : new Blob([blob], { type: foto.mimeType ?? 'image/jpeg' }), 'post')).id);
      }
      await s.crearPost({ text: texto, mediaIds: ids.length ? ids : undefined, videoUrl: video.trim() || undefined });
      await guardarPendiente(usuarioId, null);
      router.replace('/reels' as never);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo publicar.'); }
    finally { setEnviando(false); }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Nueva publicación" atras />
      <Tarjeta>
        <View style={{ gap: 14 }}>
          <View pointerEvents={enviando || (trabajo && trabajo.status !== 'ready' && trabajo.status !== 'failed') ? 'none' : 'auto'} style={{ gap: 14 }}>
          <Campo etiqueta="¿Qué quieres compartir?" value={texto} onChangeText={setTexto} area autoCapitalize="sentences" maxLength={600} ayuda="Usa #etiquetas para que te encuentren. No publiques teléfonos ni correos." />
          <Campo etiqueta="Enlace de un video de YouTube (opcional)" value={video} onChangeText={setVideo} placeholder="https://youtu.be/…" keyboardType="url" />
          <View style={{ gap: 8 }}>
            <Texto variante="etiqueta">Fotos (hasta {MAXIMO_FOTOS})</Texto>
            <View style={estilos.fotos}>
              {fotos.map((f, i) => (
                <View key={f.uri} style={estilos.foto}>
                  <Image resizeMode="contain" source={{ uri: f.uri }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
                  <Pulsable accessibilityRole="button" accessibilityLabel="Quitar foto" onPress={() => setFotos(actuales => actuales.filter((_, n) => n !== i))} style={estilos.quitar}><X size={16} color={color.blanco} /></Pulsable>
                </View>
              ))}
              {fotos.length < MAXIMO_FOTOS ? (
                <Pulsable accessibilityRole="button" accessibilityLabel="Agregar fotos" onPress={() => void elegir()} style={[estilos.foto, estilos.agregar]}><ImagePlus size={26} color={color.greenDark} strokeWidth={1.6} /></Pulsable>
              ) : null}
            </View>
            <Pulsable accessibilityRole="button" accessibilityLabel="Agregar video" onPress={() => void elegirVideo()} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}><Video size={24} color={color.greenDark} /><Texto variante="etiqueta">Agregar video · máximo 50 segundos</Texto></Pulsable>
            {!!archivoVideo && <Texto>{archivoVideo.fileName ?? 'Video seleccionado'} · {archivoVideo.duration ? `${Math.ceil(archivoVideo.duration / 1000)} s` : 'Se validará la duración'}</Texto>}
            <Texto variante="pequeno">Un video de hasta 80 MB o hasta cuatro fotos. Optimizamos los archivos antes de publicarlos.</Texto>
          </View>
          </View>
          {trabajo && <Texto>{trabajo.status === 'ready' ? 'Video listo. Pulsa Publicar para compartirlo.' : trabajo.status === 'failed' ? 'No se pudo preparar el video.' : 'Procesando video… Puedes volver a esta pantalla para continuar.'}</Texto>}
          {trabajo && <Boton titulo="Descartar video pendiente" variante="secundario" onPress={() => { setTrabajo(null); setArchivoVideo(null); void guardarPendiente(usuarioId, null); }} />}
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Boton titulo={archivoVideo && (!trabajo || trabajo.status === 'failed') ? 'Subir y preparar video' : 'Publicar'} deshabilitado={!!trabajo && (trabajo.status === 'pending' || trabajo.status === 'processing')} cargando={enviando} onPress={() => void publicar()} />
        </View>
      </Tarjeta>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  foto: { width: 88, height: 88, borderRadius: radio.sm, overflow: 'hidden' },
  agregar: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.okFondo, borderWidth: 1.5, borderColor: color.linea, borderStyle: 'dashed' },
  quitar: { position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13, 31, 22, 0.7)' },
});

