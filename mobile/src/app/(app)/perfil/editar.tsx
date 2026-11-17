import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Pantalla } from '@/components/Pantalla';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { Cargado } from '@/features/mercado/componentes';
import { useDatos } from '@/features/mercado/servicio';
import { Avatar } from '@/features/social/componentes';
import * as s from '@/features/social/servicio';

export default function EditarPerfil() {
  const { datos: p, error, cargando, recargar } = useDatos(s.miPerfil);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  // Los campos se llenan una sola vez con lo guardado; después manda lo que la persona escribe.
  useEffect(() => {
    if (!p || listo) return;
    setNombre(p.displayName); setTelefono(p.contactPhone); setCiudad(p.location?.city ?? ''); setDepartamento(p.location?.region ?? '');
    setTiktok(p.social.tiktok ?? ''); setInstagram(p.social.instagram ?? ''); setYoutube(p.social.youtube ?? '');
    setListo(true);
  }, [p, listo]);

  async function cambiarFoto() {
    setFallo('');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled) return;
    setSubiendo(true);
    try {
      const asset = r.assets[0];
      const blob = await (await fetch(asset.uri)).blob();
      await s.subirFoto(blob.type ? blob : new Blob([blob], { type: asset.mimeType ?? 'image/jpeg' }), 'avatar');
      await recargar();
    } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo subir la foto.'); }
    finally { setSubiendo(false); }
  }

  async function guardar() {
    setGuardando(true);
    setFallo('');
    setAviso('');
    try {
      await s.actualizarPerfil({ displayName: nombre, contactPhone: telefono });
      await s.guardarUbicacion({ city: ciudad, region: departamento });
      await s.guardarRedes({ tiktok, instagram, youtube });
      setAviso('Cambios guardados.');
      router.back();
    } catch (e) { setFallo(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setGuardando(false); }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Editar mi perfil" atras />
      <Cargado cargando={cargando} error={error} alReintentar={() => void recargar()} hayDatos={p !== null}>
        {p ? (
          <>
            <Tarjeta>
              <View style={{ alignItems: 'center', gap: 12 }}>
                <Avatar alias={nombre || p.displayName || '?'} url={p.avatarUrl} tamano={96} />
                <Boton titulo="Cambiar foto" variante="secundario" cargando={subiendo} icono={<Camera size={18} color="#123a25" />} onPress={() => void cambiarFoto()} />
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Tus datos</Texto>
                <Campo etiqueta="Nombre público" value={nombre} onChangeText={setNombre} autoCapitalize="words" maxLength={40} ayuda="Así te ven los demás en el mercado y los chats." />
                <Campo etiqueta="Teléfono (solo se comparte con tu permiso)" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" maxLength={30} />
                <Campo etiqueta="Ciudad o municipio" value={ciudad} onChangeText={setCiudad} autoCapitalize="words" maxLength={60} ayuda="Con tu ubicación, lo que está cerca de ti aparece primero." />
                <Campo etiqueta="Departamento" value={departamento} onChangeText={setDepartamento} autoCapitalize="words" maxLength={60} />
              </View>
            </Tarjeta>
            <Tarjeta>
              <View style={{ gap: 14 }}>
                <Texto variante="seccion">Tus redes</Texto>
                <Campo etiqueta="TikTok" value={tiktok} onChangeText={setTiktok} placeholder="@tuusuario" />
                <Campo etiqueta="Instagram" value={instagram} onChangeText={setInstagram} placeholder="@tuusuario" />
                <Campo etiqueta="YouTube" value={youtube} onChangeText={setYoutube} placeholder="youtube.com/@tucanal" />
              </View>
            </Tarjeta>
            {fallo ? <Aviso tipo="error">{fallo}</Aviso> : null}
            {aviso ? <Aviso tipo="ok">{aviso}</Aviso> : null}
            <Boton titulo="Guardar cambios" cargando={guardando} onPress={() => void guardar()} />
          </>
        ) : null}
      </Cargado>
    </Pantalla>
  );
}
