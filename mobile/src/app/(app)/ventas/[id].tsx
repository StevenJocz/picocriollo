import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Confirmar } from '@/components/Confirmar';
import { Pantalla } from '@/components/Pantalla';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga, pesos } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import * as s from '@/features/granja/servicio';
import { ModalCampo, ir } from '@/features/mercado/componentes';
import { tonoDeVenta } from '@/features/ventas/calculos';
import { color, radio } from '@/theme/tokens';

type Ventana = { tipo: 'abono' } | { tipo: 'devolver'; linea: string; maximo: number } | { tipo: 'anular' } | null;

function Linea({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <View style={estilos.linea}>
      <Texto variante={fuerte ? 'etiqueta' : 'pequeno'} style={{ flex: 1 }}>{etiqueta}</Texto>
      <Texto variante="etiqueta" style={{ fontVariant: ['tabular-nums'] }}>{valor}</Texto>
    </View>
  );
}

export default function DetalleVenta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { granja, recargar } = useGranja();
  const venta = granja.sales.find(v => v.id === id);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [valor, setValor] = useState('');
  const [medio, setMedio] = useState('Efectivo');
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function hacer(trabajo: () => Promise<unknown>, mensaje: string) {
    setTrabajando(true);
    setFallo('');
    try { await trabajo(); await recargar(); setVentana(null); setValor(''); setAviso(mensaje); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { setTrabajando(false); }
  }

  if (!venta) {
    return (
      <Pantalla>
        <Cabecera titulo="Venta" atras />
        <ContenidoGranja><Aviso tipo="error">Esa venta ya no existe. Vuelve atrás y actualiza la lista.</Aviso></ContenidoGranja>
      </Pantalla>
    );
  }

  const total = venta.lines.reduce((suma, l) => suma + Math.max(0, l.quantity * l.unitPrice - l.discount), 0);
  const devuelto = venta.returnedTotal ?? 0, reembolsado = venta.refunded ?? 0;
  const saldo = Math.max(0, total - reembolsado - venta.paid);
  const cliente = granja.customers.find(c => c.id === venta.customerId)?.name ?? 'Cliente ocasional';
  const cerrada = venta.paymentStatus === 'Cancelada' || venta.paymentStatus === 'Devuelta';

  return (
    <Pantalla>
      <Cabecera titulo={venta.code} atras />
      <ContenidoGranja>
        {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
        {fallo && !ventana ? <Aviso tipo="error">{fallo}</Aviso> : null}
        <Tarjeta>
          <View style={{ gap: 6 }}>
            <View style={estilos.chips}><Chip texto={venta.paymentStatus} tono={tonoDeVenta(venta.paymentStatus)} />{venta.receiptCode ? <Chip texto={`Recibo ${venta.receiptCode}`} /> : null}</View>
            <Linea etiqueta="Cliente" valor={cliente} />
            <Linea etiqueta="Fecha" valor={fechaLarga(venta.date)} />
            {venta.paymentMethod ? <Linea etiqueta="Medio de pago" valor={venta.paymentMethod} /> : null}
          </View>
        </Tarjeta>

        <Tarjeta>
          <View style={{ gap: 12 }}>
            <Texto variante="seccion">Productos</Texto>
            {venta.lines.map(l => {
              const restante = l.quantity - (l.returned ?? 0);
              return (
                <View key={l.id} style={estilos.producto}>
                  <View style={estilos.linea}>
                    <Texto variante="etiqueta" style={{ flex: 1 }}>{l.description || l.product}</Texto>
                    <Texto variante="etiqueta" style={{ fontVariant: ['tabular-nums'] }}>{pesos(Math.max(0, l.quantity * l.unitPrice - l.discount))}</Texto>
                  </View>
                  <Texto variante="pequeno">{l.quantity} × {pesos(l.unitPrice)}{l.discount ? ` − ${pesos(l.discount)}` : ''}{l.sourceCode ? ` · ${l.sourceCode}` : ''}{l.returned ? ` · devueltas ${l.returned}` : ''}</Texto>
                  {!cerrada && restante > 0 ? <Boton titulo="Devolver" variante="secundario" onPress={() => { setValor('1'); setFallo(''); setVentana({ tipo: 'devolver', linea: l.id, maximo: restante }); }} /> : null}
                </View>
              );
            })}
          </View>
        </Tarjeta>

        <Tarjeta>
          <View style={{ gap: 6 }}>
            <Texto variante="seccion">Pagos</Texto>
            <Linea etiqueta="Total" valor={pesos(total)} fuerte />
            {devuelto > 0 ? <Linea etiqueta="Devuelto" valor={`− ${pesos(devuelto)}`} /> : null}
            <Linea etiqueta="Pagado" valor={pesos(venta.paid)} />
            {reembolsado > 0 ? <Linea etiqueta="Reembolsado" valor={`− ${pesos(reembolsado)}`} /> : null}
            <Linea etiqueta="Saldo por cobrar" valor={pesos(saldo)} fuerte />
            {(venta.payments ?? []).map(p => <Texto key={p.id} variante="pequeno">{fechaLarga(p.date.slice(0, 10))} · {p.method} · {pesos(p.amount)}</Texto>)}
            {venta.receiptSnapshot && venta.receiptSnapshot.change > 0 ? <Texto variante="pequeno">Cambio entregado: {pesos(venta.receiptSnapshot.change)}</Texto> : null}
            {!cerrada && saldo > 0 ? <Boton titulo="Registrar abono" onPress={() => { setValor(''); setFallo(''); setMedio(venta.paymentMethod || 'Efectivo'); setVentana({ tipo: 'abono' }); }} /> : null}
          </View>
        </Tarjeta>

        {venta.notes ? <Texto variante="subtitulo">{venta.notes}</Texto> : null}
        <Boton titulo="Ver trazabilidad" variante="secundario" onPress={() => ir(`/ventas/trazabilidad?codigo=${venta.code}`)} />
        {!cerrada ? <Boton titulo="Cancelar la venta" variante="secundario" onPress={() => setVentana({ tipo: 'anular' })} /> : null}
      </ContenidoGranja>

      <ModalCampo visible={ventana?.tipo === 'abono'} titulo="Registrar abono" mensaje={`Saldo por cobrar: ${pesos(saldo)}.`} etiqueta="Valor del abono" valor={valor} alCambiar={setValor} textoConfirmar="Guardar abono" teclado="number-pad" cargando={trabajando} error={fallo}
        alConfirmar={() => void hacer(() => s.abonarVenta(venta.id, Number(valor.replace(/[\s$.]/g, '').replace(',', '.')), medio), 'Abono guardado.')} alCancelar={() => setVentana(null)} />
      <ModalCampo visible={ventana?.tipo === 'devolver'} titulo="Devolver productos" mensaje={ventana?.tipo === 'devolver' ? `Puedes devolver hasta ${ventana.maximo}. Vuelven al lote y se descuentan del valor.` : ''} etiqueta="Cantidad a devolver" valor={valor} alCambiar={setValor} textoConfirmar="Devolver" teclado="number-pad" cargando={trabajando} error={fallo}
        alConfirmar={() => ventana?.tipo === 'devolver' && void hacer(() => s.devolverLinea(venta.id, ventana.linea, Number(valor)), 'Devolución registrada.')} alCancelar={() => setVentana(null)} />
      <Confirmar visible={ventana?.tipo === 'anular'} titulo="¿Cancelar esta venta?" mensaje="Lo vendido vuelve a su lote o a su ave y queda el registro de la cancelación. No se puede deshacer." textoConfirmar="Sí, cancelar" cargando={trabajando}
        alConfirmar={() => void hacer(() => s.anularVenta(venta.id), 'Venta cancelada: las existencias volvieron a su lugar.')} alCancelar={() => setVentana(null)} />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  linea: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  producto: { gap: 6, padding: 12, borderRadius: radio.sm, backgroundColor: color.fondo },
});
