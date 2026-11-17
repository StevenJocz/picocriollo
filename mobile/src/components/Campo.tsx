import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { color, fuente, radio } from '@/theme/tokens';
import { Pulsable } from './Pulsable';
import { Texto } from './Texto';

interface Props extends Omit<TextInputProps, 'style'> {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  /** Campo de contraseña: oculta el texto y ofrece mostrarlo. */
  secreto?: boolean;
  /** Varias líneas (observaciones). */
  area?: boolean;
  /** Un botón junto a la etiqueta (por ejemplo «Hoy» en las fechas). */
  accion?: { titulo: string; alPulsar: () => void };
}

/** Campo con etiqueta. Texto de 16 px (evita el zoom de iOS), foco con anillo verde y error que se anuncia a los lectores de pantalla. */
export function Campo({ etiqueta, error, ayuda, secreto = false, area = false, accion, onFocus, onBlur, ...props }: Props) {
  const [enfocado, setEnfocado] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.grupo}>
      <View style={styles.cabecera}>
        <Texto variante="etiqueta">{etiqueta}</Texto>
        {accion ? <Pulsable accessibilityRole="button" onPress={accion.alPulsar} hitSlop={8} style={styles.accion}><Texto variante="enlace">{accion.titulo}</Texto></Pulsable> : null}
      </View>
      <View style={[styles.caja, enfocado && styles.enfocada, !!error && styles.conError]}>
        <TextInput
          {...props}
          accessibilityLabel={etiqueta}
          secureTextEntry={secreto && !visible}
          multiline={area}
          textAlignVertical={area ? 'top' : 'center'}
          autoCapitalize={props.autoCapitalize ?? 'none'}
          placeholderTextColor={color.placeholder}
          selectionColor={color.green}
          cursorColor={color.green}
          onFocus={e => { setEnfocado(true); onFocus?.(e); }}
          onBlur={e => { setEnfocado(false); onBlur?.(e); }}
          style={[styles.entrada, area && styles.area]}
        />
        {secreto ? (
          <Pulsable accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setVisible(v => !v)} style={styles.ojo} hitSlop={8}>
            {visible ? <EyeOff size={20} color={color.muted} strokeWidth={1.8} /> : <Eye size={20} color={color.muted} strokeWidth={1.8} />}
          </Pulsable>
        ) : null}
      </View>
      {error ? <Texto accessibilityLiveRegion="polite" style={styles.mensajeError} variante="pequeno">{error}</Texto> : ayuda ? <Texto variante="pequeno">{ayuda}</Texto> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: 6 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accion: { minHeight: 32, justifyContent: 'center' },
  area: { minHeight: 96, paddingTop: 14, paddingBottom: 14 },
  caja: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: radio.sm, backgroundColor: color.blanco, borderWidth: 1.5, borderColor: color.linea, paddingLeft: 16, paddingRight: 8 },
  enfocada: { borderColor: color.green, boxShadow: '0px 0px 0px 4px rgba(44, 140, 88, 0.16)' },
  conError: { borderColor: color.error },
  entrada: { flex: 1, minHeight: 52, fontFamily: fuente.texto, fontSize: 16, color: color.ink, outlineStyle: 'none' } as never,
  ojo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mensajeError: { color: color.error },
});
