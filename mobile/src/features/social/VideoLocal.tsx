import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Volume2, VolumeX } from 'lucide-react-native';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { urlAbsoluta } from '@/api/cliente';
import { mostrarCargaVideo } from './colaPrecarga';

type Props = { url: string; portada?: string | null; activo: boolean; precargar?: boolean };
function Reproductor({ url, portada, activo }: Props) {
  const fuente = urlAbsoluta(url);
  const player = useVideoPlayer(fuente ? { uri: fuente, useCaching: true } : null, p => {
    p.loop = true;
    p.volume = 1;
    p.muted = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [sonido, setSonido] = useState(true);
  const [bloqueoAutoplay, setBloqueoAutoplay] = useState(false);
  const [primerCuadro, setPrimerCuadro] = useState(false);

  const iniciarReproduccion = useCallback(() => {
    player.muted = !sonido;
    player.play();
  }, [player, sonido]);

  const activarSonido = useCallback(() => {
    if (!sonido) return;
    player.muted = false;
    setBloqueoAutoplay(false);
    if (activo) player.play();
  }, [activo, player, sonido]);

  useEffect(() => {
    if (!activo || status !== 'readyToPlay') {
      player.muted = true;
      player.pause();
      return;
    }
    iniciarReproduccion();
    // Safari puede negar autoplay con sonido. En ese caso arrancamos silenciado
    // para no frenar el feed y el siguiente toque del usuario activa el audio.
    const reloj = setTimeout(() => {
      if (!player.playing) {
        player.muted = true;
        setBloqueoAutoplay(true);
        player.play();
      }
    }, 300);
    return () => clearTimeout(reloj);
  }, [activo, iniciarReproduccion, player, status]);

  const sonidoVisible = sonido && !bloqueoAutoplay;

  return <View style={StyleSheet.absoluteFill} onTouchStart={activarSonido}>
    {!!portada && <Image
      source={{ uri: urlAbsoluta(portada) }}
      resizeMode="cover"
      blurRadius={24}
      style={[StyleSheet.absoluteFill, { opacity: .72, transform: [{ scale: 1.08 }] }]}
      accessible={false}
    />}
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
      surfaceType="textureView"
      playsInline
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      onFirstFrameRender={() => setPrimerCuadro(true)}
    />
    {(!primerCuadro || status !== 'readyToPlay') && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {!!portada && <Image source={{ uri: urlAbsoluta(portada) }} resizeMode="contain" style={StyleSheet.absoluteFill} />}
      {status === 'error' ? <Texto style={{ color: '#fff', backgroundColor: '#17331f', padding: 10 }}>No se pudo reproducir el video.</Texto> : mostrarCargaVideo(portada, status) ? <ActivityIndicator color="#fff" /> : null}
    </View>}
    <Pulsable accessibilityRole="button" accessibilityLabel={sonidoVisible ? 'Silenciar video' : 'Activar sonido'} onPress={() => {
      const siguiente = bloqueoAutoplay || !sonido;
      player.muted = !siguiente;
      setSonido(siguiente);
      setBloqueoAutoplay(false);
      if (activo) player.play();
    }} style={{ position: 'absolute', top: 62, left: 14, padding: 12, borderRadius: 24, backgroundColor: '#102318bb' }}>
      {sonidoVisible ? <Volume2 color="#fff" size={22} /> : <VolumeX color="#fff" size={22} />}
    </Pulsable>
  </View>;
}
export function VideoLocal(props: Props) {
  return props.precargar || props.activo ? <Reproductor {...props} /> : props.portada ? <View style={StyleSheet.absoluteFill}>
    <Image source={{ uri: urlAbsoluta(props.portada) }} resizeMode="cover" blurRadius={24} style={[StyleSheet.absoluteFill, { opacity: .72, transform: [{ scale: 1.08 }] }]} accessible={false} />
    <Image source={{ uri: urlAbsoluta(props.portada) }} resizeMode="contain" style={StyleSheet.absoluteFill} />
  </View> : null;
}
