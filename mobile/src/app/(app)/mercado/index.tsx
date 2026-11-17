import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { FileText, MessageCircle, Package, Tag, ShoppingBag, Store, type LucideIcon } from 'lucide-react-native';
import { BotonNuevo, Cabecera } from '@/components/Cabecera';
import { Buscador } from '@/components/Buscador';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Selector } from '@/components/Selector';
import { Segmentos } from '@/components/Segmentos';
import { Texto } from '@/components/Texto';
import { Cargado, TarjetaPublicacion, ir } from '@/features/mercado/componentes';
import { explorar, useDatos } from '@/features/mercado/servicio';
import { color, fuente, radio } from '@/theme/tokens';

const atajos: { nombre: string; ruta: string; icono: LucideIcon }[] = [
  { nombre: 'Mis publicaciones', ruta: '/mercado/mias', icono: Tag },
  { nombre: 'Compras y ventas', ruta: '/mercado/operaciones', icono: Package },
  { nombre: 'Mis ofertas', ruta: '/mercado/ofertas', icono: ShoppingBag },
  { nombre: 'Mensajes', ruta: '/mercado/mensajes', icono: MessageCircle },
  { nombre: 'Facturas', ruta: '/mercado/facturas', icono: FileText },
];

export default function Mercado() {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('todas');
  const [producto, setProducto] = useState('todos');
  // La búsqueda va al servidor: se espera un instante tras la última tecla.
  useEffect(() => { const t = setTimeout(() => setBusqueda(texto.trim()), 300); return () => clearTimeout(t); }, [texto]);
  const { datos, error, cargando, recargar } = useDatos(() => explorar({ type: producto === 'todos' ? undefined : producto, q: busqueda || undefined, kind: tipo === 'todas' ? undefined : tipo }), [busqueda, tipo, producto]);

  return (
    <Pantalla>
      <Cabecera titulo="Mercado avícola" atras accion={<BotonNuevo titulo="Publicar" alPulsar={() => ir('/mercado/publicar')} />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.atajos} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {atajos.map(a => (
          <Pulsable key={a.nombre} accessibilityRole="link" accessibilityLabel={a.nombre} onPress={() => ir(a.ruta)} style={estilos.atajo}>
            <a.icono size={18} color={color.greenDark} strokeWidth={1.8} />
            <Texto style={estilos.atajoTexto}>{a.nombre}</Texto>
          </Pulsable>
        ))}
      </ScrollView>
      <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar por nombre, raza o código" />
      <Segmentos valor={tipo} alCambiar={setTipo} opciones={[{ valor: 'todas', etiqueta: 'Todo' }, { valor: 'fixed', etiqueta: 'Precio fijo' }, { valor: 'auction', etiqueta: 'Subastas' }, { valor: 'interest', etiqueta: 'Consultar precio' }]} />
      <Selector etiqueta="Producto" valor={producto} alCambiar={setProducto} opciones={[{ valor: 'todos', etiqueta: 'Todos los productos' }, { valor: 'ave', etiqueta: 'Aves' }, { valor: 'lote_aves', etiqueta: 'Lotes de aves' }, { valor: 'lote_pollitos', etiqueta: 'Pollitos' }, { valor: 'lote_huevos', etiqueta: 'Huevos' }, { valor: 'insumo', etiqueta: 'Insumos' }]} />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {datos?.items?.map((p, i) => (
          <Entrada key={p.id} indice={i}>
            <TarjetaPublicacion p={p} alPulsar={() => ir(`/mercado/${p.id}`)} />
          </Entrada>
        ))}
        {datos && !datos.items?.length ? (
          <EstadoVacio icono={Store} titulo={busqueda ? 'Nada coincide con tu búsqueda' : 'Todavía no hay publicaciones'} texto={busqueda ? 'Prueba con otra palabra o quita el filtro.' : 'Aquí encontrarás aves, huevos, pollitos e insumos de otros criadores.'} accion="Publicar en el mercado" alPulsar={() => ir('/mercado/publicar')} />
        ) : null}
      </Cargado>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  atajos: { marginHorizontal: -20, flexGrow: 0, marginBottom: 12 },
  atajo: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: radio.pildora, backgroundColor: color.mint },
  atajoTexto: { fontFamily: fuente.textoFuerte, fontSize: 14, color: color.greenDark },
});
