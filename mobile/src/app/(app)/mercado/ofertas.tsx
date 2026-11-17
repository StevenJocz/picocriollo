import { Gavel } from 'lucide-react-native';
import { Cabecera } from '@/components/Cabecera';
import { Chip, type TonoChip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { pesos } from '@/features/granja/calculos';
import { Cargado, ir } from '@/features/mercado/componentes';
import { tiempoRestante } from '@/features/mercado/formato';
import { misOfertas, useDatos } from '@/features/mercado/servicio';

const RESULTADO: Record<string, { texto: string; tono: TonoChip }> = {
  liderando: { texto: 'Vas ganando', tono: 'ok' }, superada: { texto: 'Te superaron', tono: 'aviso' }, ganadora: { texto: 'Ganaste', tono: 'ok' }, no_ganadora: { texto: 'No ganaste', tono: 'neutro' },
};

export default function MisOfertas() {
  const { datos, error, cargando, recargar } = useDatos(misOfertas);
  return (
    <Pantalla>
      <Cabecera titulo="Mis ofertas" atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.map((o, i) => {
          const r = RESULTADO[o.result] ?? RESULTADO.no_ganadora;
          return (
            <Entrada key={o.listingId} indice={i}>
              <TarjetaFila
                titulo={o.birdName}
                detalle={[`Tu mejor oferta ${pesos(o.myBest)}`, `precio actual ${pesos(o.currentPrice)}`, o.phase === 'abierta' ? `cierra en ${tiempoRestante(o.closesAt, new Date())}` : o.cancelled ? 'subasta cancelada' : 'cerrada', o.sellerAlias].join(' · ')}
                derecha={<Chip texto={r.texto} tono={r.tono} />}
                alPulsar={() => ir(`/mercado/${o.listingId}`)}
              />
            </Entrada>
          );
        })}
        {datos && datos.length === 0 ? <EstadoVacio icono={Gavel} titulo="Aún no ofertas en subastas" texto="Cuando ofertes por un ave, aquí ves si vas ganando y cuánto falta para el cierre." accion="Ver subastas" alPulsar={() => ir('/mercado')} /> : null}
      </Cargado>
    </Pantalla>
  );
}
