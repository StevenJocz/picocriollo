import { PerfilVista } from '@/features/social/PerfilVista';
import { useSesion } from '@/auth/sesion';
import { Pantalla } from '@/components/Pantalla';
import { Texto } from '@/components/Texto';

/** Mi perfil: el mismo que ven los demás, con las acciones de editar. */
export default function MiPerfil() {
  const { usuario } = useSesion();
  const id = usuario?.id;
  if (!id) return <Pantalla><Texto variante="subtitulo">Cargando tu perfil…</Texto></Pantalla>;
  return <PerfilVista id={id} propio />;
}
