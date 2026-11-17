import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { pesos } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

export default function Clientes() {
  const { granja } = useGranja();
  return (
    <Pantalla>
      <Cabecera titulo="Clientes" atras accion={<BotonNuevo alPulsar={() => router.push('/formulario/cliente')} />} />
      <ContenidoGranja>
        {granja.customers.map((c, i) => {
          const ventas = granja.sales.filter(v => v.customerId === c.id && v.paymentStatus !== 'Cancelada');
          const total = ventas.reduce((s, v) => s + v.lines.reduce((x, l) => x + Math.max(0, l.quantity * l.unitPrice - l.discount), 0), 0);
          return (
            <Entrada key={c.id} indice={Math.min(i, 8)}>
              <TarjetaFila titulo={c.name} detalle={[c.code, c.phone, ventas.length ? `${ventas.length} ${ventas.length === 1 ? 'compra' : 'compras'} · ${pesos(total)}` : 'Sin compras'].filter(Boolean).join(' · ')} alPulsar={() => router.push(`/formulario/cliente?id=${c.id}`)} />
            </Entrada>
          );
        })}
        {granja.customers.length === 0 ? <EstadoVacio icono={Users} titulo="Aún no tienes clientes" texto="Guarda a quienes te compran para ver su historial. También puedes vender a un cliente ocasional sin registrarlo." accion="Registrar un cliente" alPulsar={() => router.push('/formulario/cliente')} /> : null}
      </ContenidoGranja>
    </Pantalla>
  );
}
