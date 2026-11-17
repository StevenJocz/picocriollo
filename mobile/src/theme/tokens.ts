import { Easing } from 'react-native-reanimated';

// Tokens de DESIGN.md. Una sola fuente para iOS, Android y web.

export const color = {
  ink: '#0d1f16',
  /** Texto secundario: ≥ 4.5:1 sobre el fondo. */
  muted: '#566b5f',
  green: '#2c8c58',
  greenDark: '#123a25',
  /** Solo fondos y superficies, nunca texto. */
  mint: '#bfeed6',
  sky: '#bfe0f6',
  lilac: '#d8cffa',
  peach: '#fde2d2',
  fondo: '#f6faf8',
  blanco: '#ffffff',
  linea: 'rgba(13, 31, 22, 0.08)',
  vidrio: 'rgba(255, 255, 255, 0.66)',
  vidrioFuerte: 'rgba(255, 255, 255, 0.92)',
  bordeVidrio: 'rgba(255, 255, 255, 0.96)',
  placeholder: '#5f7468',
  error: '#a2453a',
  errorFondo: '#fff1ee',
  okTexto: '#17402a',
  okFondo: '#eaf8ef',
} as const;

export const radio = { sm: 16, md: 24, lg: 32, pildora: 999 } as const;

/** Sombras con desplazamiento y desenfoque; nunca halos sin desplazamiento. */
export const sombra = {
  suave: '0px 1px 2px rgba(13, 31, 22, 0.04), 0px 14px 34px -12px rgba(13, 31, 22, 0.16)',
  elevada: '0px 2px 4px rgba(13, 31, 22, 0.05), 0px 24px 46px -14px rgba(13, 31, 22, 0.26)',
  boton: '0px 14px 30px -10px rgba(23, 64, 42, 0.5)',
} as const;

export const gradienteVerde = ['#123a25', '#2a8052', '#52b784'] as const;

/** Salida fuerte: arranca rápido y la pantalla responde al instante. Sin ease-in ni rebotes. */
export const curva = {
  salida: Easing.bezier(0.23, 1, 0.32, 1),
  enPantalla: Easing.bezier(0.77, 0, 0.175, 1),
  hoja: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

/** Tiempos de DESIGN.md (ms). */
export const tiempo = { pulsar: 160, estado: 200, entrada: 280, escalon: 30, secuencia: 480 } as const;

export const fuente = {
  titulo: 'Manrope_800ExtraBold',
  tituloMedio: 'Manrope_700Bold',
  texto: 'DMSans_400Regular',
  textoMedio: 'DMSans_500Medium',
  textoFuerte: 'DMSans_700Bold',
} as const;
