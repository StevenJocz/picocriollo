import { useState } from 'react';
import { ModalCampo } from '@/features/mercado/componentes';
import { Boton } from '@/components/Boton';
import { Texto } from '@/components/Texto';
import { denunciar } from './servicio';
export function Denunciar({ tipo, id }: { tipo: string; id: string }) {
  const [abierto, abrir] = useState(false), [motivo, cambiar] = useState(''), [error, fallo] = useState(''), [ocupado, ocupar] = useState(false), [enviado, enviar] = useState(false);
  async function guardar() {
    ocupar(true); fallo('');
    try { await denunciar(tipo, id, motivo); abrir(false); enviar(true); cambiar(''); }
    catch (e) { fallo(e instanceof Error ? e.message : 'No se pudo enviar la denuncia.'); }
    finally { ocupar(false); }
  }
  return <>
    {enviado ? <Texto variante="pequeno">Denuncia enviada a moderación.</Texto> : <Boton titulo="Denunciar" variante="secundario" onPress={() => abrir(true)} />}
    <ModalCampo visible={abierto} titulo="Denunciar contenido" mensaje="Un moderador revisará tu motivo. Escribe al menos 10 caracteres." etiqueta="Motivo" valor={motivo} alCambiar={cambiar} area textoConfirmar="Enviar denuncia" cargando={ocupado} error={error} alConfirmar={() => void guardar()} alCancelar={() => abrir(false)} />
  </>;
}
