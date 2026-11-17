import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Segmentos } from '@/components/Segmentos';
import { Selector } from '@/components/Selector';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { hoyTexto, pesos } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { registrarVenta } from '@/features/granja/servicio';
import { PRODUCTOS, aCuerpoDeVenta, cambio, estadoDePagoPara, fuentesDe, lineaVacia, totalLinea, totalVenta, validarVenta, type BorradorDeVenta, type LineaBorrador, type Producto } from '@/features/ventas/calculos';
import { color, radio } from '@/theme/tokens';

const MEDIOS = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Otro'];
const nuevaClave = () => `venta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function NuevaVenta() {
  const { granja, recargar } = useGranja();
  const [b, setB] = useState<BorradorDeVenta>({ clienteId: '', fecha: hoyTexto(), lineas: [lineaVacia()], abono: '', medio: 'Efectivo', recibido: '', notas: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Un intento = una clave: si la petición se repite por un corte de red, la API devuelve la misma venta en vez de venderla dos veces.
  const clave = useRef(nuevaClave());

  const total = totalVenta(b.lineas);
  const abono = Number(b.abono.replace(/[\s$.]/g, '').replace(',', '.') || 0);
  const cambiarLinea = (i: number, cambios: Partial<LineaBorrador>) => setB(a => ({ ...a, lineas: a.lineas.map((l, n) => (n === i ? { ...l, ...cambios } : l)) }));

  function elegirProducto(i: number, producto: Producto) { cambiarLinea(i, { ...lineaVacia(producto) }); }
  function elegirOrigen(i: number, origen: string) {
    const linea = b.lineas[i];
    const fuente = fuentesDe(linea.producto, granja).find(f => f.valor === origen);
    cambiarLinea(i, { origen, unidad: fuente?.unidad ?? 'unidad', ...(fuente?.precio !== undefined && !linea.precio ? { precio: String(fuente.precio) } : {}), ...(linea.producto === 'Ave adulta' ? { cantidad: '1' } : {}) });
  }

  async function confirmar() {
    const problema = validarVenta(b, granja);
    setError(problema ?? '');
    if (problema) return;
    setEnviando(true);
    try {
      const r = await registrarVenta(aCuerpoDeVenta(b, clave.current, 'Pico Criollo') as never);
      clave.current = nuevaClave();
      await recargar();
      router.replace(`/ventas/${r.id}` as never);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar la venta.'); }
    finally { setEnviando(false); }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Nueva venta" atras />
      <ContenidoGranja>
        <Tarjeta>
          <View style={{ gap: 14 }}>
            <Selector etiqueta="Cliente" valor={b.clienteId} alCambiar={v => setB(a => ({ ...a, clienteId: v }))} opcional opciones={granja.customers.map(c => ({ valor: c.id, etiqueta: c.name }))} ayuda="Sin elegir, la venta es a un cliente ocasional." vacio="Aún no tienes clientes: la venta será ocasional." />
            <Campo etiqueta="Fecha" value={b.fecha} onChangeText={t => setB(a => ({ ...a, fecha: t }))} placeholder="AAAA-MM-DD" maxLength={10} accion={{ titulo: 'Hoy', alPulsar: () => setB(a => ({ ...a, fecha: hoyTexto() })) }} />
          </View>
        </Tarjeta>

        {b.lineas.map((l, i) => {
          const fuentes = fuentesDe(l.producto, granja);
          return (
            <Tarjeta key={i}>
              <View style={{ gap: 12 }}>
                <View style={estilos.cabecera}>
                  <Texto variante="seccion">Producto {i + 1}</Texto>
                  {b.lineas.length > 1 ? <Pulsable accessibilityRole="button" accessibilityLabel={`Quitar el producto ${i + 1}`} onPress={() => setB(a => ({ ...a, lineas: a.lineas.filter((_, n) => n !== i) }))} style={estilos.quitar}><Trash2 size={20} color={color.muted} /></Pulsable> : null}
                </View>
                <Segmentos<Producto> valor={l.producto} alCambiar={p => elegirProducto(i, p)} opciones={PRODUCTOS.map(p => ({ valor: p, etiqueta: p }))} />
                <Selector etiqueta={l.producto === 'Otro' ? 'Producto del catálogo' : l.producto === 'Ave adulta' ? 'Ave' : 'De dónde sale'} valor={l.origen} alCambiar={o => elegirOrigen(i, o)} opciones={fuentes.map(f => ({ valor: f.valor, etiqueta: f.etiqueta }))} vacio={l.producto === 'Otro' ? 'Agrega productos en el catálogo.' : l.producto === 'Ave adulta' ? 'No hay aves para vender.' : 'No hay existencias disponibles de esto.'} />
                <View style={estilos.fila}>
                  <View style={{ flex: 1 }}><Campo etiqueta="Cantidad" value={l.cantidad} onChangeText={t => cambiarLinea(i, { cantidad: t })} keyboardType="decimal-pad" maxLength={9} /></View>
                  <View style={{ flex: 1 }}><Campo etiqueta="Precio unitario" value={l.precio} onChangeText={t => cambiarLinea(i, { precio: t })} keyboardType="number-pad" maxLength={12} placeholder="0" /></View>
                </View>
                <Campo etiqueta="Descuento (opcional)" value={l.descuento} onChangeText={t => cambiarLinea(i, { descuento: t })} keyboardType="number-pad" maxLength={12} />
                <Texto variante="etiqueta" style={{ textAlign: 'right' }}>Subtotal: {pesos(totalLinea(l))}</Texto>
              </View>
            </Tarjeta>
          );
        })}
        <Boton titulo="Agregar otro producto" variante="secundario" icono={<Plus size={18} color={color.greenDark} />} onPress={() => setB(a => ({ ...a, lineas: [...a.lineas, lineaVacia()] }))} />

        <Tarjeta>
          <View style={{ gap: 14 }}>
            <View style={estilos.cabecera}><Texto variante="seccion">Total</Texto><Texto variante="seccion" style={{ fontVariant: ['tabular-nums'] }}>{pesos(total)}</Texto></View>
            <Campo etiqueta="¿Cuánto pagó ahora?" value={b.abono} onChangeText={t => setB(a => ({ ...a, abono: t }))} keyboardType="number-pad" placeholder="0" accion={{ titulo: 'Todo', alPulsar: () => setB(a => ({ ...a, abono: String(total) })) }} ayuda={`Estado: ${estadoDePagoPara(total, abono)}. Lo que falte lo puedes cobrar después con abonos.`} />
            {abono > 0 ? <Selector etiqueta="Medio de pago" valor={b.medio} alCambiar={m => setB(a => ({ ...a, medio: m }))} opciones={MEDIOS.map(m => ({ valor: m, etiqueta: m }))} /> : null}
            {abono > 0 && abono >= total && b.medio === 'Efectivo' ? (
              <Campo etiqueta="Efectivo recibido" value={b.recibido} onChangeText={t => setB(a => ({ ...a, recibido: t }))} keyboardType="number-pad" placeholder={String(total)} ayuda={`Cambio: ${pesos(cambio(total, Number(b.recibido.replace(/[\s$.]/g, '') || total)))}`} />
            ) : null}
            <Campo etiqueta="Observaciones" value={b.notas} onChangeText={t => setB(a => ({ ...a, notas: t }))} area autoCapitalize="sentences" maxLength={1000} />
            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            <Boton titulo="Confirmar venta" cargando={enviando} onPress={() => void confirmar()} />
          </View>
        </Tarjeta>
      </ContenidoGranja>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fila: { flexDirection: 'row', gap: 10 },
  quitar: { width: 44, height: 44, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center' },
});
