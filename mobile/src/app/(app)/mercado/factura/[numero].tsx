import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Aviso } from '@/components/Aviso';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Pantalla } from '@/components/Pantalla';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga, pesos } from '@/features/granja/calculos';
import { Cargado } from '@/features/mercado/componentes';
import { factura, useDatos } from '@/features/mercado/servicio';
import { color } from '@/theme/tokens';

function Linea({ etiqueta, valor }: { etiqueta: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Texto variante="pequeno" style={{ flex: 1 }}>{etiqueta}</Texto>
      <Texto variante="etiqueta" style={{ flex: 2, textAlign: 'right' }}>{valor}</Texto>
    </View>
  );
}

const dia = (iso?: string | null) => (iso ? fechaLarga(iso.slice(0, 10)) : '');

export default function FacturaDetalle() {
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const { datos: f, error, cargando, recargar } = useDatos(() => factura(numero), [numero]);
  return (
    <Pantalla>
      <Cabecera titulo={f?.number ?? 'Factura'} atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={f !== null}>
        {f ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip texto={f.integrity ? 'Contenido verificado' : 'Contenido alterado'} tono={f.integrity ? 'ok' : 'error'} />
              <Chip texto={f.role === 'comprador' ? 'Compra' : 'Venta'} />
            </View>
            <Tarjeta>
              <View style={{ gap: 8 }}>
                <Linea etiqueta="Vendedor" valor={f.sellerAlias} />
                <Linea etiqueta="Comprador" valor={f.buyerAlias} />
                <Linea etiqueta="Emitida" valor={dia(f.issuedAt)} />
                <Linea etiqueta="Pago" valor={f.paymentMethod ?? undefined} />
                <Linea etiqueta="Pago confirmado" valor={dia(f.paymentConfirmedAt)} />
                <Linea etiqueta="Entrega" valor={dia(f.deliveredAt)} />
                <Linea etiqueta="Recepción" valor={dia(f.receivedAt)} />
                <Linea etiqueta="Comprobante" valor={f.receiptCode} />
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 10 }}>
                <Texto variante="seccion">Detalle</Texto>
                {f.lines.map((l, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Texto variante="etiqueta" style={{ flex: 1 }}>{l.description}</Texto>
                      <Texto variante="etiqueta" style={{ fontVariant: ['tabular-nums'] }}>{pesos(l.total)}</Texto>
                    </View>
                    {l.detail.map(d => <Texto key={d} variante="pequeno">{d}</Texto>)}
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: color.linea }} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Texto variante="seccion" style={{ flex: 1 }}>Total</Texto>
                  <Texto variante="seccion" style={{ fontVariant: ['tabular-nums'] }}>{pesos(f.total)} {f.currency}</Texto>
                </View>
              </View>
            </Tarjeta>
            <Aviso tipo="ok">Documento interno de la compraventa. No es una factura electrónica de la DIAN y el pago lo declararon las partes: la plataforma no lo verifica.</Aviso>
          </>
        ) : null}
      </Cargado>
    </Pantalla>
  );
}
