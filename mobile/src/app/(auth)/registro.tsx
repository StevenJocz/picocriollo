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

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Registro() {
  const { registrar } = useSesion();
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; correo?: string; password?: string }>({});
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    const nuevos: typeof errores = {};
    if (nombre.trim().length < 2) nuevos.nombre = 'Escribe un nombre de usuario de al menos 2 caracteres.';
    if (!CORREO.test(correo.trim())) nuevos.correo = 'Escribe un correo válido.';
    if (password.length < 12) nuevos.password = 'La contraseña debe tener 12 caracteres o más.';
    setErrores(nuevos); setError('');
    if (Object.keys(nuevos).length) return;

    setCargando(true);
    try {
      await registrar({ correo: correo.trim(), password, nombreUsuario: nombre.trim(), ciudad });
      router.replace('/inicio');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta.');
    } finally { setCargando(false); }
  }

  return (
    <Pantalla>
      <Volver />
      <Entrada indice={0} style={styles.tarjeta}>
        <Tarjeta>
          <View style={styles.formulario}>
            <View style={styles.cabecera}>
              <Texto variante="titulo">Crea tu cuenta</Texto>
              <Texto variante="subtitulo">Registra tu cuenta para crear y guardar tus propios gallineros.</Texto>
            </View>
            <Campo etiqueta="Nombre de usuario" value={nombre} onChangeText={setNombre} placeholder="Cómo te verán los demás" autoCapitalize="words" autoComplete="nickname" maxLength={40} error={errores.nombre} ayuda="Es público en el mercado y en los chats: 2 a 40 caracteres, sin correos ni enlaces, y debe ser único." />
            <Campo etiqueta="Tu ciudad o municipio (opcional)" value={ciudad} onChangeText={setCiudad} placeholder="Ej.: Medellín" autoCapitalize="words" autoComplete="postal-address-locality" maxLength={60} ayuda="Así te mostramos primero lo que está cerca. Puedes cambiarla después." />
            <Campo etiqueta="Correo electrónico" value={correo} onChangeText={setCorreo} placeholder="tu@correo.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254} error={errores.correo} />
            <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} placeholder="Al menos 12 caracteres" secreto autoComplete="new-password" textContentType="newPassword" maxLength={128} error={errores.password} ayuda="Usa 12 caracteres o más. Se guarda con un hash seguro." onSubmitEditing={() => void enviar()} />
            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            <Boton titulo="Crear cuenta" onPress={() => void enviar()} cargando={cargando} />
            <Pulsable accessibilityRole="link" onPress={() => router.replace('/ingreso')} style={styles.cambio}>
              <Texto variante="etiqueta">¿Ya tienes cuenta? Inicia sesión</Texto>
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
