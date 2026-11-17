import { urlAbsoluta } from '@/api/cliente';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bird, Star } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Chip } from '@/components/Chip';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { pesos } from '@/features/granja/calculos';
import { color, fuente, radio, sombra } from '@/theme/tokens';

const ESTRELLA = '#d9a21b';
import { TIPO_PUBLICACION, estadoPublicacion, tiempoRestante } from './formato';
import type { Publicacion } from './servicio';

export const ir = (ruta: string) => router.push(ruta as never);

/** «Cargando», el error con «Reintentar» o el contenido. Para las pantallas del mercado, que cargan de la API y no de la granja. */
export function Cargado({ cargando, error, alReintentar, hayDatos, children }: { cargando: boolean; error: string; alReintentar: () => void; hayDatos: boolean; children: ReactNode }) {
  if (cargando && !hayDatos) {
    return (
      <View style={estilos.centro} accessibilityRole="progressbar" accessibilityLabel="Cargando">
        <ActivityIndicator color={color.green} size="large" />
      </View>
    );
  }
  if (error && !hayDatos) {
    return (
      <View style={{ gap: 16, paddingVertical: 24 }}>
        <Aviso tipo="error">{error}</Aviso>
        <Boton titulo="Reintentar" onPress={alReintentar} />
      </View>
    );
  }
  return <View style={{ gap: 14 }}>{error ? <Aviso tipo="error">{error}</Aviso> : null}{children}</View>;
}

/** Una ventana con un campo de texto y un botón: sirve para el motivo de una cancelación, el medio de pago, el importe de una oferta o un mensaje. */
export function ModalCampo({ visible, titulo, mensaje, etiqueta, valor, alCambiar, textoConfirmar, cargando = false, error, area = false, teclado, alConfirmar, alCancelar }: {
  visible: boolean; titulo: string; mensaje?: string; etiqueta: string; valor: string; alCambiar: (v: string) => void; textoConfirmar: string; cargando?: boolean; error?: string;
  area?: boolean; teclado?: 'default' | 'number-pad'; alConfirmar: () => void; alCancelar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={alCancelar}>
      <Pressable accessibilityLabel="Cerrar" style={estilos.fondo} onPress={cargando ? undefined : alCancelar}>
        <Pressable style={estilos.caja} onPress={() => undefined}>
          <Texto variante="seccion">{titulo}</Texto>
          {mensaje ? <Texto variante="subtitulo">{mensaje}</Texto> : null}
          <Campo etiqueta={etiqueta} value={valor} onChangeText={alCambiar} area={area} keyboardType={teclado} autoCapitalize="sentences" />
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <View style={{ gap: 10, marginTop: 6 }}>
            <Boton titulo={textoConfirmar} cargando={cargando} onPress={alConfirmar} />
            <Boton titulo="Cancelar" variante="secundario" deshabilitado={cargando} onPress={alCancelar} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Estrellas del 1 al 5 para valorar, y un comentario opcional. */
export function ModalValoracion({ visible, cargando, error, alEnviar, alCancelar }: { visible: boolean; cargando: boolean; error?: string; alEnviar: (estrellas: number, comentario: string) => void; alCancelar: () => void }) {
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={alCancelar}>
      <Pressable accessibilityLabel="Cerrar" style={estilos.fondo} onPress={cargando ? undefined : alCancelar}>
        <Pressable style={estilos.caja} onPress={() => undefined}>
          <Texto variante="seccion">Valora esta compraventa</Texto>
          <Texto variante="subtitulo">Tu opinión se publica cuando la otra parte también valore o pasen 14 días.</Texto>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map(n => (
              <Pulsable key={n} accessibilityRole="radio" accessibilityLabel={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} accessibilityState={{ selected: estrellas === n }} onPress={() => setEstrellas(n)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Star size={32} color={n <= estrellas ? ESTRELLA : color.linea} fill={n <= estrellas ? ESTRELLA : 'transparent'} strokeWidth={1.6} />
              </Pulsable>
            ))}
          </View>
          <Campo etiqueta="Comentario (opcional)" value={comentario} onChangeText={setComentario} area autoCapitalize="sentences" maxLength={500} />
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <View style={{ gap: 10, marginTop: 6 }}>
            <Boton titulo="Enviar valoración" cargando={cargando} deshabilitado={estrellas === 0} onPress={() => alEnviar(estrellas, comentario)} />
            <Boton titulo="Cancelar" variante="secundario" deshabilitado={cargando} onPress={alCancelar} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Una publicación del mercado: foto (si hay), título, precio o puja actual y quién vende. */
export function TarjetaPublicacion({ p, alPulsar }: { p: Publicacion; alPulsar: () => void }) {
  const f = p.snapshot;
  const titulo = f.title ?? f.name;
  const subasta = p.auction;
  const estado = estadoPublicacion(p.status);
  const detalle = [f.breed, f.sex, f.ageLabel].filter(Boolean).join(' · ');
  return (
    <Pulsable accessibilityRole="button" accessibilityLabel={titulo} onPress={alPulsar} style={estilos.tarjeta}>
      <View style={estilos.foto}>
        {f.photoUrl ? <Image resizeMode="contain" source={{ uri: urlAbsoluta(f.photoUrl) }} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors /> : <Bird size={36} color={color.greenDark} strokeWidth={1.5} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Texto variante="etiqueta" style={{ fontSize: 16, lineHeight: 22 }} numberOfLines={2}>{titulo}</Texto>
        {detalle ? <Texto variante="pequeno" numberOfLines={1}>{detalle}</Texto> : null}
        <Texto style={estilos.precio}>{p.kind === 'interest' ? 'Consultar precio' : pesos(subasta ? subasta.currentPrice : p.price)}</Texto>
        <View style={estilos.chips}>
          <Chip texto={TIPO_PUBLICACION[p.kind] ?? p.kind} />
          {subasta ? <Chip texto={subasta.phase === 'abierta' ? `Cierra en ${tiempoRestante(p.closesAt, new Date())}` : subasta.phase === 'programada' ? 'Programada' : 'Cerrada'} tono={subasta.phase === 'abierta' ? 'aviso' : 'neutro'} /> : null}
          {p.status !== 'publicada' ? <Chip texto={estado.texto} tono={estado.tono} /> : null}
        </View>
        <Texto variante="pequeno" numberOfLines={1}>
          {p.sellerAlias}{p.sellerReputation && p.sellerReputation.count > 0 ? ` · ${p.sellerReputation.average.toFixed(1)} ★ (${p.sellerReputation.count})` : ''}
        </Texto>
      </View>
    </Pulsable>
  );
}

const estilos = StyleSheet.create({
  centro: { alignItems: 'center', paddingVertical: 64 },
  fondo: { flex: 1, backgroundColor: 'rgba(13, 31, 22, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  caja: { width: '100%', maxWidth: 440, gap: 12, padding: 22, borderRadius: radio.lg, backgroundColor: color.blanco, boxShadow: sombra.elevada },
  tarjeta: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  foto: { width: 88, height: 88, borderRadius: radio.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: color.okFondo },
  precio: { fontFamily: fuente.tituloMedio, fontSize: 18, lineHeight: 24, color: color.greenDark, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
