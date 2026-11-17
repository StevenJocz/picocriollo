import { urlAbsoluta } from '@/api/cliente';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Chip } from '@/components/Chip';
import { Confirmar } from '@/components/Confirmar';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga, hoyTexto } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import * as s from '@/features/granja/servicio';
import { ir } from '@/features/mercado/componentes';
import { color, radio } from '@/theme/tokens';

function Linea({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  return (
    <View style={estilos.linea}>
      <Texto variante="pequeno" style={{ flex: 1 }}>{etiqueta}</Texto>
      <Texto variante="etiqueta" style={{ flex: 2, textAlign: 'right' }}>{valor || '—'}</Texto>
    </View>
  );
}

/** La ficha individual de un ave: sus datos, su anillo (con historial), lo que está vinculado a ella y sus eventos de salud. */
export default function FichaAve() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { granja, recargar } = useGranja();
  const ave = granja.birds.find(a => a.id === id);
  const [numero, setNumero] = useState('');
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [tipo, setTipo] = useState('Observación');
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [fecha, setFecha] = useState(hoyTexto());

  async function hacer(trabajo: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setFallo('');
    setAviso('');
    try { await trabajo(); await recargar(); setAviso(mensaje); }
    catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo completar.'); }
    finally { setOcupado(false); setRetirando(false); }
  }

  if (!ave) {
    return (
      <Pantalla>
        <Cabecera titulo="Ficha del ave" atras />
        <ContenidoGranja><Aviso tipo="error">Esa ave ya no existe. Vuelve atrás y actualiza la lista.</Aviso></ContenidoGranja>
      </Pantalla>
    );
  }

  const anillos = granja.rings.filter(r => r.birdId === ave.id).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  const actual = anillos.find(r => r.status === 'Asignado' && !r.endedAt);
  const eventos = granja.birdEvents.filter(e => e.birdId === ave.id).sort((a, b) => b.date.localeCompare(a.date));
  const grupos = granja.breedingGroups.filter(g => g.roosterId === ave.id || g.henIds.includes(ave.id));
  const posturas = granja.eggs.filter(e => e.henId === ave.id);
  const incubaciones = granja.incubations.filter(i => i.henId === ave.id);
  const nombreDe = (idAve?: string) => granja.birds.find(a => a.id === idAve)?.name;
  const ocupados = new Set(granja.rings.filter(r => !r.endedAt && r.status !== 'Retirado').map(r => r.number));
  const puedeAnillo = !['Vendido', 'Fallecido', 'Transferido'].includes(ave.status);

  return (
    <Pantalla>
      <Cabecera titulo={ave.name} atras accion={ave.status !== 'Transferido' ? <Boton titulo="Editar" variante="secundario" icono={<Pencil size={16} color={color.greenDark} />} onPress={() => router.push(`/formulario/ave?id=${ave.id}`)} /> : undefined} />
      <ContenidoGranja>
        {ave.photo && <Image resizeMode="contain" source={{ uri: urlAbsoluta(ave.photo) }} style={{ width: 132, height: 132, borderRadius: 66, alignSelf: 'center' }} accessibilityLabel={`Foto de ${ave.name}`} />}
        <Boton titulo="Ver árbol genealógico" variante="secundario" onPress={() => router.push(`/linaje?id=${id}`)} />
        {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
        {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
        <Tarjeta>
          <View style={{ gap: 6 }}>
            <View style={estilos.chips}><Chip texto={ave.status} tono={ave.status === 'Fallecido' ? 'error' : ave.status === 'Clueca' ? 'aviso' : 'ok'} />{actual ? <Chip texto={`Anillo ${actual.number}`} tono="ok" /> : null}</View>
            <Linea etiqueta="Código" valor={ave.code} />
            <Linea etiqueta="Sexo" valor={ave.sex} />
            <Linea etiqueta="Raza" valor={ave.breed} />
            <Linea etiqueta="Nacimiento" valor={ave.bornAt ? fechaLarga(ave.bornAt) : ''} />
            <Linea etiqueta="Gallinero" valor={granja.coops.find(c => c.id === ave.coopId)?.name} />
            <Linea etiqueta="Procedencia" valor={ave.origin} />
            <Linea etiqueta="Madre" valor={nombreDe(ave.motherId) ?? 'Desconocida'} />
            <Linea etiqueta="Padre" valor={nombreDe(ave.fatherId) ?? 'Desconocido'} />
            {ave.notes ? <Texto variante="subtitulo" style={{ marginTop: 6 }}>{ave.notes}</Texto> : null}
          </View>
        </Tarjeta>

        <Tarjeta>
          <View style={{ gap: 12 }}>
            <Texto variante="seccion">Anillo</Texto>
            <Texto variante="subtitulo">{actual ? `Lleva el anillo ${actual.number} desde ${fechaLarga(actual.assignedAt)}.` : 'No tiene un anillo asignado.'} El código interno no cambia con el anillo.</Texto>
            {puedeAnillo ? (
              <>
                <Campo etiqueta={actual ? 'Cambiar por el número…' : 'Asignar el número…'} value={numero} onChangeText={t => setNumero(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="1 a 100" ayuda={numero && ocupados.has(Number(numero)) ? 'Ese número ya está en uso o fuera de uso.' : undefined} />
                <Boton titulo={actual ? 'Cambiar anillo' : 'Asignar anillo'} variante="secundario" cargando={ocupado} deshabilitado={!numero} onPress={() => void hacer(() => s.asignarAnillo(Number(numero), ave.id), `Anillo ${numero} asignado.`).then(() => setNumero(''))} />
                {actual ? <Boton titulo="Retirar el anillo actual" variante="secundario" deshabilitado={ocupado} onPress={() => setRetirando(true)} /> : null}
              </>
            ) : <Texto variante="pequeno">Un ave {ave.status.toLowerCase()} ya no recibe anillo.</Texto>}
            {anillos.length ? (
              <View style={{ gap: 4 }}>
                <Texto variante="etiqueta">Historial</Texto>
                {anillos.map(r => <Texto key={r.id} variante="pequeno">Anillo {r.number} · {r.status} · {fechaLarga(r.assignedAt)}{r.endedAt ? ` a ${fechaLarga(r.endedAt)}` : ''}</Texto>)}
              </View>
            ) : null}
          </View>
        </Tarjeta>

        <Tarjeta>
          <View style={{ gap: 12 }}>
            <Texto variante="seccion">Salud y observaciones</Texto>
            <Segmentos valor={tipo} alCambiar={setTipo} opciones={[{ valor: 'Observación', etiqueta: 'Observación' }, { valor: 'Salud', etiqueta: 'Salud' }, { valor: 'Reproductivo', etiqueta: 'Reproductivo' }]} />
            <Campo etiqueta="Título" value={titulo} onChangeText={setTitulo} placeholder="Ej. Revisión de patas" autoCapitalize="sentences" maxLength={120} />
            <Campo etiqueta="Detalle (opcional)" value={detalle} onChangeText={setDetalle} area autoCapitalize="sentences" maxLength={1000} />
            <Campo etiqueta="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" maxLength={10} accion={{ titulo: 'Hoy', alPulsar: () => setFecha(hoyTexto()) }} />
            <Boton titulo="Guardar evento" cargando={ocupado} deshabilitado={!titulo.trim()} onPress={() => void hacer(() => s.registrarEventoAve({ birdId: ave.id, kind: tipo, date: fecha, title: titulo, details: detalle }), 'Evento guardado en la ficha del ave.').then(() => { setTitulo(''); setDetalle(''); })} />
            {eventos.map(e => (
              <View key={e.id} style={estilos.evento}>
                <Texto variante="etiqueta">{e.kind} · {e.title}</Texto>
                <Texto variante="pequeno">{fechaLarga(e.date)}{e.details ? ` · ${e.details}` : ''}{e.transferredFrom ? ` · de ${e.transferredFrom}` : ''}</Texto>
              </View>
            ))}
            {eventos.length === 0 ? <Texto variante="subtitulo">Aún no hay eventos de esta ave.</Texto> : null}
            <Texto variante="pequeno">Lo que registras aquí no sustituye la evaluación de un veterinario.</Texto>
          </View>
        </Tarjeta>

        <Tarjeta>
          <View style={{ gap: 8 }}>
            <Texto variante="seccion">Actividad vinculada</Texto>
            {posturas.map(p => <Texto key={p.id} variante="cuerpo">Postura · {p.eggs} huevos · {fechaLarga(p.date)}</Texto>)}
            {incubaciones.map(i => <Texto key={i.id} variante="cuerpo">Incubación · {i.eggs} huevos · {i.status} · {fechaLarga(i.startedAt)}</Texto>)}
            {grupos.map(g => <Texto key={g.id} variante="cuerpo">Reproducción · {g.name} · {g.status}</Texto>)}
            {!posturas.length && !incubaciones.length && !grupos.length ? <Texto variante="subtitulo">Sin actividad productiva vinculada todavía.</Texto> : null}
            <Boton titulo="Publicar en el mercado" variante="secundario" onPress={() => ir('/mercado/publicar')} />
          </View>
        </Tarjeta>
      </ContenidoGranja>
      <Confirmar visible={retirando} titulo="¿Retirar el anillo?" mensaje={`El anillo ${actual?.number ?? ''} queda libre y su historial se conserva.`} textoConfirmar="Sí, retirar" cargando={ocupado} alConfirmar={() => void hacer(() => s.retirarAnillo(ave.id), 'Anillo retirado; su historial quedó conservado.')} alCancelar={() => setRetirando(false)} />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  linea: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  evento: { gap: 2, padding: 12, borderRadius: radio.sm, backgroundColor: color.fondo },
});
