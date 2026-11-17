import { Platform } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { mensajeDeError } from '@/api/cliente';
import { registrarDispositivo } from '@/features/social/servicio';
import { rutaDeAviso } from './rutas';

export type ResultadoPush = { ok: true } | { ok: false; motivo: string };

// Con la app abierta, el aviso se muestra igual (la bandeja ya lo tiene guardado).
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

/** Pide permiso, obtiene el token de Expo de este teléfono y se lo da a la API. Solo en iOS y Android: la web no recibe push móvil. */
export async function activarPush(): Promise<ResultadoPush> {
  if (Platform.OS === 'web') return { ok: false, motivo: 'Los avisos en el teléfono funcionan en la app de iOS o Android.' };
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Avisos', importance: Notifications.AndroidImportance.DEFAULT });
    let permiso = (await Notifications.getPermissionsAsync()).status;
    if (permiso !== 'granted') permiso = (await Notifications.requestPermissionsAsync()).status;
    if (permiso !== 'granted') return { ok: false, motivo: 'Permitir las notificaciones en los ajustes del teléfono para recibir avisos.' };
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, motivo: 'Falta configurar el proyecto de Expo (EAS) para recibir avisos push.' };
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registrarDispositivo(data, Platform.OS);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error && e.message ? e.message : mensajeDeError(e, 'No se pudo activar los avisos en este teléfono.') };
  }
}

/** Al tocar un aviso push, abre la pantalla que le corresponde. */
export function useAbrirAvisoPush() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const suscripcion = Notifications.addNotificationResponseReceivedListener(respuesta => {
      const datos = respuesta.notification.request.content.data as { view?: string; id?: string | null } | undefined;
      if (datos?.view) router.push(rutaDeAviso(datos.view, datos.id) as never);
    });
    return () => suscripcion.remove();
  }, []);
}
