import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { subirFoto } from '@/features/social/servicio';
import { urlAbsoluta } from '@/api/cliente';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Entrada } from '@/components/Entrada';
import { EstadoVacio } from '@/components/EstadoVacio';
import { Pantalla } from '@/components/Pantalla';
import { Pulsable } from '@/components/Pulsable';
import { Segmentos } from '@/components/Segmentos';
import { Selector } from '@/components/Selector';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { ContenidoGranja } from '@/features/granja/ContenidoGranja';
import { useGranja } from '@/features/granja/GranjaProvider';
import { ir } from '@/features/mercado/componentes';
import { aCuerpoPublicacion, publicacionInicial, validarPublicacion, type ValoresPublicacion } from '@/features/mercado/formato';
import { crearPublicacion } from '@/features/mercado/servicio';
import { color, radio } from '@/theme/tokens';
import { Bird } from 'lucide-react-native';

const NO_PUBLICABLES = ['Vendido', 'Fallecido', 'Transferido'];

export default function Publicar() {
  const { granja } = useGranja();
  const [v, setV] = useState<ValoresPublicacion>(publicacionInicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [fotos, setFotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [subidas, setSubidas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<'publicar' | 'borrador' | null>(null);

  const cambiar = <K extends keyof ValoresPublicacion>(clave: K, valor: ValoresPublicacion[K]) => {
    setV(a => ({ ...a, [clave]: valor, ...(clave === 'itemType' ? { loteId: '', cantidad: '' } : {}) }));
    setErrores(a => { if (!(clave in a)) return a; const { [clave]: _quitado, ...resto } = a; return resto; });
  };
  const alternarAve = (id: string) => cambiar('aves', v.aves.includes(id) ? v.aves.filter(x => x !== id) : [...v.aves, id]);
  const aves = granja.birds.filter(a => !NO_PUBLICABLES.includes(a.status));
  const fuentes = {
    lote_pollitos: granja.chickLots.filter(l => l.available > 0).map(l => ({ id: l.id, available: l.available, unidad: 'pollitos', etiqueta: `${l.code} · ${l.breed} · ${l.available} disponibles` })),
    lote_huevos: granja.fertileLots.filter(l => l.available > 0).map(l => ({ id: l.id, available: l.available, unidad: 'huevos', etiqueta: `${l.code} · ${l.productType || 'Huevo fértil'} · ${l.available} disponibles` })),
    insumo: granja.customProducts.filter(p => p.available > 0).map(p => ({ id: p.id, available: p.available, unidad: p.unit, etiqueta: `${p.name} · ${p.available} ${p.unit}` })),
  };
  const lotes = v.itemType === 'ave' ? [] : fuentes[v.itemType];
  const elegido = lotes.find(l => l.id === v.loteId);
  const etiquetaFuente = v.itemType === 'insumo' ? 'Insumo del catálogo' : v.itemType === 'lote_huevos' ? 'Lote de huevos' : 'Lote de pollitos';
  const fotosAves = v.itemType === 'ave' ? [...new Set(aves.filter(a => v.aves.includes(a.id)).map(a => a.photo).filter((f): f is string => !!f))] : [];
  async function elegirFotos() {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 - fotos.length, quality: 0.8 });
      if (!resultado.canceled) setFotos(actual => [...actual, ...resultado.assets].filter((f, i, todas) => todas.findIndex(a => a.uri === f.uri) === i).slice(0, 10));
    } catch { setError('No se pudieron abrir las fotos. Inténtalo de nuevo.'); }
  }

  async function enviar(publicar: boolean) {
    const encontrados = validarPublicacion(v);
    const minimoFotos = v.itemType === 'ave' && v.aves.length > 1 ? 2 : 1;
    if (publicar && fotos.length + fotosAves.length < minimoFotos) encontrados.fotos = `Agrega al menos ${minimoFotos} foto${minimoFotos > 1 ? 's distintas' : ''} antes de publicar.`;
    if (v.itemType !== 'ave' && (!elegido || Number(v.cantidad) > elegido.available)) encontrados.cantidad = 'La cantidad supera las existencias disponibles.';
    setErrores(encontrados);
    setError('');
    if (Object.keys(encontrados).length) { setError('Revisa los datos marcados en rojo.'); return; }
    setEnviando(publicar ? 'publicar' : 'borrador');
    try {
      const photoIds: string[] = [];
      for (const foto of fotos) {
        let id = subidas[foto.uri];
        if (!id) {
          const blob = await (await fetch(foto.uri)).blob();
          id = (await subirFoto(blob.type ? blob : new Blob([blob], { type: foto.mimeType ?? 'image/jpeg' }), 'post')).id;
          setSubidas(actual => ({ ...actual, [foto.uri]: id }));
        }
        photoIds.push(id);
      }
      await crearPublicacion({ ...aCuerpoPublicacion(v, new Date(), publicar), photoIds });
      router.replace('/mercado/mias' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la publicación.');
    } finally { setEnviando(null); }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Publicar en el mercado" atras />
      <ContenidoGranja>
        {aves.length === 0 && Object.values(fuentes).every(f => f.length === 0) ? (
          <EstadoVacio icono={Bird} titulo="Primero registra tus existencias" texto="Publica aves, lotes de huevos o pollitos e insumos registrados en tu granja." accion="Ir a mi granja" alPulsar={() => ir('/granja')} />
        ) : (
          <>
            <Entrada indice={0}>
              <Tarjeta>
                <View style={{ gap: 12 }}>
                  <Texto variante="seccion">¿Qué vendes?</Texto>
                  <Segmentos valor={v.itemType} alCambiar={tipo => cambiar('itemType', tipo)} opciones={[{ valor: 'ave', etiqueta: 'Aves' }, { valor: 'lote_pollitos', etiqueta: 'Pollitos' }, { valor: 'lote_huevos', etiqueta: 'Huevos' }, { valor: 'insumo', etiqueta: 'Insumos' }]} />
                  {v.itemType !== 'ave' ? <>
                    <Selector etiqueta={etiquetaFuente} valor={v.loteId} opciones={lotes.map(l => ({ valor: l.id, etiqueta: l.etiqueta }))} alCambiar={id => cambiar('loteId', id)} error={errores.loteId} />
                    <Campo etiqueta={`Cantidad${elegido ? ` (${elegido.unidad})` : ''}`} value={v.cantidad} onChangeText={n => cambiar('cantidad', n)} keyboardType="number-pad" error={errores.cantidad} />
                    {v.loteId && Number(v.cantidad) > (lotes.find(l => l.id === v.loteId)?.available ?? 0) && <Texto variante="pequeno" style={{ color: color.error }}>La cantidad supera las existencias del lote.</Texto>}
                    {!lotes.length && <Texto variante="subtitulo">No tienes existencias disponibles de este tipo. Regístralas en Mi granja antes de publicar.</Texto>}
                  </> : <><Texto variante="subtitulo">Elige un ave, o varias para venderlas juntas como lote.</Texto>{aves.map(a => {
                    const elegida = v.aves.includes(a.id);
                    return (
                      <Pulsable key={a.id} accessibilityRole="checkbox" accessibilityState={{ checked: elegida }} accessibilityLabel={a.name} onPress={() => alternarAve(a.id)} style={[estilos.ave, elegida && estilos.aveElegida]}>
                        <View style={[estilos.casilla, elegida && { backgroundColor: color.green, borderColor: color.green }]}>{elegida ? <Check size={16} color={color.blanco} strokeWidth={2.5} /> : null}</View>
                        <View style={{ flex: 1 }}>
                          <Texto variante="etiqueta" style={{ fontSize: 15 }}>{a.name}</Texto>
                          <Texto variante="pequeno">{[a.code, a.breed, a.sex].filter(Boolean).join(' · ')}</Texto>
                        </View>
                      </Pulsable>
                    );
                  })}
                  {errores.aves ? <Texto variante="pequeno" style={{ color: color.error }}>{errores.aves}</Texto> : null}</>}
                </View>
              </Tarjeta>
            </Entrada>

            <Entrada indice={1}>
              <Tarjeta>
                <View style={{ gap: 14 }}>
                  <Texto variante="seccion">¿Cómo vendes?</Texto>
                  <Segmentos valor={v.tipoAnuncio} alCambiar={t => cambiar('tipoAnuncio', t)} opciones={[{ valor: 'fixed', etiqueta: 'Precio fijo' }, { valor: 'auction', etiqueta: 'Subasta' }, { valor: 'interest', etiqueta: 'Consultar precio' }]} />
                  {v.tipoAnuncio === 'fixed' ? <Campo etiqueta="Precio total en pesos" value={v.precio} onChangeText={t => cambiar('precio', t)} error={errores.precio} keyboardType="number-pad" placeholder="150000" /> : null}
                  {v.tipoAnuncio === 'interest' ? <Texto variante="subtitulo">Sin precio: los interesados te escriben y acuerdan contigo.</Texto> : null}
                  {v.tipoAnuncio === 'auction' ? (
                    <>
                      <Campo etiqueta="Precio inicial" value={v.precioInicial} onChangeText={t => cambiar('precioInicial', t)} error={errores.precioInicial} keyboardType="number-pad" placeholder="100000" />
                      <Campo etiqueta="Duración (horas)" value={v.horas} onChangeText={t => cambiar('horas', t)} error={errores.horas} keyboardType="number-pad" ayuda="Entre 1 hora y 30 días (720 horas)." />
                      <Campo etiqueta="Precio de reserva (opcional)" value={v.reserva} onChangeText={t => cambiar('reserva', t)} error={errores.reserva} keyboardType="number-pad" ayuda="Si la oferta más alta no lo alcanza, la subasta cierra sin venta." />
                      <Campo etiqueta="Incremento mínimo (opcional)" value={v.incremento} onChangeText={t => cambiar('incremento', t)} error={errores.incremento} keyboardType="number-pad" ayuda="Si lo dejas vacío, será el 5 % del precio inicial." />
                      <Pulsable accessibilityRole="switch" accessibilityState={{ checked: v.antiFrancotirador }} onPress={() => cambiar('antiFrancotirador', !v.antiFrancotirador)} style={estilos.ave}>
                        <View style={[estilos.casilla, v.antiFrancotirador && { backgroundColor: color.green, borderColor: color.green }]}>{v.antiFrancotirador ? <Check size={16} color={color.blanco} strokeWidth={2.5} /> : null}</View>
                        <View style={{ flex: 1 }}>
                          <Texto variante="etiqueta" style={{ fontSize: 15 }}>Alargar el cierre con ofertas de último minuto</Texto>
                          <Texto variante="pequeno">Una oferta en los últimos 5 minutos suma 5 minutos más.</Texto>
                        </View>
                      </Pulsable>
                    </>
                  ) : null}
                </View>
              </Tarjeta>
            </Entrada>

            <Entrada indice={2}>
              <Tarjeta>
                <View style={{ gap: 14 }}>
                  <Texto variante="seccion">Lo que verá el comprador</Texto>
                  <Texto variante="etiqueta">Fotos del anuncio</Texto>
                  <Texto variante="pequeno">Toda publicación necesita fotos. Los lotes de aves necesitan al menos dos imágenes distintas; también incluimos las fotos registradas de las aves seleccionadas.</Texto>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {fotosAves.map(uri => <Image resizeMode="contain" key={uri} source={{ uri: urlAbsoluta(uri) }} accessibilityLabel="Foto registrada del ave" style={{ width: 80, height: 80, borderRadius: 12 }} />)}
                    {fotos.map(foto => <View key={foto.uri} style={{ gap: 4 }}>
                      <Image resizeMode="contain" source={{ uri: foto.uri }} style={{ width: 80, height: 80, borderRadius: 12 }} />
                      <Pulsable accessibilityRole="button" accessibilityLabel="Quitar foto del anuncio" disabled={!!enviando} onPress={() => setFotos(actual => actual.filter(f => f.uri !== foto.uri))}><Texto variante="pequeno">Quitar</Texto></Pulsable>
                    </View>)}
                  </View>
                  {fotos.length < 10 && <Boton titulo="Agregar fotos" variante="secundario" deshabilitado={!!enviando} onPress={() => void elegirFotos()} />}
                  {errores.fotos && <Texto variante="pequeno" style={{ color: color.error }}>{errores.fotos}</Texto>}
                  <Campo etiqueta="Descripción" value={v.descripcion} onChangeText={t => cambiar('descripcion', t)} error={errores.descripcion} area autoCapitalize="sentences" maxLength={1200} />
                  <Campo etiqueta="Zona de entrega" value={v.zona} onChangeText={t => cambiar('zona', t)} placeholder="Medellín, Antioquia" autoCapitalize="words" maxLength={120} />
                  <Campo etiqueta="Condiciones de la venta" value={v.condiciones} onChangeText={t => cambiar('condiciones', t)} error={errores.condiciones} area autoCapitalize="sentences" maxLength={1000} ayuda="Forma de pago, entrega, garantías…" />
                  <Texto variante="pequeno">La ficha pública sale del registro seleccionado. El precio corresponde a toda la cantidad publicada. Los nombres de los padres y abuelos registrados siempre se muestran; tus notas privadas nunca.</Texto>
                </View>
              </Tarjeta>
            </Entrada>

            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            <Boton titulo="Publicar ahora" cargando={enviando === 'publicar'} deshabilitado={enviando === 'borrador'} onPress={() => void enviar(true)} />
            <Boton titulo="Guardar como borrador" variante="secundario" cargando={enviando === 'borrador'} deshabilitado={enviando === 'publicar'} onPress={() => void enviar(false)} />
          </>
        )}
      </ContenidoGranja>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  ave: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radio.sm, borderWidth: 1.5, borderColor: color.linea, backgroundColor: color.blanco },
  aveElegida: { borderColor: color.green, backgroundColor: color.okFondo },
  casilla: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: color.muted, alignItems: 'center', justifyContent: 'center' },
});
