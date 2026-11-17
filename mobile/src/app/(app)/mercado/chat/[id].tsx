import { Denunciar } from '@/features/moderacion/Denunciar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Pantalla } from '@/components/Pantalla';
import { Texto } from '@/components/Texto';
import { Cargado, ir } from '@/features/mercado/componentes';
import { conversacion, enviarMensaje, useDatos } from '@/features/mercado/servicio';
import { color, radio } from '@/theme/tokens';

const hora = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { datos, error, cargando, recargar } = useDatos(() => conversacion(id), [id]);
  const [texto, setTexto] = useState('');
  const [fallo, setFallo] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Sin notificaciones en tiempo real todavía: se consulta cada 8 segundos mientras la pantalla está abierta.
  useEffect(() => { const t = setInterval(() => void recargar(), 8000); return () => clearInterval(t); }, [recargar]);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setFallo('');
    try { await enviarMensaje({ threadId: id, body: texto }); setTexto(''); await recargar(); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo enviar.'); }
    finally { setEnviando(false); }
  }

  return (
    <Pantalla>
      <Cabecera titulo={datos?.counterpart ?? 'Conversación'} atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos ? (
          <>
            <Texto variante="subtitulo">Sobre: {datos.listingName}</Texto>
            <View style={{ gap: 8 }}>
              {datos.messages.map(m => (
                <View key={m.id} style={[estilos.burbuja, m.mine ? estilos.mia : estilos.suya]}>
                  {!m.mine && <Denunciar tipo="message" id={m.id} />}
                  <Texto variante="cuerpo" style={m.mine ? { color: color.blanco } : undefined}>{m.body}</Texto>
                  <Texto variante="pequeno" style={{ color: m.mine ? 'rgba(255,255,255,0.8)' : color.muted }}>{hora(m.createdAt)}</Texto>
                </View>
              ))}
              {datos.messages.length === 0 ? <Texto variante="subtitulo">Todavía no hay mensajes.</Texto> : null}
            </View>
            <Campo etiqueta="Tu mensaje" value={texto} onChangeText={setTexto} area autoCapitalize="sentences" maxLength={1000} ayuda="No compartas teléfono ni correo hasta que la operación esté aceptada." />
            {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
            <Boton titulo="Enviar" cargando={enviando} deshabilitado={!texto.trim()} onPress={() => void enviar()} />
            <Boton titulo="Ver la publicación" variante="secundario" onPress={() => ir(`/mercado/${datos.listingId}`)} />
          </>
        ) : null}
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  burbuja: { maxWidth: '86%', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radio.md },
  mia: { alignSelf: 'flex-end', backgroundColor: color.greenDark },
  suya: { alignSelf: 'flex-start', backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea },
});
