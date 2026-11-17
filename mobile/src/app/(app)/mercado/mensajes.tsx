import { MessageCircle } from 'lucide-react-native';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Cargado, ir } from '@/features/mercado/componentes';
import { conversaciones, useDatos } from '@/features/mercado/servicio';

export default function Mensajes() {
  const { datos, error, cargando, recargar } = useDatos(conversaciones);
  return (
    <Pantalla>
      <Cabecera titulo="Mensajes" atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.map((c, i) => (
          <Entrada key={c.id} indice={i}>
            <TarjetaFila titulo={c.counterpart} detalle={`${c.listingName} · ${c.lastMessage}`} derecha={<Chip texto={c.role === 'vendedor' ? 'Vendes' : 'Compras'} />} alPulsar={() => ir(`/mercado/chat/${c.id}`)} />
          </Entrada>
        ))}
        {datos && datos.length === 0 ? <EstadoVacio icono={MessageCircle} titulo="Sin conversaciones" texto="Escríbele a un vendedor desde su publicación y la conversación queda aquí." accion="Explorar el mercado" alPulsar={() => ir('/mercado')} /> : null}
      </Cargado>
    </Pantalla>
  );
}
