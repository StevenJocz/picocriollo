import { Redirect, useLocalSearchParams } from 'expo-router';
import { esModulo } from '@/features/granja/formularios';
import { FormularioRegistro } from '@/features/granja/FormularioRegistro';

// /formulario/ave, /formulario/ave?id=… para editar. Un módulo desconocido vuelve al inicio.
export default function Formulario() {
  const { modulo, id } = useLocalSearchParams<{ modulo: string; id?: string }>();
  if (!esModulo(modulo)) return <Redirect href="/inicio" />;
  return <FormularioRegistro key={`${modulo}-${id ?? 'nuevo'}`} modulo={modulo} id={id} />;
}
