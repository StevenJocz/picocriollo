import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { TarjetaFila } from '@/components/TarjetaFila';
import { fechaLarga } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

export default function Grupos() {
  const { granja } = useGranja();
  const hayGallo = granja.birds.some(a => a.sex === 'Gallo' && a.status !== 'Vendido' && a.status !== 'Fallecido');
  const hayGallina = granja.birds.some(a => a.sex === 'Gallina' && a.status !== 'Vendido' && a.status !== 'Fallecido');
  const puedeCrear = hayGallo && hayGallina;
  return (
    <Pantalla>
      <Cabecera titulo="Grupos reproductores" atras accion={puedeCrear ? <BotonNuevo alPulsar={() => router.push('/formulario/grupo')} /> : undefined} />
      <ContenidoGranja>
        {granja.breedingGroups.map((g, i) => {
          const gallo = granja.birds.find(a => a.id === g.roosterId)?.name ?? 'Gallo sin ficha';
          return (
            <Entrada key={g.id} indice={i}>
              <TarjetaFila
                titulo={g.name}
                detalle={[g.code, `Gallo: ${gallo}`, `${g.henIds.length} ${g.henIds.length === 1 ? 'gallina' : 'gallinas'}`, `desde ${fechaLarga(g.startedAt)}`, g.endedAt ? `hasta ${fechaLarga(g.endedAt)}` : ''].filter(Boolean).join(' · ')}
                derecha={<Chip texto={g.status} tono={g.status === 'Activo' ? 'ok' : 'neutro'} />}
                alPulsar={() => router.push(`/formulario/grupo?id=${g.id}`)}
              />
            </Entrada>
          );
        })}
        {granja.breedingGroups.length === 0 ? (
          <EstadoVacio
            icono={Heart} tono="rosa"
            titulo={puedeCrear ? 'Aún no tienes grupos' : 'Necesitas un gallo y una gallina'}
            texto={puedeCrear ? 'Un grupo reúne a un gallo y sus gallinas durante un periodo. Así se sabe de qué grupo salió cada huevo, sin suponer parentescos.' : 'Registra al menos un gallo y una gallina para formar un grupo reproductor.'}
            accion={puedeCrear ? 'Crear mi primer grupo' : 'Registrar un ave'}
            alPulsar={() => router.push(puedeCrear ? '/formulario/grupo' : '/formulario/ave')}
          />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}
