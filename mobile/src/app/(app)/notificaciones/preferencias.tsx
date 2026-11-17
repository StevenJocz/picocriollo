import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Aviso } from '@/components/Aviso';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Boton } from '@/components/Boton';
import { Pantalla } from '@/components/Pantalla';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { Cargado } from '@/features/mercado/componentes';
import { useDatos } from '@/features/mercado/servicio';
import { activarPush } from '@/features/notificaciones/push';
import * as s from '@/features/social/servicio';
import { color } from '@/theme/tokens';

function Interruptor({ titulo, detalle, valor, alCambiar, deshabilitado }: { titulo: string; detalle?: string; valor: boolean; alCambiar: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <View style={estilos.fila}>
      <View style={{ flex: 1, gap: 2 }}>
        <Texto variante="etiqueta" style={{ fontSize: 15 }}>{titulo}</Texto>
        {detalle ? <Texto variante="pequeno">{detalle}</Texto> : null}
      </View>
      <Switch value={valor} onValueChange={alCambiar} disabled={deshabilitado} accessibilityLabel={titulo} trackColor={{ true: color.green, false: color.linea }} />
    </View>
  );
}

export default function Preferencias() {
  const { datos: p, error, cargando, recargar } = useDatos(s.preferencias);
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [silencio, setSilencio] = useState<{ inicio: string; fin: string } | null>(null);

  async function guardar(cambios: Parameters<typeof s.actualizarPreferencias>[0]) {
    setFallo('');
    setAviso('');
    try { await s.actualizarPreferencias(cambios); await recargar(); } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo guardar.'); }
  }

  async function cambiarPush(activar: boolean) {
    if (activar) {
      const r = await activarPush();
      if (!r.ok) { setFallo(r.motivo); return; }
    }
    await guardar({ channels: { push: activar } });
    if (activar) setAviso('Listo: recibirás avisos en este teléfono.');
  }

  return (
    <Pantalla>
      <Cabecera titulo="Preferencias de avisos" atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={p !== null}>
        {p ? (
          <>
            {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
            {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Por dónde te avisamos</Texto>
                <Interruptor titulo="Dentro de la app" detalle="Siempre activa." valor deshabilitado alCambiar={() => undefined} />
                <Interruptor titulo="En este teléfono" detalle="Avisos push aunque la app esté cerrada. Los urgentes (ventas, entregas, seguridad) siempre llegan." valor={p.channels.push ?? false} alCambiar={v => void cambiarPush(v)} />
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Qué quieres recibir</Texto>
                {Object.entries(p.categoryLabels).map(([clave, nombre]) => (
                  <Interruptor key={clave} titulo={nombre} valor={p.categories[clave] ?? true} alCambiar={v => void guardar({ categories: { [clave]: v } })} />
                ))}
                <Texto variante="pequeno">Los avisos críticos (una venta, una entrega, la seguridad de tu cuenta) se envían aunque apagues su categoría.</Texto>
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Mercado</Texto>
                <Interruptor titulo="Ofertas y solicitudes de compra" valor={p.commercial.offers} alCambiar={v => void guardar({ commercial: { offers: v } })} />
                <Interruptor titulo="Nuevos interesados en tus aves" valor={p.commercial.interests} alCambiar={v => void guardar({ commercial: { interests: v } })} />
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Horas de silencio</Texto>
                <Interruptor titulo="No molestar por la noche" detalle="Los avisos no urgentes quedan en la bandeja y no suenan en el teléfono." valor={p.quietHours.enabled} alCambiar={v => void guardar({ quietHours: { enabled: v, start: p.quietHours.start, end: p.quietHours.end } })} />
                {p.quietHours.enabled ? (
                  <>
                    <Campo etiqueta="Desde (HH:MM)" value={silencio?.inicio ?? p.quietHours.start} onChangeText={t => setSilencio({ inicio: t, fin: silencio?.fin ?? p.quietHours.end })} placeholder="22:00" keyboardType="numbers-and-punctuation" maxLength={5} />
                    <Campo etiqueta="Hasta (HH:MM)" value={silencio?.fin ?? p.quietHours.end} onChangeText={t => setSilencio({ inicio: silencio?.inicio ?? p.quietHours.start, fin: t })} placeholder="06:00" keyboardType="numbers-and-punctuation" maxLength={5} />
                    {silencio ? <Boton titulo="Guardar horario" variante="secundario" onPress={() => void guardar({ quietHours: { enabled: true, start: silencio.inicio, end: silencio.fin } }).then(() => setSilencio(null))} /> : null}
                  </>
                ) : null}
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Recordatorios de tu granja</Texto>
                <Campo etiqueta="Avisar de una eclosión con (días de anticipación)" value={String(p.incubationLeadDays)} onChangeText={t => /^\d{0,2}$/.test(t) && t !== '' && void guardar({ incubationLeadDays: Number(t) })} keyboardType="number-pad" maxLength={2} />
                <Campo etiqueta="Avisar de una tarea con (días de anticipación)" value={String(p.taskLeadDays)} onChangeText={t => /^\d{0,2}$/.test(t) && t !== '' && void guardar({ taskLeadDays: Number(t) })} keyboardType="number-pad" maxLength={2} />
              </View>
            </Tarjeta>
          </>
        ) : null}
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
