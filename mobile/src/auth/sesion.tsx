import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, conectarSesion, mensajeDeError, SIN_CONEXION, type InicioRespuesta, type Usuario } from '@/api/cliente';
import { almacen } from './almacen';

export type EstadoSesion = 'cargando' | 'autenticado' | 'anonimo';

export interface DatosRegistro { correo: string; password: string; nombreUsuario: string; ciudad?: string }

interface Sesion {
  estado: EstadoSesion;
  usuario: Usuario | null;
  ingresar(correo: string, password: string): Promise<void>;
  registrar(datos: DatosRegistro): Promise<void>;
  salir(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

export function useSesion(): Sesion {
  const sesion = useContext(Contexto);
  if (!sesion) throw new Error('useSesion se usa dentro de <ProveedorSesion>.');
  return sesion;
}

/** Ejecuta una llamada a la API y la convierte en datos o en un Error con un mensaje para la persona. */
async function pedir<T>(llamada: () => Promise<{ data?: T; error?: unknown; response: Response }>, porDefecto?: string): Promise<T> {
  let resultado;
  try { resultado = await llamada(); } catch { throw new Error(SIN_CONEXION); }
  if (!resultado.response.ok || resultado.data === undefined) throw new Error(mensajeDeError(resultado.error, porDefecto));
  return resultado.data;
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>('cargando');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  // El token de acceso vive solo en memoria; el de refresco se guarda en el almacén seguro.
  const acceso = useRef<string | null>(null);
  const refresco = useRef<string | null>(null);
  const renovando = useRef<Promise<string | null> | null>(null);

  const aplicar = useCallback(async (datos: InicioRespuesta) => {
    acceso.current = datos.token ?? null;
    refresco.current = datos.refreshToken ?? null;
    if (datos.refreshToken) await almacen.guardar(datos.refreshToken);
    setUsuario(datos.datos ?? null);
    setEstado('autenticado');
  }, []);

  const cerrarLocal = useCallback(async () => {
    acceso.current = null;
    refresco.current = null;
    await almacen.borrar();
    setUsuario(null);
    setEstado('anonimo');
  }, []);

  // Una sola renovación a la vez: varias peticiones con 401 comparten el mismo intento (el refresco rota y no se puede usar dos veces).
  const renovar = useCallback((): Promise<string | null> => {
    if (renovando.current) return renovando.current;
    const intento = (async () => {
      const guardado = refresco.current ?? (await almacen.leer());
      if (!guardado) return null;
      try {
        const { data, response } = await api.POST('/api/auth/refrescar', { body: { refreshToken: guardado } });
        if (response.ok && data?.token) { await aplicar(data); return data.token; }
        // Solo un 401 significa que la sesión ya no sirve; un 500 o la falta de red no deben cerrarla.
        if (response.status === 401) await cerrarLocal();
        return null;
      } catch { return null; }
    })().finally(() => { renovando.current = null; });
    renovando.current = intento;
    return intento;
  }, [aplicar, cerrarLocal]);

  useEffect(() => {
    conectarSesion({ tokenDeAcceso: () => acceso.current, renovar });
    let vivo = true;
    void renovar().then(token => { if (vivo && !token) setEstado('anonimo'); });
    return () => { vivo = false; };
  }, [renovar]);

  const valor = useMemo<Sesion>(() => ({
    estado,
    usuario,
    async ingresar(correo, password) {
      await aplicar(await pedir(() => api.POST('/api/auth/login', { body: { correo, password } })));
    },
    async registrar(datos) {
      await aplicar(await pedir(() => api.POST('/api/auth/registro', { body: { ...datos, ciudad: datos.ciudad?.trim() || null } })));
    },
    async salir() {
      const guardado = refresco.current;
      if (guardado) { try { await api.POST('/api/auth/salir', { body: { refreshToken: guardado } }); } catch { /* sin red: igual se cierra aquí */ } }
      await cerrarLocal();
    },
  }), [estado, usuario, aplicar, cerrarLocal]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export { pedir };
