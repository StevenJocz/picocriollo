import { FileText } from 'lucide-react-native';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { fechaLarga, pesos } from '@/features/granja/calculos';
import { Cargado, ir } from '@/features/mercado/componentes';
import { facturas, useDatos } from '@/features/mercado/servicio';

export default function Facturas() {
  const { datos, error, cargando, recargar } = useDatos(facturas);
  return (
    <Pantalla>
      <Cabecera titulo="Facturas" atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.map((f, i) => (
          <Entrada key={f.number} indice={i}>
            <TarjetaFila
              titulo={f.title}
              detalle={`${f.number} · ${fechaLarga(f.issuedAt.slice(0, 10))} · ${pesos(f.total)} · ${f.role === 'comprador' ? 'Compraste a' : 'Vendiste a'} ${f.counterpart}`}
              derecha={<Chip texto={f.role === 'comprador' ? 'Compra' : 'Venta'} />}
              alPulsar={() => ir(`/mercado/factura/${f.number}`)}
            />
          </Entrada>
        ))}
        {datos && datos.length === 0 ? <EstadoVacio icono={FileText} titulo="Aún no tienes facturas" texto="Cada compraventa completada genera una factura interna para las dos partes." /> : null}
      </Cargado>
    </Pantalla>
  );
}
