import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Boxes } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { Selector } from '@/components/Selector';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import * as s from '@/features/granja/servicio';
import { ModalCampo } from '@/features/mercado/componentes';
import { pendientesPorAsignar } from '@/features/ventas/calculos';

const FERTILIDAD = ['Pendiente', 'Confirmada', 'No confirmada', 'No fértil'];

export default function Lotes() {
  const { granja, recargar } = useGranja();
  const [vista, setVista] = useState<'huevos' | 'pollitos'>('huevos');
  const [recoleccion, setRecoleccion] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [raza, setRaza] = useState('');
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [dividiendo, setDividiendo] = useState<string | null>(null);
  const [parte, setParte] = useState('');

  const pendientes = pendientesPorAsignar(granja);
  const elegido = pendientes.find(p => `${p.recoleccionId}|${p.destino}` === recoleccion);

  async function hacer(trabajo: () => Promise<unknown>, mensaje: string) {
    setTrabajando(true);
    setFallo('');
    setAviso('');
    try { await trabajo(); await recargar(); setAviso(mensaje); return true; }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo completar.'); return false; }
    finally { setTrabajando(false); }
  }

  const huevos = [...granja.fertileLots].sort((a, b) => b.date.localeCompare(a.date));
  const pollitos = granja.chickLots;

  return (
    <Pantalla>
      <Cabecera titulo="Lotes" atras />
      <ContenidoGranja>
        <Segmentos valor={vista} alCambiar={setVista} opciones={[{ valor: 'huevos', etiqueta: 'Huevos' }, { valor: 'pollitos', etiqueta: 'Pollitos' }]} />
        {fallo && dividiendo === null ? <Aviso tipo="error">{fallo}</Aviso> : null}
        {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}

        {vista === 'huevos' ? (
          <>
            {pendientes.length > 0 ? (
              <Tarjeta>
                <View style={{ gap: 12 }}>
                  <Texto variante="seccion">Crear un lote de huevos</Texto>
                  <Texto variante="subtitulo">Los huevos de una recolección se reúnen en lotes para poder venderlos, consumirlos o incubarlos con su procedencia.</Texto>
                  <Selector etiqueta="Recolección y destino" valor={recoleccion} alCambiar={setRecoleccion} opciones={pendientes.map(p => ({ valor: `${p.recoleccionId}|${p.destino}`, etiqueta: `${p.etiqueta} (${p.pendiente} sin lote)` }))} />
                  <Campo etiqueta="Cantidad de huevos" value={cantidad} onChangeText={t => setCantidad(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} ayuda={elegido ? `Hasta ${elegido.pendiente}.` : undefined} />
                  <Campo etiqueta="Raza o cruce (opcional)" value={raza} onChangeText={setRaza} autoCapitalize="words" maxLength={60} />
                  <Boton titulo="Crear lote" cargando={trabajando} deshabilitado={!elegido || !cantidad} onPress={() => elegido && void hacer(() => s.crearLoteHuevos({ collectionId: elegido.recoleccionId, quantity: Number(cantidad), breed: raza, destination: elegido.destino }), 'Lote creado; la fertilidad queda pendiente.').then(ok => { if (ok) { setCantidad(''); setRaza(''); setRecoleccion(''); } })} />
                </View>
              </Tarjeta>
            ) : null}
            {huevos.map((l, i) => (
              <Entrada key={l.id} indice={Math.min(i, 8)}>
                <Tarjeta>
                  <View style={{ gap: 10 }}>
                    <View style={estilos.cabecera}>
                      <Texto variante="etiqueta" style={{ fontSize: 16, flex: 1 }}>{l.code}</Texto>
                      <Chip texto={l.productType ?? 'Huevo fértil'} />
                    </View>
                    <Texto variante="subtitulo">{l.breed} · {fechaLarga(l.date)} · destino {String(l.sourceDestination ?? 'Venta').toLowerCase()}</Texto>
                    <View style={estilos.chips}>
                      <Chip texto={`${l.available} disponibles`} tono={l.available > 0 ? 'ok' : 'neutro'} />
                      <Chip texto={`${l.sold} vendidos`} />
                      {l.incubated > 0 ? <Chip texto={`${l.incubated} incubados`} /> : null}
                    </View>
                    <Selector etiqueta="Fertilidad" valor={l.fertility} alCambiar={f => void hacer(() => s.actualizarLote(l.id, f, l.storageNotes ?? ''), 'Fertilidad actualizada.')} opciones={FERTILIDAD.map(f => ({ valor: f, etiqueta: f }))} />
                    {l.available > 1 ? <Boton titulo="Dividir en un sublote" variante="secundario" onPress={() => { setParte(''); setFallo(''); setDividiendo(l.id); }} /> : null}
                  </View>
                </Tarjeta>
              </Entrada>
            ))}
            {huevos.length === 0 && pendientes.length === 0 ? <EstadoVacio icono={Boxes} titulo="Aún no hay lotes de huevos" texto="Registra una recolección y marca cuántos huevos son para venta, consumo o incubación: aquí podrás convertirlos en lotes." /> : null}
          </>
        ) : (
          <>
            {pollitos.map((l, i) => (
              <Entrada key={l.id} indice={Math.min(i, 8)}>
                <Tarjeta>
                  <View style={{ gap: 8 }}>
                    <Texto variante="etiqueta" style={{ fontSize: 16 }}>{l.code}</Texto>
                    <Texto variante="subtitulo">{l.breed}{granja.births.find(n => n.id === l.birthId) ? ` · nacieron el ${fechaLarga(granja.births.find(n => n.id === l.birthId)!.date)}` : ''}</Texto>
                    <View style={estilos.chips}><Chip texto={`${l.available} disponibles`} tono={l.available > 0 ? 'ok' : 'neutro'} /><Chip texto={`${l.sold} vendidos`} /><Chip texto={`${l.initial} iniciales`} /></View>
                  </View>
                </Tarjeta>
              </Entrada>
            ))}
            {pollitos.length === 0 ? <EstadoVacio icono={Boxes} titulo="Aún no hay lotes de pollitos" texto="Cuando registres un nacimiento, se crea solo el lote de pollitos con su cantidad disponible." /> : null}
          </>
        )}
      </ContenidoGranja>
      <ModalCampo visible={dividiendo !== null} titulo="Dividir el lote" mensaje="Se crea un sublote con esa cantidad; queda ligado al lote de origen." etiqueta="Huevos del sublote" valor={parte} alCambiar={t => setParte(t.replace(/\D/g, ''))} textoConfirmar="Dividir" teclado="number-pad" cargando={trabajando} error={fallo}
        alConfirmar={() => dividiendo && void hacer(() => s.dividirLote(dividiendo, Number(parte)), 'Sublote creado.').then(ok => { if (ok) setDividiendo(null); })} alCancelar={() => { setDividiendo(null); setFallo(''); }} />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
