import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { color, fuente, radio, sombra } from '@/theme/tokens';

/** Caja de búsqueda en píldora. Filtra lo que ya está en pantalla a medida que se escribe. */
export function Buscador({ valor, alCambiar, placeholder, alEnfocar, alDesenfocar }: { valor: string; alCambiar: (texto: string) => void; placeholder: string; alEnfocar?: () => void; alDesenfocar?: () => void }) {
  return (
    <View style={styles.caja}>
      <Search size={20} color={color.ink} strokeWidth={1.8} />
      <TextInput
        value={valor}
        onChangeText={alCambiar}
        onFocus={alEnfocar}
        onBlur={alDesenfocar}
        placeholder={placeholder}
        placeholderTextColor={color.placeholder}
        accessibilityLabel={placeholder}
        accessibilityRole="search"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={color.green}
        cursorColor={color.green}
        style={styles.entrada}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 18, borderRadius: radio.pildora, backgroundColor: color.blanco, borderWidth: 1, borderColor: color.linea, boxShadow: sombra.suave },
  entrada: { flex: 1, minHeight: 52, fontFamily: fuente.texto, fontSize: 16, color: color.ink, outlineStyle: 'none' } as never,
});
