import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GitBranch } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga } from '@/features/granja/calculos';
import * as s from '@/features/granja/servicio';

type Fila = Awaited<ReturnType<typeof s.trazar>>[number];

/** De dónde sale algo y qué se hizo con él: se busca por código y se muestra la cadena, del origen a lo último. */
export default function Trazabilidad() {
  const { codigo: inicial } = useLocalSearchParams<{ codigo?: string }>();
  const [codigo, setCodigo] = useState(inicial ?? '');
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  const [buscando, setBuscando] = useState(false);

  async function buscar(texto = codigo) {
    if (!texto.trim()) { setError('Escribe el código que quieres rastrear, por ejemplo VEN-0001-…'); return; }
    setBuscando(true);
    setError('');
    try { setFilas(await s.trazar(texto.trim())); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo buscar.'); } finally { setBuscando(false); }
  }

  useEffect(() => { if (inicial) void buscar(inicial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [inicial]);

  return (
    <Pantalla>
      <Cabecera titulo="Trazabilidad" atras />
      <Tarjeta>
        <View style={{ gap: 12 }}>
          <Campo etiqueta="Código" value={codigo} onChangeText={setCodigo} placeholder="AVE-0001-…, FER-…, VEN-…" autoCapitalize="characters" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => void buscar()} ayuda="Cada ave, lote, nacimiento y venta tiene un código. Aquí ves de dónde viene y qué se hizo con él." />
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Boton titulo="Rastrear" cargando={buscando} onPress={() => void buscar()} />
        </View>
      </Tarjeta>
      {filas?.map((f, i) => (
        <Entrada key={f.id} indice={Math.min(i, 8)}>
          <Tarjeta>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Chip texto={f.kind} tono={i === filas.length - 1 ? 'ok' : 'neutro'} />{f.code ? <Texto variante="pequeno">{f.code}</Texto> : null}</View>
              <Texto variante="etiqueta" style={{ fontSize: 16 }}>{f.title}</Texto>
              {f.date ? <Texto variante="pequeno">{fechaLarga(f.date)}</Texto> : null}
              {f.details ? <Texto variante="subtitulo">{f.details}</Texto> : null}
            </View>
          </Tarjeta>
        </Entrada>
      ))}
      {filas && filas.length === 0 ? <EstadoVacio icono={GitBranch} titulo="No encontramos ese código" texto="Revisa que esté completo, con sus guiones. Puedes copiarlo del recibo, del lote o de la ficha del ave." /> : null}
    </Pantalla>
  );
}
