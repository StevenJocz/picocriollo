import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, TriangleAlert } from 'lucide-react-native';
import { api } from '@/api/cliente';
import { pedir } from '@/auth/sesion';
import { Aparece } from '@/components/Aparece';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Entrada } from '@/components/Entrada';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { color, radio } from '@/theme/tokens';

type Fase = 'formulario' | 'invalido' | 'listo';

// Destino del enlace del correo: https://…/restablecer?token=… en web y picocriollo://restablecer?token=… en el teléfono.
export default function Restablecer() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [fase, setFase] = useState<Fase>(token ? 'formulario' : 'invalido');
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    if (password.length < 12) { setError('La contraseña debe tener 12 caracteres o más.'); return; }
    if (password !== repetida) { setError('Las dos contraseñas no coinciden.'); return; }
    setCargando(true); setError('');
    try {
      await pedir(() => api.POST('/api/auth/restablecer-password', { body: { token: token ?? '', password } }), 'No se pudo cambiar la contraseña.');
      setPassword(''); setRepetida('');
      setFase('listo');
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.';
      // El servidor dice «enlace» cuando el token venció o ya se usó: no tiene sentido reintentar con el mismo.
      if (/enlace/i.test(mensaje)) setFase('invalido'); else setError(mensaje);
    } finally { setCargando(false); }
  }

  const insignia = (ok: boolean) => (
    <Aparece distancia={0} escala={0.9} duracion={300} style={[styles.insignia, { backgroundColor: ok ? color.okFondo : color.errorFondo }]}>
      {ok ? <CircleCheck size={28} color={color.green} strokeWidth={1.8} /> : <TriangleAlert size={28} color={color.error} strokeWidth={1.8} />}
    </Aparece>
  );

  return (
    <Pantalla>
      <Entrada indice={0} style={styles.tarjeta}>
        <Tarjeta>
          <View style={styles.formulario}>
            {fase === 'formulario' && (
              <>
                <View style={styles.cabecera}>
                  <Texto variante="titulo">Crea tu contraseña</Texto>
                  <Texto variante="subtitulo">Usa 12 caracteres o más. Al guardarla se cerrarán las sesiones abiertas de tu cuenta.</Texto>
                </View>
                <Campo etiqueta="Contraseña nueva" value={password} onChangeText={setPassword} placeholder="Al menos 12 caracteres" secreto autoComplete="new-password" textContentType="newPassword" maxLength={128} />
                <Campo etiqueta="Repítela" value={repetida} onChangeText={setRepetida} placeholder="Escríbela otra vez" secreto autoComplete="new-password" textContentType="newPassword" maxLength={128} onSubmitEditing={() => void enviar()} />
                {error ? <Aviso tipo="error">{error}</Aviso> : null}
                <Boton titulo="Guardar contraseña" onPress={() => void enviar()} cargando={cargando} />
              </>
            )}
            {fase === 'invalido' && (
              <>
                {insignia(false)}
                <View style={styles.cabecera}>
                  <Texto variante="titulo">Este enlace ya no sirve</Texto>
                  <Texto variante="subtitulo">Los enlaces duran 30 minutos y se usan una sola vez. Pide uno nuevo desde «¿Olvidaste tu contraseña?».</Texto>
                </View>
                <Boton titulo="Volver a iniciar sesión" onPress={() => router.replace('/ingreso')} />
              </>
            )}
            {fase === 'listo' && (
              <>
                {insignia(true)}
                <View style={styles.cabecera}>
                  <Texto variante="titulo">¡Listo!</Texto>
                  <Texto variante="subtitulo">Tu contraseña se cambió. Ya puedes entrar con la nueva.</Texto>
                </View>
                <Boton titulo="Entrar a mi granja" onPress={() => router.replace('/ingreso')} />
              </>
            )}
            {fase !== 'listo' && (
              <Pulsable accessibilityRole="link" onPress={() => router.replace('/ingreso')} style={styles.cambio}>
                <Texto variante="etiqueta">Ir a iniciar sesión</Texto>
              </Pulsable>
            )}
          </View>
        </Tarjeta>
      </Entrada>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  tarjeta: { marginTop: 56 },
  formulario: { gap: 16 },
  cabecera: { gap: 6 },
  insignia: { width: 64, height: 64, borderRadius: radio.md, alignItems: 'center', justifyContent: 'center' },
  cambio: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
