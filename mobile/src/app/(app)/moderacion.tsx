import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSesion } from '@/auth/sesion';
import { Pantalla } from '@/components/Pantalla';
import { Cabecera } from '@/components/Cabecera';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Selector } from '@/components/Selector';
import { cargarCasos, resolver, type Denuncia, type Disputa } from '@/features/moderacion/servicio';
const etiquetas: Record<string,string> = { dismiss:'Descartar denuncia', hide:'Ocultar contenido', pause:'Pausar publicación', restore:'Reanudar publicación', reject:'Rechazar publicación', withdraw:'Retirar publicación', warn:'Advertir al usuario', suspend:'Suspender cuenta', unsuspend:'Restablecer cuenta', cancel:'Cancelar operación', resume:'Reanudar operación' };
export default function Moderacion() {
  const { usuario } = useSesion();
  const staff = usuario?.rol === 'admin' || usuario?.rol === 'moderator';
  const [denuncias, cambiar] = useState<Denuncia[]>([]), [disputas, cambiarDisputas] = useState<Disputa[]>([]), [error, fallo] = useState('');
  async function cargar() { try { const d = await cargarCasos(); cambiar(d.denuncias); cambiarDisputas(d.disputas); fallo(''); } catch(e) { fallo(e instanceof Error ? e.message : 'No se pudo cargar.'); } }
  useEffect(() => { if (staff) void cargar(); }, [staff]);
  return <Pantalla><Cabecera titulo="Moderación" /><View style={{gap:16}}>
    {!staff ? <Texto>Solo los moderadores pueden consultar estos casos.</Texto> : <>
      <Boton titulo="Actualizar casos" variante="secundario" onPress={() => void cargar()} />
      {!!error && <Texto>{error}</Texto>}
      <Texto variante="seccion">Denuncias</Texto>
      {!denuncias.length && <Texto>No hay denuncias registradas.</Texto>}
      {denuncias.map(d => <Tarjeta key={d.report.id}><View style={{gap:10}}><Texto variante="etiqueta">{d.target}</Texto><Texto>{d.report.reason}</Texto><Texto variante="pequeno">{d.reporter} · {d.report.status}</Texto>
        {['abierta','en_revision'].includes(d.report.status) ? <Decision id={d.report.id} opciones={d.report.targetType === 'listing' ? ['dismiss','pause','restore','reject','withdraw'] : d.report.targetType === 'user' ? ['dismiss','warn','suspend','unsuspend'] : ['dismiss','hide']} alTerminar={cargar} /> : <Texto>{d.report.resolution}</Texto>}
      </View></Tarjeta>)}
      <Texto variante="seccion">Operaciones en disputa</Texto>
      {!disputas.length && <Texto>No hay disputas pendientes.</Texto>}
      {disputas.map(d => <Tarjeta key={d.id}><View style={{gap:10}}><Texto variante="etiqueta">Operación {d.id}</Texto><Texto>{d.disputeReason}</Texto>{d.history.map((h,i) => <Texto key={i} variante="pequeno">{h.status} · {h.note}</Texto>)}<Decision id={d.id} opciones={['resume','cancel']} disputa alTerminar={cargar} /></View></Tarjeta>)}
    </>}
  </View></Pantalla>;
}
function Decision({id, opciones, disputa=false, alTerminar}:{id:string;opciones:string[];disputa?:boolean;alTerminar:()=>Promise<void>}) {
  const [accion, elegir] = useState(opciones[0]), [nota, escribir] = useState(''), [error, fallo] = useState(''), [ocupado, ocupar] = useState(false);
  async function aplicar() { ocupar(true); fallo(''); try { await resolver(id,accion,nota,disputa); await alTerminar(); } catch(e) { fallo(e instanceof Error ? e.message : 'No se pudo resolver.'); } finally { ocupar(false); } }
  return <View style={{gap:12}}><Selector etiqueta="Decisión" valor={accion} opciones={opciones.map(valor=>({valor,etiqueta:etiquetas[valor]}))} alCambiar={elegir}/><Campo etiqueta="Nota de resolución" area value={nota} onChangeText={escribir} maxLength={500}/>{!!error && <Texto>{error}</Texto>}<Boton titulo="Aplicar decisión" cargando={ocupado} onPress={() => void aplicar()}/></View>;
}
