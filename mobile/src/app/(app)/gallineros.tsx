import { router } from 'expo-router';
import { House } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip, type TonoChip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

const tonoDe = (estado: string): TonoChip => (estado === 'Activo' ? 'ok' : estado === 'En mantenimiento' ? 'aviso' : 'neutro');

export default function Gallineros() {
  const { granja } = useGranja();
  return (
    <Pantalla>
      <Cabecera titulo="Gallineros" atras accion={<BotonNuevo alPulsar={() => router.push('/formulario/gallinero')} />} />
      <ContenidoGranja>
        {granja.coops.map((c, i) => {
          const aves = granja.birds.filter(a => a.coopId === c.id && a.status !== 'Vendido' && a.status !== 'Fallecido').length;
          return (
            <Entrada key={c.id} indice={i}>
              <TarjetaFila
                titulo={c.name}
                detalle={[c.code, c.type, c.location, `${aves} de ${c.capacity} aves`].filter(Boolean).join(' · ')}
                derecha={<Chip texto={c.status} tono={tonoDe(c.status)} />}
                alPulsar={() => router.push(`/formulario/gallinero?id=${c.id}`)}
              />
            </Entrada>
          );
        })}
        {granja.coops.length === 0 ? (
          <EstadoVacio icono={House} titulo="Aún no tienes gallineros" texto="Un gallinero es el espacio donde viven tus aves. Con el primero puedes registrar aves, huevos e incubaciones." accion="Crear mi primer gallinero" alPulsar={() => router.push('/formulario/gallinero')} />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}
