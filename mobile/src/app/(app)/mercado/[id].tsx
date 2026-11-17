import { urlAbsoluta } from '@/api/cliente';
import { ArbolLinaje } from '@/features/mercado/ArbolLinaje';
import { Denunciar } from '@/features/moderacion/Denunciar';
import { useRef, useState } from 'react';
import { Galeria } from '@/features/mercado/Galeria';
import { fotosPublicacion } from '@/features/mercado/fotos';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Bird } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Chip } from '@/components/Chip';
import { Entrada } from '@/components/Entrada';
import { Pantalla } from '@/components/Pantalla';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { fechaLarga, pesos } from '@/features/granja/calculos';
import { Cargado, ModalCampo, ir } from '@/features/mercado/componentes';
import { TIPO_PUBLICACION, aPesos, estadoPublicacion, tiempoRestante } from '@/features/mercado/formato';
import { claveDeOferta, detalle, enviarMensaje, mostrarInteres, ofertar, retirarInteres, solicitarCompra, useDatos } from '@/features/mercado/servicio';
import { color, fuente, radio, sombra } from '@/theme/tokens';

type Ventana = null | 'compra' | 'oferta' | 'mensaje' | 'interes';
type Ancestro = { name: string; code: string; breed: string; mother?: Ancestro | null; father?: Ancestro | null } | null | undefined;

function Linea({ etiqueta, valor }: { etiqueta: string; valor?: string | number | null }) {
  if (valor === undefined || valor === null || valor === '') return null;
  return (
    <View style={estilos.linea}>
      <Texto variante="pequeno" style={{ flex: 1 }}>{etiqueta}</Texto>
      <Texto variante="etiqueta" style={{ flex: 2, textAlign: 'right' }}>{valor}</Texto>
    </View>
  );
}

const nombreDe = (a: Ancestro) => (a ? `${a.name}${a.breed ? ` (${a.breed})` : ''}` : undefined);

export default function DetalleMercado() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { datos, error, cargando, recargar } = useDatos(() => detalle(id), [id]);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [valor, setValor] = useState('');
  const [fallo, setFallo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState('');
  // Un intento de oferta = una clave; si se repite por un corte de red, la API devuelve la misma oferta.
  const clave = useRef(claveDeOferta());

  const abrir = (v: Exclude<Ventana, null>, inicial = '') => { setValor(inicial); setFallo(''); setVentana(v); };
  const cerrar = () => setVentana(null);

  async function confirmar() {
    if (!datos) return;
    setTrabajando(true);
    setFallo('');
    try {
      if (ventana === 'compra') { await solicitarCompra(id, valor.trim()); setAviso('Solicitud enviada. El vendedor debe aceptarla.'); }
      else if (ventana === 'interes') { await mostrarInteres(id, valor.trim()); setAviso('Listo: el vendedor verá que te interesa.'); }
      else if (ventana === 'oferta') {
        const monto = aPesos(valor);
        if (monto === null || Number.isNaN(monto) || monto <= 0) throw new Error('Escribe el importe de tu oferta en pesos.');
        await ofertar(id, monto, clave.current);
        clave.current = claveDeOferta();
        setAviso('Oferta enviada. Es vinculante: si ganas, debes cumplirla.');
      } else if (ventana === 'mensaje') {
        const r = await enviarMensaje({ listingId: id, body: valor });
        cerrar();
        ir(`/mercado/chat/${r.threadId}`);
        return;
      }
      cerrar();
      await recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally { setTrabajando(false); }
  }

  async function quitarInteres() {
    setTrabajando(true);
    try { await retirarInteres(id); await recargar(); } catch (e) { setAviso(e instanceof Error ? e.message : 'No se pudo quitar tu interés.'); } finally { setTrabajando(false); }
  }

  const p = datos?.listing;
  const v = datos?.viewer;
  const f = p?.snapshot;
  const subasta = p?.auction;
  const abiertaParaOfertar = subasta?.phase === 'abierta' && p?.status === 'publicada';

  return (
    <Pantalla>
      <Cabecera titulo={f ? (f.title ?? f.name) : 'Publicación'} atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={datos !== null}>
        {p && f && v ? (
          <>
            {!v.isOwner && <Denunciar tipo="listing" id={id} />}
            <Entrada indice={0}>
              {fotosPublicacion(f).length ? <Galeria fotos={fotosPublicacion(f)} /> : <View style={estilos.foto}><Bird size={56} color={color.greenDark} strokeWidth={1.4} /></View>}
            </Entrada>
            <Entrada indice={1}>
              <Tarjeta>
                <View style={{ gap: 10 }}>
                  <View style={estilos.chips}>
                    <Chip texto={TIPO_PUBLICACION[p.kind] ?? p.kind} />
                    <Chip texto={estadoPublicacion(p.status).texto} tono={estadoPublicacion(p.status).tono} />
                    {v.isTopBidder ? <Chip texto="Vas ganando" tono="ok" /> : null}
                  </View>
                  <Texto style={estilos.precio}>{p.kind === 'interest' ? 'Precio a convenir' : pesos(subasta ? subasta.currentPrice : p.price)}</Texto>
                  {subasta ? (
                    <View style={{ gap: 2 }}>
                      <Texto variante="subtitulo">{subasta.bidCount} {subasta.bidCount === 1 ? 'oferta' : 'ofertas'} · {abiertaParaOfertar ? `cierra en ${tiempoRestante(p.closesAt, new Date())}` : subasta.phase === 'programada' ? 'aún no abre' : 'cerrada'}</Texto>
                      {abiertaParaOfertar ? <Texto variante="subtitulo">Próxima oferta mínima: {pesos(subasta.minNextBid)}{subasta.hasReserve ? ' · con precio de reserva' : ''}</Texto> : null}
                    </View>
                  ) : null}
                  {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
                </View>
              </Tarjeta>
            </Entrada>

            {!v.isOwner && p.status === 'publicada' ? (
              <Entrada indice={2}>
                <View style={{ gap: 10 }}>
                  {v.operationId ? <Boton titulo="Ver mi operación" onPress={() => ir('/mercado/operaciones')} /> : null}
                  {!v.operationId && p.kind === 'fixed' ? <Boton titulo="Pedir comprar" onPress={() => abrir('compra')} /> : null}
                  {abiertaParaOfertar && !v.isTopBidder ? <Boton titulo="Ofertar" onPress={() => abrir('oferta', String(subasta!.minNextBid))} /> : null}
                  <Boton titulo="Escribir al vendedor" variante="secundario" onPress={() => (v.threadId ? ir(`/mercado/chat/${v.threadId}`) : abrir('mensaje'))} />
                  {p.kind !== 'auction' ? (v.hasInterest ? <Boton titulo="Quitar mi interés" variante="secundario" cargando={trabajando} onPress={() => void quitarInteres()} /> : <Boton titulo="Me interesa" variante="secundario" onPress={() => abrir('interes')} />) : null}
                </View>
              </Entrada>
            ) : null}
            {v.isOwner ? <Aviso tipo="ok">Esta publicación es tuya. Adminístrala desde «Mis publicaciones».</Aviso> : null}

            <Entrada indice={3}>
              <Tarjeta>
                <View style={{ gap: 4 }}>
                  <Texto variante="seccion" style={{ marginBottom: 6 }}>{!f.itemType || f.itemType === 'ave' ? 'Ficha del ave' : 'Ficha de la publicación'}</Texto>
                  <Linea etiqueta="Nombre" valor={f.name} />
                  <Linea etiqueta="Código" valor={f.code} />
                  <Linea etiqueta={f.itemType === 'insumo' ? 'Categoría' : 'Raza'} valor={f.breed} />
                  <Linea etiqueta="Cantidad publicada" valor={f.quantity} />
                  <Linea etiqueta="Fertilidad declarada" valor={f.fertility} />
                  <Linea etiqueta="Sexo" valor={f.sex} />
                  <Linea etiqueta="Edad" valor={f.ageLabel} />
                  <Linea etiqueta="Nacimiento" valor={f.bornAt ? fechaLarga(f.bornAt) : ''} />
                  <Linea etiqueta="Anillo" valor={f.ring} />
                  <Linea etiqueta="Criador" valor={f.breeder} />
                  <Linea etiqueta="Zona de entrega" valor={f.deliveryZone} />
                  <Linea etiqueta="Madre" valor={nombreDe(f.genealogy?.mother as Ancestro)} />
                  <Linea etiqueta="Padre" valor={nombreDe(f.genealogy?.father as Ancestro)} />
                  <Linea etiqueta="Descendientes" valor={f.offspringCount} />
                  {f.lotBirds?.map(a => <Linea key={a.code || a.name} etiqueta={a.sex} valor={`${a.name} · ${a.breed}`} />)}
                  {f.description ? <Texto variante="cuerpo" style={{ marginTop: 8 }}>{f.description}</Texto> : null}
                  {f.healthNote ? <Texto variante="subtitulo">Salud: {f.healthNote}</Texto> : null}
                  <Texto variante="pequeno" style={{ marginTop: 8 }}>Datos declarados por el vendedor; la plataforma no los verifica.</Texto>
                </View>
              </Tarjeta>
            </Entrada>

            {(!f.itemType || f.itemType === 'ave') && <ArbolLinaje key={p.id} ficha={f} />}

            {p.terms ? (
              <Tarjeta>
                <View style={{ gap: 6 }}>
                  <Texto variante="seccion">Condiciones</Texto>
                  <Texto variante="cuerpo">{p.terms}</Texto>
                </View>
              </Tarjeta>
            ) : null}

            <Tarjeta>
              <View style={{ gap: 4 }}>
                <Texto variante="seccion">Vendedor</Texto>
                <Texto variante="cuerpo">{p.sellerAlias}</Texto>
                <Texto variante="pequeno">
                  {p.sellerReputation && p.sellerReputation.count > 0 ? `${p.sellerReputation.average.toFixed(1)} ★ de ${p.sellerReputation.count} valoraciones · ` : 'Sin valoraciones todavía · '}
                  {p.sellerReputation?.completed ?? 0} ventas completadas
                </Texto>
              </View>
            </Tarjeta>

            {datos!.bids?.length ? (
              <Tarjeta>
                <View style={{ gap: 8 }}>
                  <Texto variante="seccion">Ofertas</Texto>
                  {datos!.bids.map((o, i) => (
                    <View key={`${o.placedAt}-${i}`} style={estilos.linea}>
                      <Texto variante="cuerpo" style={{ flex: 1 }}>{o.alias}{o.mine ? ' (tú)' : ''}</Texto>
                      <Texto variante="etiqueta" style={{ fontVariant: ['tabular-nums'] }}>{pesos(o.amount)}</Texto>
                    </View>
                  ))}
                </View>
              </Tarjeta>
            ) : null}
          </>
        ) : null}
      </Cargado>

      <ModalCampo
        visible={ventana === 'compra'} titulo="Pedir comprar" mensaje="El vendedor decidirá si acepta. Aún no se paga ni se reserva nada." etiqueta="Mensaje para el vendedor (opcional)" valor={valor} alCambiar={setValor}
        textoConfirmar="Enviar solicitud" area cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={cerrar}
      />
      <ModalCampo
        visible={ventana === 'interes'} titulo="Me interesa" mensaje="El vendedor verá tu interés y podrá escribirte." etiqueta="Mensaje (opcional)" valor={valor} alCambiar={setValor}
        textoConfirmar="Avisar al vendedor" area cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={cerrar}
      />
      <ModalCampo
        visible={ventana === 'oferta'} titulo="Hacer una oferta" mensaje={subasta ? `Debe ser de al menos ${pesos(subasta.minNextBid)}. Una oferta es vinculante.` : undefined} etiqueta="Tu oferta en pesos" valor={valor} alCambiar={setValor}
        textoConfirmar="Ofertar" teclado="number-pad" cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={cerrar}
      />
      <ModalCampo
        visible={ventana === 'mensaje'} titulo="Escribir al vendedor" mensaje="No compartas teléfono ni correo hasta que la operación esté aceptada." etiqueta="Tu mensaje" valor={valor} alCambiar={setValor}
        textoConfirmar="Enviar" area cargando={trabajando} error={fallo} alConfirmar={() => void confirmar()} alCancelar={cerrar}
      />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  foto: { height: 220, borderRadius: radio.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: color.okFondo, boxShadow: sombra.suave },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  precio: { fontFamily: fuente.titulo, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: color.greenDark, fontVariant: ['tabular-nums'] },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
});
