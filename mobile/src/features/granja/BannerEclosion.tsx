import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame } from 'lucide-react-native';
import { Boton } from '@/components/Boton';
import { Texto } from '@/components/Texto';
import { color, fuente, gradienteVerde, radio, sombra } from '@/theme/tokens';
import { cuentaRegresiva, fechaLarga, type ProximaEclosion } from './calculos';

const par = (n: number) => String(n).padStart(2, '0');

/**
 * Cuenta regresiva a la próxima eclosión (el «banner de oferta» de la referencia, con una urgencia real:
 * los huevos no esperan). Solo se muestra si hay una incubación en curso.
 */
export function BannerEclosion({ proxima }: { proxima: ProximaEclosion }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(reloj);
  }, []);
  const c = cuentaRegresiva(proxima.fecha, ahora);
  const titulo = c.terminada ? '¡Puede eclosionar hoy!' : c.dias <= 2 ? '¡Quedan pocos días!' : 'Próxima eclosión';
  const quien = proxima.gallina ?? proxima.incubacion.equipment ?? 'Incubación';
  const partes: [string, number][] = [['DÍAS', c.dias], ['HRS', c.horas], ['MIN', c.minutos], ['SEG', c.segundos]];

  return (
    <View style={styles.tarjeta} accessibilityRole="summary">
      <View style={styles.superior}>
        <LinearGradient colors={gradienteVerde} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icono}>
          <Flame size={26} color={color.blanco} strokeWidth={1.8} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Texto style={styles.titulo}>{titulo}</Texto>
          <Texto variante="pequeno">{`${quien} · ${proxima.incubacion.eggs} huevos · eclosión aprox. ${fechaLarga(proxima.fecha)}`}</Texto>
        </View>
      </View>
      <View style={styles.reloj} accessibilityRole="timer" accessibilityLabel={`Faltan ${c.dias} días`}>
        {partes.map(([nombre, valor]) => (
          <View key={nombre} style={styles.caja}>
            <Texto style={styles.numero}>{par(valor)}</Texto>
            <Texto style={styles.unidad}>{nombre}</Texto>
          </View>
        ))}
      </View>
      <Boton titulo="Ver incubación" onPress={() => router.push('/incubaciones')} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: 14, padding: 18, borderRadius: radio.md, backgroundColor: '#e6f6ec', borderWidth: 1, borderColor: color.bordeVidrio, boxShadow: sombra.suave },
  superior: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icono: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  titulo: { fontFamily: fuente.titulo, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: color.ink },
  reloj: { flexDirection: 'row', gap: 8 },
  caja: { alignItems: 'center', minWidth: 62, paddingTop: 8, paddingBottom: 6, paddingHorizontal: 6, borderRadius: 14, backgroundColor: '#12261b' },
  numero: { fontFamily: fuente.titulo, fontSize: 22, lineHeight: 26, color: color.blanco, fontVariant: ['tabular-nums'] },
  unidad: { fontFamily: fuente.textoFuerte, fontSize: 12, letterSpacing: 1, color: 'rgba(255, 255, 255, 0.78)' },
});
