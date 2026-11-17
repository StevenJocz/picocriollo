import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Package } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Confirmar } from '@/components/Confirmar';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga, pesos } from '@/features/granja/calculos';
import { Cargado, ModalCampo, ModalValoracion, ir } from '@/features/mercado/componentes';
import { accionesDe, estadoOperacion, siguientePaso, type AccionOperacion } from '@/features/mercado/formato';
import * as s from '@/features/mercado/servicio';
import { color, fuente, radio, sombra } from '@/theme/tokens';

const ETIQUETAS: Record<AccionOperacion, string> = {
  aceptar: 'Aceptar solicitud', rechazar: 'Rechazar', retirar: 'Retirar mi solicitud', pagar: 'Ya pagué', confirmar_pago: 'Recibí el pago', entregar: 'Ya entregué el ave',
  recibir: 'Recibí el ave', cancelar: 'Cancelar operación', disputar: 'Abrir una disputa', contacto: 'Contacto', valorar: 'Valorar',
};
type Ventana = { tipo: 'pagar' | 'cancelar' | 'disputar' | 'valorar' | 'recibir' | 'rechazar'; op: s.Operacion } | null;

export default function Operaciones() {
  const [rol, setRol] = useState('todas');
  const { datos, error, cargando, recargar } = useDatos(rol);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [valor, setValor] = useState('');
  const [fallo, setFallo] = useState('');
  const [ocupada, setOcupada] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState('');

  const abrir = (tipo: NonNullable<Ventana>['tipo'], op: s.Operacion) => { setValor(''); setFallo(''); setVentana({ tipo, op }); };

  async function ejecutar(op: s.Operacion, trabajo: () => Promise<unknown>, mensaje = '') {
    setOcupada(op.id);
    setAviso('');
    try { await trabajo(); if (mensaje) setAviso(mensaje); await recargar(); }
    catch (e) { setAviso(''); setFallo(e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { setOcupada(''); }
  }

  function alPulsar(a: AccionOperacion, op: s.Operacion) {
    setFallo('');
    switch (a) {
      case 'aceptar': return void ejecutar(op, () => s.responderSolicitud(op.id, 'accept'), 'Solicitud aceptada: el ave quedó reservada para esta compra.');
      case 'retirar': return void ejecutar(op, () => s.retirarSolicitud(op.id), 'Solicitud retirada.');
      case 'confirmar_pago': return void ejecutar(op, () => s.confirmarPago(op.id), 'Pago confirmado. Ahora coordina la entrega.');
      case 'entregar': return void ejecutar(op, () => s.marcarEntrega(op.id), 'Entrega marcada. Falta que el comprador confirme que la recibió.');
      case 'contacto': return void verContacto(op);
      case 'rechazar': case 'recibir': case 'pagar': case 'cancelar': case 'disputar': case 'valorar': return abrir(a, op);
    }
  }

  async function verContacto(op: s.Operacion) {
    setFallo('');
    try {
      if (!op.contactShared.mine) { await s.compartirContacto(op.id); await recargar(); setAviso(op.contactShared.theirs ? 'Autorizaste compartir tu contacto. Toca «Contacto» otra vez para verlo.' : 'Autorizaste compartir tu contacto. Se mostrará cuando la otra parte también lo autorice.'); return; }
      if (!op.contactShared.theirs) { setAviso('Esperando que la otra parte autorice compartir su contacto.'); return; }
      const c = await s.verContacto(op.id);
      setAviso(`Contacto de ${c.alias}: ${c.email}${c.phone ? ` · ${c.phone}` : ''}`);
    } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo obtener el contacto.'); }
  }

  async function confirmar() {
    if (!ventana) return;
    const { tipo, op } = ventana;
    setTrabajando(true);
    setFallo('');
    try {
      if (tipo === 'pagar') await s.declararPago(op.id, valor);
      else if (tipo === 'cancelar') await s.cancelarOperacion(op.id, valor);
      else if (tipo === 'disputar') await s.abrirDisputa(op.id, valor);
      else if (tipo === 'rechazar') await s.responderSolicitud(op.id, 'reject');
      else if (tipo === 'recibir') await s.confirmarRecepcion(op.id);
      setVentana(null);
      await recargar();
      setAviso(tipo === 'recibir' ? 'Compra cerrada: el ave ya está en tu granja.' : tipo === 'pagar' ? 'Pago declarado. El vendedor debe confirmarlo.' : '');
    } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { setTrabajando(false); }
  }

  async function enviarValoracion(estrellas: number, comentario: string) {
    if (!ventana) return;
    setTrabajando(true);
    setFallo('');
    try { await s.valorar(ventana.op.id, estrellas, comentario); setVentana(null); await recargar(); setAviso('Gracias por valorar.'); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo enviar.'); }
    finally { setTrabajando(false); }
  }

  const tipo = ventana?.tipo;
  return (
    <Pantalla>
      <Cabecera titulo="Compras y ventas" atras />
      <Segmentos valor={rol} alCambiar={setRol} opciones={[{ valor: 'todas', etiqueta: 'Todas' }, { valor: 'comprador', etiqueta: 'Mis compras' }, { valor: 'vendedor', etiqueta: 'Mis ventas' }]} />
      {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
      {fallo && !ventana ? <Aviso tipo="error">{fallo}</Aviso> : null}
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.map((op, i) => {
          const estado = estadoOperacion(op.status);
          const rolMio = op.role as 'comprador' | 'vendedor';
          const acciones = accionesDe(rolMio, op.status, op.rating.canRate);
          return (
            <Entrada key={op.id} indice={i}>
              <View style={estilos.tarjeta}>
                <View style={estilos.fila}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Texto variante="etiqueta" style={{ fontSize: 16, lineHeight: 22 }} numberOfLines={2}>{op.birdName}</Texto>
                    <Texto variante="pequeno">{rolMio === 'comprador' ? 'Le compras a' : 'Le vendes a'} {op.counterpart} · {fechaLarga(op.createdAt.slice(0, 10))}</Texto>
                  </View>
                  <Texto style={estilos.precio}>{pesos(op.price)}</Texto>
                </View>
                <View style={estilos.chips}>
                  <Chip texto={estado.texto} tono={estado.tono} />
                  {op.origin === 'subasta' ? <Chip texto="Subasta" /> : null}
                  {op.paymentMethod ? <Chip texto={`Pago: ${op.paymentMethod}`} /> : null}
                </View>
                {siguientePaso(rolMio, op.status) ? <Texto variante="subtitulo">{siguientePaso(rolMio, op.status)}</Texto> : null}
                {op.status === 'cancelada' && op.cancelReason ? <Texto variante="pequeno">Motivo: {op.cancelReason}</Texto> : null}
                {op.rating.mine || op.rating.theirs ? (
                  <Texto variante="pequeno">
                    {op.rating.mine ? `Tu valoración: ${op.rating.mine.stars} ★. ` : ''}{op.rating.theirs ? `Te valoraron: ${op.rating.theirs.stars} ★${op.rating.theirs.comment ? ` — «${op.rating.theirs.comment}»` : ''}` : ''}
                  </Texto>
                ) : null}
                <View style={estilos.botones}>
                  {acciones.map((a, n) => (
                    <View key={a} style={{ minWidth: 160, flexGrow: 1 }}>
                      <Boton titulo={ETIQUETAS[a]} variante={n === 0 && a !== 'contacto' ? 'primario' : 'secundario'} cargando={ocupada === op.id} onPress={() => alPulsar(a, op)} />
                    </View>
                  ))}
                  {op.threadId ? <View style={{ minWidth: 160, flexGrow: 1 }}><Boton titulo="Mensajes" variante="secundario" onPress={() => ir(`/mercado/chat/${op.threadId}`)} /></View> : null}
                  {op.invoiceNumber ? <View style={{ minWidth: 160, flexGrow: 1 }}><Boton titulo="Ver factura" variante="secundario" onPress={() => ir(`/mercado/factura/${op.invoiceNumber}`)} /></View> : null}
                  <View style={{ minWidth: 160, flexGrow: 1 }}><Boton titulo="Ver publicación" variante="secundario" onPress={() => ir(`/mercado/${op.listingId}`)} /></View>
                </View>
              </View>
            </Entrada>
          );
        })}
        {datos && datos.length === 0 ? <EstadoVacio icono={Package} titulo="Sin operaciones todavía" texto="Cuando pidas comprar un ave, ganes una subasta o alguien te pida una de las tuyas, el seguimiento aparece aquí." accion="Explorar el mercado" alPulsar={() => ir('/mercado')} /> : null}
      </Cargado>

      <ModalCampo visible={tipo === 'pagar'} titulo="Declarar tu pago" mensaje="La plataforma no procesa ni verifica pagos: avisas al vendedor que ya pagaste y él lo confirma." etiqueta="¿Con qué pagaste? (Nequi, transferencia, efectivo…)" valor={valor} alCambiar={setValor} textoConfirmar="Declarar pago" cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={() => setVentana(null)} />
      <ModalCampo visible={tipo === 'cancelar'} titulo="Cancelar la operación" mensaje="El ave vuelve a estar disponible. Quedará registrado quién canceló y por qué." etiqueta="Motivo (mínimo 10 caracteres)" valor={valor} alCambiar={setValor} textoConfirmar="Cancelar operación" area cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={() => setVentana(null)} />
      <ModalCampo visible={tipo === 'disputar'} titulo="Abrir una disputa" mensaje="Un moderador revisará el caso. Cuéntale qué pasó." etiqueta="Qué pasó (mínimo 10 caracteres)" valor={valor} alCambiar={setValor} textoConfirmar="Abrir disputa" area cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={() => setVentana(null)} />
      <Confirmar visible={tipo === 'recibir'} titulo="¿Ya recibiste el ave?" mensaje="Al confirmar, el ave pasa a tu granja con su ficha y se emite el comprobante. No se puede deshacer." textoConfirmar="Sí, la recibí" cargando={trabajando} alConfirmar={() => void confirmar()} alCancelar={() => setVentana(null)} />
      <Confirmar visible={tipo === 'rechazar'} titulo="¿Rechazar la solicitud?" mensaje="El comprador recibirá el aviso de que no aceptaste." textoConfirmar="Sí, rechazar" cargando={trabajando} alConfirmar={() => void confirmar()} alCancelar={() => setVentana(null)} />
      <ModalValoracion visible={tipo === 'valorar'} cargando={trabajando} error={fallo} alEnviar={(e, c) => void enviarValoracion(e, c)} alCancelar={() => setVentana(null)} />
    </Pantalla>
  );
}

function useDatos(rol: string) {
  return s.useDatos(() => s.operaciones(rol === 'todas' ? undefined : rol), [rol]);
}

const estilos = StyleSheet.create({
  tarjeta: { gap: 12, padding: 16, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  precio: { fontFamily: fuente.tituloMedio, fontSize: 18, lineHeight: 24, color: color.greenDark, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
