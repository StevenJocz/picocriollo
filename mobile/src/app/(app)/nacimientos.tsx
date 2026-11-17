import { ArbolGenealogico } from '@/features/granja/ArbolGenealogico';
import { router } from 'expo-router';
import { Sprout } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { fechaLarga } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

export default function Nacimientos() {
  const { granja } = useGranja();
  const nacimientos = [...granja.births].sort((a, b) => b.date.localeCompare(a.date));
  const sinIncubaciones = granja.incubations.length === 0;
  return (
    <Pantalla>
      <Cabecera titulo="Nacimientos" atras accion={!sinIncubaciones ? <BotonNuevo alPulsar={() => router.push('/formulario/nacimiento')} /> : undefined} />
      <ContenidoGranja>
        <ArbolGenealogico aves={granja.birds} nacimientos={granja.births} />
        {nacimientos.map((n, i) => {
          const lote = granja.chickLots.find(l => l.birthId === n.id);
          const madre = granja.birds.find(a => a.id === n.motherId)?.name;
          const padre = granja.birds.find(a => a.id === n.fatherId)?.name;
          return (
            <Entrada key={n.id} indice={i}>
              <TarjetaFila
                titulo={`${n.count} ${n.count === 1 ? 'pollito' : 'pollitos'} · ${fechaLarga(n.date)}`}
                detalle={[n.code, n.breed, `Madre: ${madre ?? 'desconocida'}`, `Padre: ${padre ?? 'desconocido'}`].filter(Boolean).join(' · ')}
                derecha={lote ? <Chip texto={`${lote.available} disponibles`} tono={lote.available > 0 ? 'ok' : 'neutro'} /> : undefined}
                alPulsar={() => router.push(`/formulario/nacimiento?id=${n.id}`)}
              />
            </Entrada>
          );
        })}
        {nacimientos.length === 0 ? (
          <EstadoVacio
            icono={Sprout} tono="verde"
            titulo={sinIncubaciones ? 'Primero, una incubación' : 'Aún no registras nacimientos'}
            texto={sinIncubaciones ? 'Un nacimiento sale de una incubación. Registra la primera y vuelve aquí cuando nazcan los pollitos.' : 'Cuando nazcan los pollitos, registra el lote: se crea con su cantidad disponible y sus padres conocidos.'}
            accion={sinIncubaciones ? 'Registrar una incubación' : 'Registrar un nacimiento'}
            alPulsar={() => router.push(sinIncubaciones ? '/formulario/incubacion' : '/formulario/nacimiento')}
          />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}
