import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, mensajeDeError, SIN_CONEXION } from '@/api/cliente';
import { granjaVacia, normalizarGranja, type Granja } from './modelos';

type Estado = 'cargando' | 'listo' | 'error';

interface ContextoGranja {
  estado: Estado;
  error: string;
  granja: Granja;
  version: number;
  recargar(): Promise<void>;
}

const Contexto = createContext<ContextoGranja | null>(null);

export function useGranja(): ContextoGranja {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useGranja se usa dentro de <GranjaProvider>.');
  return valor;
}

/**
 * La granja entera de la persona, leída una vez y refrescada después de cada cambio. Las listas de todas las pantallas salen de
 * aquí; los cambios van por la API (que valida) y luego se vuelve a leer, así lo que se ve es siempre lo que quedó guardado.
 */
export function GranjaProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [error, setError] = useState('');
  const [granja, setGranja] = useState<Granja>(granjaVacia);
  const [version, setVersion] = useState(0);

  const recargar = useCallback(async () => {
    try {
      const { data, error: fallo, response } = await api.GET('/api/granja');
      if (!response.ok || !data) throw new Error(mensajeDeError(fallo, 'No se pudo cargar tu granja.'));
      setGranja(normalizarGranja(data.datos));
      setVersion(Number(data.version ?? 0));
      setError('');
      setEstado('listo');
    } catch (e) {
      // Si ya había datos se conservan en pantalla; solo se avisa del fallo.
      setError(e instanceof TypeError ? SIN_CONEXION : e instanceof Error ? e.message : 'No se pudo cargar tu granja.');
      setEstado(actual => (actual === 'listo' ? 'listo' : 'error'));
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  const valor = useMemo(() => ({ estado, error, granja, version, recargar }), [estado, error, granja, version, recargar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
