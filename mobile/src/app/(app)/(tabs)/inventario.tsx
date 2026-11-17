import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Minus, Package } from 'lucide-react-native';
import { Boton } from '@/components/Boton';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Segmentos } from '@/components/Segmentos';
import { TarjetaFila } from '@/components/TarjetaFila';
import { Texto } from '@/components/Texto';
import { fechaLarga, numero, pesos } from '@/features/granja/calculos';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { color, fuente } from '@/theme/tokens';

type Vista = 'existencias' | 'compras' | 'movimientos';

export default function Inventario() {
  const { granja } = useGranja();
  const [vista, setVista] = useState<Vista>('existencias');
  const compras = [...granja.purchases].sort((a, b) => b.date.localeCompare(a.date));
  const movimientos = granja.movements;   // la API inserta los más nuevos primero

  return (
    <Pantalla barra>
      <Cabecera titulo="Inventario" accion={<BotonNuevo titulo="Compra" alPulsar={() => router.push('/formulario/compra')} />} />
      <ContenidoGranja>
        <Segmentos<Vista> valor={vista} alCambiar={setVista} opciones={[{ valor: 'existencias', etiqueta: 'Existencias' }, { valor: 'compras', etiqueta: 'Compras' }, { valor: 'movimientos', etiqueta: 'Movimientos' }]} />

        {vista === 'existencias' ? (
          <>
            {granja.stock.length ? <Boton titulo="Registrar consumo" variante="secundario" icono={<Minus size={20} color={color.greenDark} strokeWidth={1.8} />} onPress={() => router.push('/formulario/consumo')} /> : null}
            {granja.stock.map((s, i) => (
              <Entrada key={s.id} indice={i}>
                <TarjetaFila
                  titulo={s.product}
                  detalle={`${s.category ?? 'Sin categoría'} · mínimo ${numero(s.minimum)} ${s.unit}`}
                  derecha={<View style={styles.cantidad}><Texto style={styles.numero}>{numero(s.quantity)}</Texto><Texto variante="pequeno">{s.unit}</Texto></View>}
                  pie={s.quantity <= s.minimum ? <Chip texto="Reponer" tono="error" /> : undefined}
                />
              </Entrada>
            ))}
            {granja.stock.length === 0 ? <EstadoVacio icono={Package} tono="gris" titulo="Tu inventario está vacío" texto="Cada compra suma sus existencias aquí. Registra la primera y luego anota lo que consumes." accion="Registrar una compra" alPulsar={() => router.push('/formulario/compra')} /> : null}
          </>
        ) : null}

        {vista === 'compras' ? (
          <>
            {compras.map((c, i) => (
              <Entrada key={c.id} indice={i}>
                <TarjetaFila
                  titulo={c.product}
                  detalle={`${fechaLarga(c.date)}${c.supplier ? ` · ${c.supplier}` : ''}`}
                  derecha={<View style={styles.cantidad}><Texto style={styles.total}>{pesos(c.quantity * c.unitPrice)}</Texto><Texto variante="pequeno">{numero(c.quantity)} {c.unit ?? ''}</Texto></View>}
                  alPulsar={() => router.push(`/formulario/compra?id=${c.id}`)}
                />
              </Entrada>
            ))}
            {compras.length === 0 ? <EstadoVacio icono={Package} tono="gris" titulo="Aún no registras compras" texto="Anota lo que compras para llevar tus gastos y tus existencias." accion="Registrar una compra" alPulsar={() => router.push('/formulario/compra')} /> : null}
          </>
        ) : null}

        {vista === 'movimientos' ? (
          <>
            {movimientos.map((m, i) => (
              <Entrada key={m.id} indice={Math.min(i, 4)}>
                <TarjetaFila
                  titulo={granja.stock.find(s => s.id === m.stockId)?.product ?? 'Producto'}
                  detalle={`${fechaLarga(m.date)}${m.notes ? ` · ${m.notes}` : ''}`}
                  derecha={<View style={styles.cantidad}><Texto style={styles.numero}>{m.kind === 'Consumo' ? '−' : m.quantity < 0 ? '' : '+'}{numero(Math.abs(m.quantity))}</Texto><Chip texto={m.kind} tono={m.kind === 'Compra' ? 'ok' : m.kind === 'Consumo' ? 'aviso' : 'neutro'} /></View>}
                />
              </Entrada>
            ))}
            {movimientos.length === 0 ? <Texto variante="subtitulo">Todavía no hay movimientos. Aparecen al registrar compras y consumos.</Texto> : null}
          </>
        ) : null}
      </ContenidoGranja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  cantidad: { alignItems: 'flex-end', gap: 2 },
  numero: { fontFamily: fuente.titulo, fontSize: 22, lineHeight: 26, color: color.ink, fontVariant: ['tabular-nums'] },
  total: { fontFamily: fuente.tituloMedio, fontSize: 16, lineHeight: 22, color: color.greenDark, fontVariant: ['tabular-nums'] },
});
