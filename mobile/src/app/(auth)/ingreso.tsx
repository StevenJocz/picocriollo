import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Entrada } from '@/components/Entrada';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { Volver } from '@/components/Volver';
import { useSesion } from '@/auth/sesion';

export default function Ingreso() {
  const { ingresar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    if (!correo.trim() || !password) { setError('Escribe tu correo y tu contraseña.'); return; }
    setCargando(true); setError('');
    try {
      await ingresar(correo.trim(), password);
      router.replace('/inicio');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally { setCargando(false); }
  }

  return (
    <Pantalla>
      <Volver />
      <Entrada indice={0} style={styles.tarjeta}>
        <Tarjeta>
          <View style={styles.formulario}>
            <View style={styles.cabecera}>
              <Texto variante="titulo">Inicia sesión</Texto>
              <Texto variante="subtitulo">Accede a tus gallineros y registros guardados de forma privada.</Texto>
            </View>
            <Campo etiqueta="Correo electrónico" value={correo} onChangeText={setCorreo} placeholder="tu@correo.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" maxLength={254} />
            <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secreto autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void enviar()} maxLength={128} />
            <Pulsable accessibilityRole="link" onPress={() => router.push('/olvido')} style={styles.olvido} hitSlop={8}>
              <Texto variante="enlace">¿Olvidaste tu contraseña?</Texto>
            </Pulsable>
            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            <Boton titulo="Entrar a mi granja" onPress={() => void enviar()} cargando={cargando} />
            <Pulsable accessibilityRole="link" onPress={() => router.replace('/registro')} style={styles.cambio}>
              <Texto variante="etiqueta">¿Primera vez? Crear una cuenta</Texto>
            </Pulsable>
          </View>
        </Tarjeta>
      </Entrada>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginTop: 8 },
  formulario: { gap: 16 },
  cabecera: { gap: 6 },
  olvido: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -8 },
  cambio: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
