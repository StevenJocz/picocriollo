import { Text, type TextProps, type TextStyle } from 'react-native';
import { color, fuente } from '@/theme/tokens';

export type VarianteTexto = 'hero' | 'titulo' | 'seccion' | 'subtitulo' | 'cuerpo' | 'etiqueta' | 'pequeno' | 'enlace';

// Manrope para títulos, DM Sans para texto. Sin etiquetas pequeñas sobre los títulos: el título lleva el peso.
const estilos: Record<VarianteTexto, TextStyle> = {
  hero: { fontFamily: fuente.titulo, fontSize: 56, lineHeight: 56, letterSpacing: -2, color: color.ink },
  titulo: { fontFamily: fuente.titulo, fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: color.ink },
  seccion: { fontFamily: fuente.titulo, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: color.ink },
  subtitulo: { fontFamily: fuente.texto, fontSize: 15, lineHeight: 22, color: color.muted },
  cuerpo: { fontFamily: fuente.texto, fontSize: 15, lineHeight: 22, color: color.ink },
  etiqueta: { fontFamily: fuente.textoFuerte, fontSize: 13, lineHeight: 18, color: color.ink },
  pequeno: { fontFamily: fuente.texto, fontSize: 13, lineHeight: 18, color: color.muted },
  enlace: { fontFamily: fuente.textoFuerte, fontSize: 14, lineHeight: 20, color: color.greenDark, textDecorationLine: 'underline' },
};

export function Texto({ variante = 'cuerpo', style, ...props }: TextProps & { variante?: VarianteTexto }) {
  const encabezado = variante === 'hero' || variante === 'titulo' || variante === 'seccion';
  return <Text accessibilityRole={encabezado ? 'header' : undefined} {...props} style={[estilos[variante], style]} />;
}
