import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Tag } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Boton } from '@/components/Boton';
import { Chip } from '@/components/Chip';
import { Confirmar } from '@/components/Confirmar';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Texto } from '@/components/Texto';
import { Aviso } from '@/components/Aviso';
import { pesos } from '@/features/granja/calculos';
import { Cargado, ModalCampo, ir } from '@/features/mercado/componentes';
import { TIPO_PUBLICACION, estadoPublicacion, tiempoRestante } from '@/features/mercado/formato';
import { accionPublicacion, cancelarSubasta, interesados, misPublicaciones, useDatos, type MiPublicacion } from '@/features/mercado/servicio';

const filtros = [
  { valor: 'todas', etiqueta: 'Todas' }, { valor: 'publicada', etiqueta: 'Publicadas' }, { valor: 'borrador', etiqueta: 'Borradores' },
  { valor: 'pausada', etiqueta: 'Pausadas' }, { valor: 'pendiente_confirmar', etiqueta: 'Por responder' }, { valor: 'requieren_revision', etiqueta: 'Por revisar' }, { valor: 'retirada', etiqueta: 'Cerradas' },
];

export default function MisPublicaciones() {
  const [filtro, setFiltro] = useState('todas');
  const { datos, error, cargando, recargar } = useDatos(() => misPublicaciones(filtro === 'todas' ? undefined : filtro), [filtro]);
  const [ocupada, setOcupada] = useState('');
  const [fallo, setFallo] = useState('');
  const [aRetirar, setARetirar] = useState<MiPublicacion | null>(null);
  const [aCancelar, setACancelar] = useState<MiPublicacion | null>(null);
  const [motivo, setMotivo] = useState('');
  const [verInteresados, setVerInteresados] = useState<string | null>(null);

  async function hacer(p: MiPublicacion, accion: 'publicar' | 'pausar' | 'reanudar' | 'retirar' | 'actualizar-ficha') {
    setOcupada(p.id);
    setFallo('');
    try { await accionPublicacion(p.id, accion); setARetirar(null); await recargar(); }
    catch (e) { setARetirar(null); setFallo(e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { setOcupada(''); }
  }

  async function cancelar() {
    if (!aCancelar) return;
    setOcupada(aCancelar.id);
    try { await cancelarSubasta(aCancelar.id, motivo); setACancelar(null); setMotivo(''); await recargar(); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo cancelar.'); }
    finally { setOcupada(''); }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Mis publicaciones" atras accion={<BotonNuevo titulo="Publicar" alPulsar={() => ir('/mercado/publicar')} />} />
      <Segmentos valor={filtro} alCambiar={setFiltro} opciones={filtros} />
      {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.map((p, i) => {
          const estado = estadoPublicacion(p.status);
          const ocupadaAhora = ocupada === p.id;
          const conOfertas = (p.auction?.bidCount ?? 0) > 0;
          const editable = ['borrador', 'publicada', 'pausada'].includes(p.status);
          return (
            <Entrada key={p.id} indice={i}>
              <TarjetaFila
                titulo={p.snapshot.title ?? p.snapshot.name}
                detalle={[p.kind === 'interest' ? 'Precio a convenir' : pesos(p.auction ? p.auction.currentPrice : p.price), TIPO_PUBLICACION[p.kind], p.auction?.phase === 'abierta' ? `cierra en ${tiempoRestante(p.closesAt, new Date())}` : ''].filter(Boolean).join(' · ')}
                derecha={<Chip texto={estado.texto} tono={estado.tono} />}
                alPulsar={() => ir(`/mercado/${p.id}`)}
                pie={(
                  <View style={{ gap: 10 }}>
                    <View style={estilos.chips}>
                      {p.interestCount > 0 ? <Chip texto={`${p.interestCount} ${p.interestCount === 1 ? 'interesado' : 'interesados'}`} tono="ok" /> : null}
                      {conOfertas ? <Chip texto={`${p.auction!.bidCount} ${p.auction!.bidCount === 1 ? "oferta" : "ofertas"}`} tono="ok" /> : null}
                      {p.pendingRequests > 0 ? <Chip texto={`${p.pendingRequests} por responder`} tono="aviso" /> : null}
                      {p.needsReview ? <Chip texto="La ficha cambió" tono="aviso" /> : null}
                      {p.closedReason && !editable ? <Chip texto={p.closedReason.replaceAll('_', ' ')} /> : null}
                    </View>
                    {p.needsReview && editable ? <Texto variante="pequeno">Cambiaste datos del ave. Actualiza la ficha pública antes de reanudar.</Texto> : null}
                    <View style={estilos.botones}>
                      {p.status === 'borrador' ? <Accion t="Publicar" cargando={ocupadaAhora} alPulsar={() => void hacer(p, 'publicar')} /> : null}
                      {p.status === 'publicada' && !conOfertas ? <Accion t="Pausar" cargando={ocupadaAhora} alPulsar={() => void hacer(p, 'pausar')} /> : null}
                      {p.status === 'pausada' ? <Accion t="Reanudar" cargando={ocupadaAhora} alPulsar={() => void hacer(p, 'reanudar')} /> : null}
                      {editable && p.needsReview ? <Accion t="Actualizar ficha" cargando={ocupadaAhora} alPulsar={() => void hacer(p, 'actualizar-ficha')} /> : null}
                      {p.pendingRequests > 0 || p.operationId ? <Accion t="Ver operación" cargando={false} alPulsar={() => ir('/mercado/operaciones')} /> : null}
                      {p.interestCount > 0 ? <Accion t={verInteresados === p.id ? 'Ocultar interesados' : 'Ver interesados'} cargando={false} alPulsar={() => setVerInteresados(verInteresados === p.id ? null : p.id)} /> : null}
                      {editable && p.kind === 'auction' && conOfertas && p.status === 'publicada' ? <Accion t="Cancelar subasta" cargando={ocupadaAhora} alPulsar={() => setACancelar(p)} /> : null}
                      {editable && !conOfertas ? <Accion t="Retirar" cargando={ocupadaAhora} alPulsar={() => setARetirar(p)} /> : null}
                    </View>
                    {verInteresados === p.id ? <Interesados id={p.id} /> : null}
                  </View>
                )}
              />
            </Entrada>
          );
        })}
        {datos && datos.length === 0 ? (
          <EstadoVacio icono={Tag} titulo="Sin publicaciones aquí" texto={filtro === 'todas' ? 'Publica un ave de tu granja para que otros criadores la vean.' : 'No hay publicaciones con este filtro.'} accion={filtro === 'todas' ? 'Publicar un ave' : undefined} alPulsar={() => ir('/mercado/publicar')} />
        ) : null}
      </Cargado>
      <Confirmar visible={!!aRetirar} titulo="¿Retirar esta publicación?" mensaje="Sale del mercado y el ave queda libre. Puedes volver a publicarla después." textoConfirmar="Sí, retirar" cargando={!!aRetirar && ocupada === aRetirar.id} alConfirmar={() => aRetirar && void hacer(aRetirar, 'retirar')} alCancelar={() => setARetirar(null)} />
      <ModalCampo
        visible={!!aCancelar} titulo="Cancelar la subasta" mensaje="Ya hay ofertas: se avisará a los postores. Solo puedes cancelar si faltan más de 24 horas para el cierre." etiqueta="Motivo (mínimo 10 caracteres)" valor={motivo} alCambiar={setMotivo}
        textoConfirmar="Cancelar subasta" area cargando={!!aCancelar && ocupada === aCancelar.id} error={fallo} alConfirmar={() => void cancelar()} alCancelar={() => { setACancelar(null); setFallo(''); }}
      />
    </Pantalla>
  );
}

function Accion({ t, cargando, alPulsar }: { t: string; cargando: boolean; alPulsar: () => void }) {
  return <View style={{ minWidth: 150, flexGrow: 1 }}><Boton titulo={t} variante="secundario" cargando={cargando} onPress={alPulsar} /></View>;
}

function Interesados({ id }: { id: string }) {
  const { datos, error, cargando, recargar } = useDatos(() => interesados(id), [id]);
  return (
    <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
      {datos?.map(i => (
        <View key={i.id} style={{ gap: 2 }}>
          <Texto variante="etiqueta">{i.alias}</Texto>
          {i.message ? <Texto variante="pequeno">{i.message}</Texto> : null}
        </View>
      ))}
    </Cargado>
  );
}

const estilos = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
