import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Reel } from './Reel';
import { Boton } from '@/components/Boton';
import { Confirmar } from '@/components/Confirmar';
import { Aviso } from '@/components/Aviso';
import { ir } from '@/features/mercado/componentes';
import { borrarPost, type Post } from './servicio';

export function ReelPerfil({ post, alCambiar, alBorrar }: { post: Post; alCambiar: (p: Post) => void; alBorrar: (id: string) => void }) {
  const { height } = useWindowDimensions();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [reproducir, setReproducir] = useState(false);
  return <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', gap: 8 }}>
    {post.hidden && <Aviso tipo="error">La moderación la ocultó: solo tú la ves.</Aviso>}
    <View style={{ overflow: 'hidden', borderRadius: 24 }}>
      <Reel item={{ id: post.id, kind: 'post', createdAt: post.createdAt, post, listing: null }}
        alto={Math.max(420, Math.min(680, height - 180))} activo={reproducir} alCambiar={alCambiar}
        alEtiqueta={tag => ir(`/reels?etiqueta=${encodeURIComponent(tag)}`)} />
    </View>
    {(post.embed || post.shared?.embed || (post.shared?.media ?? post.media).some(m => m.kind === 'video')) && <Boton titulo={reproducir ? 'Detener video' : 'Reproducir video'} variante="secundario" onPress={() => setReproducir(!reproducir)} />}
    {post.mine && <Boton titulo="Eliminar publicación" variante="secundario" onPress={() => setConfirmar(true)} />}
    {error && <Aviso tipo="error">{error}</Aviso>}
    <Confirmar visible={confirmar} titulo="Eliminar publicación" mensaje="Se eliminará esta publicación de tu perfil y de los reels."
      textoConfirmar="Eliminar" cargando={ocupado} alCancelar={() => setConfirmar(false)} alConfirmar={() => {
        setOcupado(true); void borrarPost(post.id).then(() => alBorrar(post.id)).catch(e => setError(e instanceof Error ? e.message : 'No se pudo eliminar.')).finally(() => { setConfirmar(false); setOcupado(false); });
      }} />
  </View>;
}
