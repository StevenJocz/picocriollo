import { Image } from 'react-native';
import { urlAbsoluta } from '@/api/cliente';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Bird } from 'lucide-react-native';
import { Buscador } from '@/components/Buscador';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip, type TonoChip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { TarjetaFila } from '@/components/TarjetaFila';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

type Filtro = 'todas' | 'Gallina' | 'Gallo' | 'Pollito';

const tonoDe = (estado: string): TonoChip =>
  estado === 'Activo' || estado === 'En reproducción' ? 'ok' : estado === 'Clueca' ? 'aviso' : estado === 'Fallecido' ? 'error' : 'neutro';

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export default function Aves() {
  const { granja } = useGranja();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');

  const visibles = useMemo(() => {
    const clave = normalizar(busqueda.trim());
    return granja.birds.filter(a => (filtro === 'todas' || a.sex === filtro) && (!clave || normalizar(`${a.name} ${a.code ?? ''} ${a.breed ?? ''}`).includes(clave)));
  }, [granja.birds, filtro, busqueda]);

  const sinGallineros = granja.coops.length === 0;

  return (
    <Pantalla barra>
      <Cabecera titulo="Mis aves" accion={granja.coops.length ? <BotonNuevo titulo="Nueva" alPulsar={() => router.push('/formulario/ave')} /> : undefined} />
      <ContenidoGranja>
        {granja.birds.length > 0 ? (
          <>
            <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por nombre, código o raza" />
            <Segmentos<Filtro> valor={filtro} alCambiar={setFiltro} opciones={[{ valor: 'todas', etiqueta: 'Todas' }, { valor: 'Gallina', etiqueta: 'Gallinas' }, { valor: 'Gallo', etiqueta: 'Gallos' }, { valor: 'Pollito', etiqueta: 'Pollitos' }]} />
          </>
        ) : null}
        {visibles.map((a, i) => (
          <Entrada key={a.id} indice={i}>
            <TarjetaFila
              titulo={a.name}
              imagen={a.photo ? <Image resizeMode="contain" source={{ uri: urlAbsoluta(a.photo) }} style={{ width: 52, height: 52, borderRadius: 26 }} accessibilityLabel={`Foto de ${a.name}`} /> : undefined}
              detalle={[a.code, a.breed || 'Sin raza', granja.coops.find(c => c.id === a.coopId)?.name].filter(Boolean).join(' · ')}
              derecha={<Chip texto={a.status} tono={tonoDe(a.status)} />}
              alPulsar={() => router.push(`/ave/${a.id}` as never)}
            />
          </Entrada>
        ))}
        {granja.birds.length === 0 ? (
          <EstadoVacio
            icono={Bird}
            titulo={sinGallineros ? 'Primero, un gallinero' : 'Aún no registras aves'}
            texto={sinGallineros ? 'Cada ave vive en un gallinero. Crea el primero y vuelve aquí para registrar tus aves.' : 'Registra cada ave con su ficha: raza, gallinero, procedencia y familia conocida.'}
            accion={sinGallineros ? 'Crear gallinero' : 'Registrar mi primera ave'}
            alPulsar={() => router.push(sinGallineros ? '/formulario/gallinero' : '/formulario/ave')}
          />
        ) : visibles.length === 0 ? (
          <EstadoVacio icono={Bird} titulo="Sin resultados" texto="Ninguna ave coincide con ese filtro o esa búsqueda." />
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}
