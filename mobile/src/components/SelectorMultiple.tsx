import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { color, radio } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

export interface OpcionMultiple { valor: string; etiqueta: string }

/** Elegir varias opciones de una lista corta (las gallinas de un grupo). El valor es la lista separada por comas, como la guardan los formularios. */
export function SelectorMultiple({ etiqueta, valor, opciones, alCambiar, error, ayuda, vacio = 'Todavía no hay opciones para elegir.' }: {
  etiqueta: string; valor: string; opciones: OpcionMultiple[]; alCambiar: (valor: string) => void; error?: string; ayuda?: string; vacio?: string;
}) {
  const elegidas = new Set(valor.split(',').map(x => x.trim()).filter(Boolean));
  const alternar = (id: string) => {
    const siguiente = new Set(elegidas);
    if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
    alCambiar([...siguiente].join(','));
  };
  return (
    <View style={estilos.grupo}>
      <Texto variante="etiqueta">{etiqueta}{elegidas.size ? ` (${elegidas.size})` : ''}</Texto>
      <View style={[estilos.caja, !!error && { borderColor: color.error }]}>
        {opciones.map(o => {
          const activa = elegidas.has(o.valor);
          return (
            <Pulsable key={o.valor} accessibilityRole="checkbox" accessibilityState={{ checked: activa }} accessibilityLabel={o.etiqueta} onPress={() => alternar(o.valor)} style={estilos.fila}>
              <View style={[estilos.casilla, activa && { backgroundColor: color.green, borderColor: color.green }]}>{activa ? <Check size={16} color={color.blanco} strokeWidth={2.5} /> : null}</View>
              <Texto style={{ flex: 1 }}>{o.etiqueta}</Texto>
            </Pulsable>
          );
        })}
        {opciones.length === 0 ? <Texto variante="subtitulo" style={{ padding: 12 }}>{vacio}</Texto> : null}
      </View>
      {error ? <Texto accessibilityLiveRegion="polite" variante="pequeno" style={{ color: color.error }}>{error}</Texto> : ayuda ? <Texto variante="pequeno">{ayuda}</Texto> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: 6 },
  caja: { borderRadius: radio.sm, backgroundColor: color.blanco, borderWidth: 1.5, borderColor: color.linea, paddingVertical: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14 },
  casilla: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: color.muted, alignItems: 'center', justifyContent: 'center' },
});
