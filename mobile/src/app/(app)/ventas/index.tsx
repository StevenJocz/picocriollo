import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { BarChart3, Boxes, Package, Receipt, Search, Users } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Segmentos } from '@/components/Segmentos';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Texto } from '@/components/Texto';
import { fechaLarga, pesos } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { ir } from '@/features/mercado/componentes';
import { tonoDeVenta } from '@/features/ventas/calculos';
import { color, fuente, radio } from '@/theme/tokens';

type Filtro = 'todas' | 'cobrar' | 'pagadas' | 'cerradas';

const totalDe = (v: { lines: { quantity: number; unitPrice: number; discount: number }[] }) => v.lines.reduce((s, l) => s + Math.max(0, l.quantity * l.unitPrice - l.discount), 0);

const atajos = [
  { nombre: 'Clientes', ruta: '/ventas/clientes', icono: Users },
  { nombre: 'Catálogo', ruta: '/ventas/productos', icono: Package },
  { nombre: 'Lotes', ruta: '/ventas/lotes', icono: Boxes },
  { nombre: 'Reportes', ruta: '/ventas/reportes', icono: BarChart3 },
  { nombre: 'Trazabilidad', ruta: '/ventas/trazabilidad', icono: Search },
];

export default function Ventas() {
  const { granja } = useGranja();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const ventas = [...granja.sales].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date)).filter(v => {
    if (filtro === 'cobrar') return v.paymentStatus === 'Pendiente' || v.paymentStatus === 'Parcial';
    if (filtro === 'pagadas') return v.paymentStatus === 'Pagado';
    if (filtro === 'cerradas') return ['Cancelada', 'Devuelta', 'Devuelta parcial'].includes(v.paymentStatus);
    return true;
  });
  const porCobrar = granja.sales.filter(v => v.paymentStatus === 'Pendiente' || v.paymentStatus === 'Parcial').reduce((s, v) => s + Math.max(0, totalDe(v) - (v.refunded ?? 0) - v.paid), 0);

  return (
    <Pantalla>
      <Cabecera titulo="Ventas" atras accion={<BotonNuevo titulo="Vender" alPulsar={() => router.push('/ventas/nueva' as never)} />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.atajos} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {atajos.map(a => (
          <Pulsable key={a.nombre} accessibilityRole="link" accessibilityLabel={a.nombre} onPress={() => ir(a.ruta)} style={estilos.atajo}>
            <a.icono size={18} color={color.greenDark} strokeWidth={1.8} />
            <Texto style={estilos.atajoTexto}>{a.nombre}</Texto>
          </Pulsable>
        ))}
      </ScrollView>
      <ContenidoGranja>
        {granja.sales.length > 0 ? (
          <>
            {porCobrar > 0 ? <Chip texto={`Por cobrar: ${pesos(porCobrar)}`} tono="aviso" /> : null}
            <Segmentos<Filtro> valor={filtro} alCambiar={setFiltro} opciones={[{ valor: 'todas', etiqueta: 'Todas' }, { valor: 'cobrar', etiqueta: 'Por cobrar' }, { valor: 'pagadas', etiqueta: 'Pagadas' }, { valor: 'cerradas', etiqueta: 'Canceladas' }]} />
          </>
        ) : null}
        {ventas.map((v, i) => (
          <Entrada key={v.id} indice={Math.min(i, 8)}>
            <TarjetaFila
              titulo={granja.customers.find(c => c.id === v.customerId)?.name ?? 'Cliente ocasional'}
              detalle={`${v.code} · ${fechaLarga(v.date)} · ${v.lines.length} ${v.lines.length === 1 ? 'producto' : 'productos'} · ${pesos(totalDe(v))}`}
              derecha={<Chip texto={v.paymentStatus} tono={tonoDeVenta(v.paymentStatus)} />}
              alPulsar={() => router.push(`/ventas/${v.id}` as never)}
            />
          </Entrada>
        ))}
        {granja.sales.length === 0 ? (
          <EstadoVacio icono={Receipt} titulo="Aún no registras ventas" texto="Vende huevos, pollitos, aves o productos: cada venta descuenta del lote y genera su recibo." accion="Registrar mi primera venta" alPulsar={() => router.push('/ventas/nueva' as never)} />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  atajos: { marginHorizontal: -20, flexGrow: 0, marginBottom: 12 },
  atajo: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: radio.pildora, backgroundColor: color.mint },
  atajoTexto: { fontFamily: fuente.textoFuerte, fontSize: 14, color: color.greenDark },
});
