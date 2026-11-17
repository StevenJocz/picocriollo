import { useLocalSearchParams } from 'expo-router';
import { Cabecera } from '@/components/Cabecera';
import { Pantalla } from '@/components/Pantalla';
import { ArbolGenealogico } from '@/features/granja/ArbolGenealogico';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';

export default function Linaje() {
  const { granja } = useGranja();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Pantalla><Cabecera titulo="La familia de tus aves" atras /><ContenidoGranja><ArbolGenealogico aves={granja.birds} nacimientos={granja.births} inicial={id} /></ContenidoGranja></Pantalla>;
}
