import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api/cliente';
import { pedir } from '@/auth/sesion';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Entrada } from '@/components/Entrada';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { Volver } from '@/components/Volver';

export default function Olvido() {
  const [correo, setCorreo] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    if (!correo.trim()) { setError('Escribe el correo de tu cuenta.'); return; }
    setCargando(true); setError(''); setAviso('');
    try {
      const respuesta = await pedir(() => api.POST('/api/auth/olvido-password', { body: { correo: correo.trim() } }), 'No se pudo enviar el enlace.');
      setAviso(respuesta.mensaje || 'Revisa tu correo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el enlace.');
    } finally { setCargando(false); }
  }

  return (
    <Pantalla>
      <Volver alternativa="/ingreso" />
      <Entrada indice={0} style={styles.tarjeta}>
        <Tarjeta>
          <View style={styles.formulario}>
            <View style={styles.cabecera}>
              <Texto variante="titulo">Recupera tu acceso</Texto>
              <Texto variante="subtitulo">Escribe el correo de tu cuenta y te enviamos un enlace para crear una contraseña nueva.</Texto>
            </View>
            <Campo etiqueta="Correo electrónico" value={correo} onChangeText={setCorreo} placeholder="tu@correo.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="send" onSubmitEditing={() => void enviar()} maxLength={254} />
            {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            <Boton titulo="Enviar enlace" onPress={() => void enviar()} cargando={cargando} />
            <Pulsable accessibilityRole="link" onPress={() => router.replace('/ingreso')} style={styles.cambio}>
              <Texto variante="etiqueta">Volver a iniciar sesión</Texto>
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
  cambio: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
