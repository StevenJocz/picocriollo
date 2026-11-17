import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CLAVE = 'pico.refresh';

/**
 * Dónde se guarda el token de refresco. En iOS y Android va al llavero / Keystore (SecureStore).
 * En web no existe un equivalente: se usa localStorage, que cualquier script de la página puede leer. Por eso el token de
 * acceso nunca se guarda (vive en memoria) y el de refresco rota en cada uso: uno robado deja de servir en cuanto el dueño renueva.
 */
export const almacen = {
  async leer(): Promise<string | null> {
    try {
      return Platform.OS === 'web' ? (globalThis.localStorage?.getItem(CLAVE) ?? null) : await SecureStore.getItemAsync(CLAVE);
    } catch { return null; }
  },
  async guardar(valor: string): Promise<void> {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(CLAVE, valor);
      else await SecureStore.setItemAsync(CLAVE, valor);
    } catch { /* sin almacenamiento: la sesión dura lo que dure la app abierta */ }
  },
  async borrar(): Promise<void> {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.removeItem(CLAVE);
      else await SecureStore.deleteItemAsync(CLAVE);
    } catch { /* nada que borrar */ }
  },
};
