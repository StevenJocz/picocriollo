import { router } from 'expo-router';
import { Package } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { numero, pesos } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

export default function Productos() {
  const { granja } = useGranja();
  return (
    <Pantalla>
      <Cabecera titulo="Catálogo" atras accion={<BotonNuevo alPulsar={() => router.push('/formulario/producto')} />} />
      <ContenidoGranja>
        {granja.customProducts.map((p, i) => (
          <Entrada key={p.id} indice={Math.min(i, 8)}>
            <TarjetaFila titulo={p.name} detalle={[p.code, p.category, `${pesos(p.price)} por ${p.unit}`].filter(Boolean).join(' · ')} derecha={<Chip texto={`${numero(p.available)} ${p.unit}`} tono={p.available > 0 ? 'ok' : 'error'} />} alPulsar={() => router.push(`/formulario/producto?id=${p.id}`)} />
          </Entrada>
        ))}
        {granja.customProducts.length === 0 ? <EstadoVacio icono={Package} titulo="Tu catálogo está vacío" texto="Agrega lo que vendes además de huevos, pollitos y aves: concentrado, equipos, abono… con su precio y existencia." accion="Agregar un producto" alPulsar={() => router.push('/formulario/producto')} /> : null}
      </ContenidoGranja>
    </Pantalla>
  );
}
