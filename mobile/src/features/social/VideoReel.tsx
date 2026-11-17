import { Linking, View } from 'react-native';
import { Boton } from '@/components/Boton';
import type { Post } from './servicio';
export function VideoReel({ video }: { video: NonNullable<Post['embed']>; activo: boolean; precargar?: boolean }) {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 30 }}><Boton titulo="Ver video en YouTube" onPress={() => void Linking.openURL(video.url)} /></View>;
}
