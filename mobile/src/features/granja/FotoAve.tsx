import { useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { urlAbsoluta } from '@/api/cliente';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Texto } from '@/components/Texto';
import { subirFoto } from '@/features/social/servicio';

export function FotoAve({ valor, alCambiar }: { valor: string; alCambiar: (foto: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function elegir(camara: boolean) {
    setError('');
    setOcupado(true);
    try {
      if (camara && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Permite el acceso a la cámara para tomar la foto.');
      const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] };
      const resultado = camara ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (resultado.canceled) return;
      const foto = resultado.assets[0];
      const blob = await (await fetch(foto.uri)).blob();
      const guardada = await subirFoto(blob.type ? blob : new Blob([blob], { type: foto.mimeType ?? 'image/jpeg' }), 'bird');
      alCambiar(guardada.url);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la foto.'); }
    finally { setOcupado(false); }
  }
  return <View style={{ gap: 10 }}>
    <Texto variante="etiqueta">Foto del ave</Texto>
    {valor ? <Image source={{ uri: urlAbsoluta(valor) }} style={{ width: 132, height: 132, borderRadius: 66, alignSelf: 'center' }} accessibilityLabel="Foto de perfil del ave" /> : null}
    <Texto variante="pequeno">Esta será su foto en la ficha, el árbol familiar y las publicaciones del mercado que permitan mostrarla.</Texto>
    <Boton titulo={valor ? 'Cambiar foto' : 'Elegir foto'} variante="secundario" cargando={ocupado} onPress={() => void elegir(false)} />
    <Boton titulo="Tomar foto" variante="secundario" deshabilitado={ocupado} onPress={() => void elegir(true)} />
    {valor && <Boton titulo="Quitar foto" variante="secundario" deshabilitado={ocupado} onPress={() => alCambiar('')} />}
    {error && <Aviso tipo="error">{error}</Aviso>}
  </View>;
}
