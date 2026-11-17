import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Cabecera } from '@/components/Cabecera';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { Texto } from '@/components/Texto';
import { pesos } from '@/features/granja/calculos';
import * as s from '@/features/granja/servicio';
import { Cargado } from '@/features/mercado/componentes';
import { useDatos } from '@/features/mercado/servicio';
import { color, fuente, radio, sombra } from '@/theme/tokens';

type Periodo = 'mes' | 'anio' | 'todo';

function rango(p: Periodo): { desde?: string; hasta?: string } {
  const hoy = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  if (p === 'mes') return { desde: `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-01` };
  if (p === 'anio') return { desde: `${hoy.getFullYear()}-01-01` };
  return {};
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <View style={estilos.dato}>
      <Texto variante="pequeno">{titulo}</Texto>
      <Texto style={estilos.valor}>{valor}</Texto>
      {detalle ? <Texto variante="pequeno">{detalle}</Texto> : null}
    </View>
  );
}

export default function Reportes() {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const { datos: r, error, cargando, recargar } = useDatos(() => s.resumenComercial(rango(periodo).desde, rango(periodo).hasta), [periodo]);
  return (
    <Pantalla>
      <Cabecera titulo="Reportes" atras />
      <Segmentos<Periodo> valor={periodo} alCambiar={setPeriodo} opciones={[{ valor: 'mes', etiqueta: 'Este mes' }, { valor: 'anio', etiqueta: 'Este año' }, { valor: 'todo', etiqueta: 'Todo' }]} />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={r !== null}>
        {r ? (
          <>
            <Texto variante="seccion">Ventas</Texto>
            <View style={estilos.rejilla}>
              <Dato titulo="Ventas netas" valor={pesos(r.gross)} detalle="sin canceladas, menos devoluciones" />
              <Dato titulo="Cobrado" valor={pesos(r.paid)} />
              <Dato titulo="Por cobrar" valor={pesos(r.unpaid)} />
              <Dato titulo="Huevos vendidos" valor={String(r.eggsSold)} />
              <Dato titulo="Pollitos vendidos" valor={String(r.chicksSold)} />
              <Dato titulo="Aves vendidas" valor={String(r.adultBirdsSold)} />
            </View>
            <Texto variante="seccion">Existencias y cría</Texto>
            <View style={estilos.rejilla}>
              <Dato titulo="Huevos disponibles" valor={String(r.availableEggs)} />
              <Dato titulo="Pollitos disponibles" valor={String(r.availableChicks)} />
              <Dato titulo="Huevos incubados" valor={String(r.incubated)} detalle="desde lotes" />
              <Dato titulo="Pollitos nacidos" valor={String(r.hatched)} />
              <Dato titulo="Eclosión" valor={r.hatchRate === null || r.hatchRate === undefined ? '—' : `${Math.round(r.hatchRate * 100)} %`} detalle="nacidos entre incubados" />
            </View>
          </>
        ) : null}
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dato: { flexGrow: 1, flexBasis: '45%', gap: 2, padding: 14, borderRadius: radio.md, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  valor: { fontFamily: fuente.titulo, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: color.ink, fontVariant: ['tabular-nums'] },
});
