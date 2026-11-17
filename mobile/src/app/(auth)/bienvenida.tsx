import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Sprout } from 'lucide-react-native';
import { Aparece } from '@/components/Aparece';
import { Boton } from '@/components/Boton';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { color, curva, radio, sombra, tiempo } from '@/theme/tokens';

// Momento de autor de la app: el titular entra en tres líneas, la foto sube detrás y el botón cierra la secuencia (una sola vez).
const portada = require('../../../assets/portada.jpg');

export default function Bienvenida() {
  return (
    <Pantalla desplazable={false}>
      <View style={styles.encabezado}>
        <Texto variante="pequeno">Hecho por criadores</Texto>
        <Texto variante="seccion">Pico Criollo</Texto>
      </View>

      <View style={styles.titular}>
        <Aparece distancia={14} duracion={tiempo.secuencia}><Texto variante="hero">Tu</Texto></Aparece>
        <Aparece distancia={14} duracion={tiempo.secuencia} retraso={70}><Texto variante="hero">granja</Texto></Aparece>
        <Aparece distancia={14} duracion={tiempo.secuencia} retraso={140}><Texto variante="hero" style={{ color: color.green }}>criolla</Texto></Aparece>
        <Aparece distancia={10} duracion={400} retraso={200} style={styles.lema}>
          <Sprout size={18} color={color.greenDark} strokeWidth={1.8} />
          <Texto variante="subtitulo" style={{ flex: 1 }}>Registro de aves, trazabilidad y mercado avícola en tu bolsillo</Texto>
        </Aparece>
      </View>

      <Aparece distancia={24} escala={0.96} duracion={640} retraso={120} easing={curva.hoja} style={styles.foto}>
        <Image source={portada} style={styles.imagen} resizeMode="cover" accessibilityIgnoresInvertColors />
      </Aparece>

      <Aparece distancia={10} duracion={400} retraso={280} style={styles.acciones}>
        <Boton titulo="Empezar" icono={<ArrowRight size={20} color={color.blanco} strokeWidth={1.8} />} onPress={() => router.push('/registro')} />
        <View style={styles.cuenta}>
          <Texto variante="cuerpo">¿Ya tienes cuenta? </Texto>
          <Pulsable accessibilityRole="link" onPress={() => router.push('/ingreso')} hitSlop={10} style={styles.enlace}>
            <Texto variante="enlace">Inicia sesión</Texto>
          </Pulsable>
        </View>
      </Aparece>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  encabezado: { gap: 2, paddingTop: 8 },
  titular: { marginTop: 28, gap: 0 },
  lema: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, maxWidth: 280 },
  foto: { flex: 1, minHeight: 160, marginVertical: 12, borderRadius: radio.lg, overflow: 'hidden', boxShadow: sombra.elevada, pointerEvents: 'none' },
  imagen: { width: '100%', height: '100%' },
  acciones: { gap: 14, paddingBottom: 8 },
  cuenta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  enlace: { minHeight: 44, justifyContent: 'center' },
});
