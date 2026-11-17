import { Denunciar } from '@/features/moderacion/Denunciar';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Bell, MapPin, Pencil } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { Cargado, ir } from '@/features/mercado/componentes';
import { useDatos } from '@/features/mercado/servicio';
import { color, fuente, radio } from '@/theme/tokens';
import { Avatar } from './componentes';
import { ReelPerfil } from './ReelPerfil';
import { cifra } from './formato';
import * as s from './servicio';

const REDES: { clave: 'tiktok' | 'instagram' | 'youtube'; nombre: string }[] = [
  { clave: 'tiktok', nombre: 'TikTok' }, { clave: 'instagram', nombre: 'Instagram' }, { clave: 'youtube', nombre: 'YouTube' },
];

/** El perfil de una persona (el mío o el de otro criador): datos, reputación, redes y su muro. */
export function PerfilVista({ id, propio = false }: { id: string; propio?: boolean }) {
  const { datos: p, error, cargando, recargar } = useDatos(() => s.perfil(id), [id]);
  const [posts, setPosts] = useState<s.Post[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [muroCargando, setMuroCargando] = useState(true);
  const [muroError, setMuroError] = useState('');
  const [siguiendo, setSiguiendo] = useState<boolean | null>(null);
  const [seguidores, setSeguidores] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargarMuro = useCallback(async (reiniciar: boolean, antes?: string) => {
    setMuroCargando(true);
    try {
      const pagina = await s.muro(id, antes);
      setPosts(actuales => (reiniciar ? pagina.items : [...actuales, ...pagina.items]));
      setSiguiente(pagina.nextBefore ?? null);
      setMuroError('');
    } catch (e) { setMuroError(e instanceof Error ? e.message : 'No se pudo cargar el muro.'); }
    finally { setMuroCargando(false); }
  }, [id]);

  useEffect(() => { void cargarMuro(true); }, [cargarMuro]);

  async function alternarSeguir() {
    if (!p) return;
    const sigue = siguiendo ?? p.isFollowing;
    setTrabajando(true);
    try { const r = await s.seguir(id, !sigue); setSiguiendo(r.following); setSeguidores(r.followers); }
    catch { /* el botón sigue como estaba */ }
    finally { setTrabajando(false); }
  }

  const sigue = siguiendo ?? p?.isFollowing ?? false;
  const redes = p ? REDES.filter(r => p.social[r.clave]) : [];

  return (
    <Pantalla>
      <Cabecera titulo={propio ? 'Mi perfil' : 'Perfil'} atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={p !== null}>
        {p ? (
          <>
            {!propio && <Denunciar tipo="user" id={id} />}
            <Entrada indice={0}>
              <Tarjeta>
                <View style={{ gap: 14 }}>
                  <View style={estilos.cabecera}>
                    <Avatar alias={p.alias} url={p.avatarUrl} tamano={72} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texto variante="seccion" numberOfLines={2}>{p.alias}</Texto>
                      {p.location ? <View style={estilos.lugar}><MapPin size={14} color={color.muted} /><Texto variante="pequeno">{[p.location.city, p.location.region].filter(Boolean).join(', ')}</Texto></View> : null}
                      <Texto variante="pequeno">{p.reputation.count > 0 ? `${p.reputation.average.toFixed(1)} ★ de ${p.reputation.count} valoraciones` : 'Sin valoraciones todavía'} · {p.reputation.completed} ventas</Texto>
                    </View>
                  </View>
                  <View style={estilos.cifras}>
                    {[['Publicaciones', p.publications], ['Seguidores', seguidores ?? p.followers], ['Siguiendo', p.following]].map(([nombre, valor]) => (
                      <View key={nombre as string} style={estilos.cifra}>
                        <Texto style={estilos.numero}>{cifra(valor as number)}</Texto>
                        <Texto variante="pequeno">{nombre}</Texto>
                      </View>
                    ))}
                  </View>
                  {redes.length ? (
                    <View style={estilos.redes}>
                      {redes.map(r => (
                        <Pulsable key={r.clave} accessibilityRole="link" accessibilityLabel={`${r.nombre} de ${p.alias}`} onPress={() => void Linking.openURL(p.social[r.clave]!)} style={estilos.red}><Texto style={estilos.redTexto}>{r.nombre}</Texto></Pulsable>
                      ))}
                    </View>
                  ) : null}
                  {propio ? (
                    <View style={{ gap: 10 }}>
                      <Boton titulo="Editar mi perfil" variante="secundario" icono={<Pencil size={18} color={color.greenDark} />} onPress={() => ir('/perfil/editar')} />
                      <Boton titulo="Notificaciones" variante="secundario" icono={<Bell size={18} color={color.greenDark} />} onPress={() => ir('/notificaciones')} />
                    </View>
                  ) : (
                    <Boton titulo={sigue ? 'Siguiendo' : 'Seguir'} variante={sigue ? 'secundario' : 'primario'} cargando={trabajando} onPress={() => void alternarSeguir()} />
                  )}
                  {p.listings > 0 ? <Chip texto={`${p.listings} ${p.listings === 1 ? 'aviso' : 'avisos'} en el mercado`} tono="ok" /> : null}
                </View>
              </Tarjeta>
            </Entrada>
            <Texto variante="seccion">Publicaciones</Texto>
            {posts.map((post, i) => (
              <Entrada key={post.id} indice={Math.min(i, 5)}>
                <ReelPerfil post={post} alCambiar={n => setPosts(a => a.map(x => (x.id === n.id ? n : x)))} alBorrar={borrado => { setPosts(a => a.filter(x => x.id !== borrado)); void recargar(); }} />
              </Entrada>
            ))}
            {!muroCargando && posts.length === 0 && !muroError ? (
              <EstadoVacio icono={Pencil} titulo={propio ? 'Aún no publicas nada' : 'Sin publicaciones todavía'} texto={propio ? 'Comparte fotos o videos de tus aves para que otros criadores te conozcan.' : 'Cuando publique algo, lo verás aquí.'} accion={propio ? 'Publicar algo' : undefined} alPulsar={() => ir('/reels/nuevo')} />
            ) : null}
            {muroError ? <Aviso tipo="error">{muroError}</Aviso> : null}
            {siguiente ? <Boton titulo="Ver más" variante="secundario" cargando={muroCargando} onPress={() => void cargarMuro(false, siguiente)} /> : null}
          </>
        ) : null}
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lugar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cifras: { flexDirection: 'row', gap: 8 },
  cifra: { flex: 1, alignItems: 'center', gap: 2, padding: 10, borderRadius: radio.sm, backgroundColor: color.fondo },
  numero: { fontFamily: fuente.titulo, fontSize: 20, lineHeight: 26, color: color.ink, fontVariant: ['tabular-nums'] },
  redes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  red: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radio.pildora, backgroundColor: color.mint },
  redTexto: { fontFamily: fuente.textoFuerte, fontSize: 14, color: color.greenDark },
});
