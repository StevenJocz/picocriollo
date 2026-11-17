import { FotoAve } from './FotoAve';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Aviso } from '@/components/Aviso';
import { Boton } from '@/components/Boton';
import { Cabecera } from '@/components/Cabecera';
import { Campo } from '@/components/Campo';
import { Confirmar } from '@/components/Confirmar';
import { Entrada } from '@/components/Entrada';
import { Pantalla } from '@/components/Pantalla';
import { Selector } from '@/components/Selector';
import { SelectorMultiple } from '@/components/SelectorMultiple';
import { Tarjeta } from '@/components/Tarjeta';
import { Texto } from '@/components/Texto';
import { hoyTexto } from './calculos';
import { ContenidoGranja } from './ContenidoGranja';
import { MODULOS, aCuerpo, opcionesDe, validar, valoresIniciales, type CampoDef, type Valores } from './formularios';
import { useGranja } from './GranjaProvider';
import { actualizar, crear, eliminar, type Modulo } from './servicio';

const vuelta = () => (router.canGoBack() ? router.back() : router.replace('/inicio'));

/** El formulario de cualquier módulo de la granja, dibujado a partir de su definición en formularios.ts. */
export function FormularioRegistro({ modulo, id }: { modulo: Modulo; id?: string }) {
  const def = MODULOS[modulo];
  const { granja, estado, recargar } = useGranja();
  const fila = id ? (granja[def.lista] as { id: string }[]).find(r => r.id === id) : undefined;
  const [valores, setValores] = useState<Valores | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  // Los valores iniciales se arman una sola vez, cuando la granja ya cargó (así la edición muestra lo guardado).
  useEffect(() => {
    if (valores === null && estado === 'listo' && (!id || fila)) setValores(valoresIniciales(def, fila));
  }, [valores, estado, id, fila, def]);

  const cambiar = (clave: string, valor: string) => {
    setValores(actuales => ({ ...(actuales ?? {}), [clave]: valor }));
    setErrores(actuales => { if (!(clave in actuales)) return actuales; const { [clave]: _quitado, ...resto } = actuales; return resto; });
  };

  async function guardar() {
    if (!valores) return;
    const encontrados = validar(def, valores);
    setErrores(encontrados);
    setError('');
    if (Object.keys(encontrados).length) { setError('Revisa los datos marcados en rojo.'); return; }
    setGuardando(true);
    try {
      const cuerpo = aCuerpo(def, valores);
      if (id && !def.soloCrear) await actualizar(modulo as Exclude<Modulo, 'consumo'>, id, cuerpo);
      else await crear(modulo, cuerpo);
      await recargar();
      vuelta();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally { setGuardando(false); }
  }

  async function borrar() {
    if (!id) return;
    setEliminando(true);
    try {
      await eliminar(modulo as Exclude<Modulo, 'consumo'>, id);
      await recargar();
      setConfirmando(false);
      vuelta();
    } catch (e) {
      setConfirmando(false);
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally { setEliminando(false); }
  }

  const titulo = id ? `Editar ${def.singular}` : def.nuevo;

  return (
    <Pantalla>
      <Cabecera titulo={titulo} atras />
      <ContenidoGranja>
        {id && estado === 'listo' && !fila ? (
          <Aviso tipo="error">Ese registro ya no existe. Vuelve atrás y actualiza la lista.</Aviso>
        ) : valores ? (
          <Entrada indice={0}>
            <Tarjeta>
              <View style={styles.campos}>
                {def.campos.filter(c => !c.visible || c.visible(valores)).map(c => (
                  <CampoDeFormulario key={c.clave} campo={c} valor={valores[c.clave] ?? ''} error={errores[c.clave]} alCambiar={v => cambiar(c.clave, v)} granja={granja} />
                ))}
                {error ? <Aviso tipo="error">{error}</Aviso> : null}
                <Boton titulo={id && !def.soloCrear ? 'Guardar cambios' : 'Guardar'} onPress={() => void guardar()} cargando={guardando} />
                {id && !def.soloCrear ? <Boton titulo={`Eliminar ${def.singular}`} variante="secundario" deshabilitado={guardando} onPress={() => setConfirmando(true)} /> : null}
              </View>
            </Tarjeta>
          </Entrada>
        ) : null}
      </ContenidoGranja>
      <Confirmar
        visible={confirmando}
        titulo={`¿Eliminar este ${def.singular}?`}
        mensaje="Esta acción no se puede deshacer. Si el registro tiene historial o está en uso, el servidor te lo dirá."
        textoConfirmar="Sí, eliminar"
        cargando={eliminando}
        alConfirmar={() => void borrar()}
        alCancelar={() => setConfirmando(false)}
      />
      {!valores && estado === 'listo' && !id ? <Texto variante="pequeno">Preparando el formulario…</Texto> : null}
    </Pantalla>
  );
}

function CampoDeFormulario({ campo, valor, error, alCambiar, granja }: { campo: CampoDef; valor: string; error?: string; alCambiar: (v: string) => void; granja: ReturnType<typeof useGranja>['granja'] }) {
  const etiqueta = campo.etiqueta + (campo.requerido ? '' : '');
  switch (campo.tipo) {
    case 'foto': return <FotoAve valor={valor} alCambiar={alCambiar} />;
    case 'opcion':
      return <Selector etiqueta={etiqueta} valor={valor} alCambiar={alCambiar} error={error} ayuda={campo.ayuda} opcional={!campo.requerido} opciones={(campo.opciones ?? []).map(o => ({ valor: o, etiqueta: o }))} />;
    case 'referencia':
      return <Selector etiqueta={etiqueta} valor={valor} alCambiar={alCambiar} error={error} ayuda={campo.ayuda} opcional={!campo.requerido} opciones={campo.lista ? opcionesDe(campo.lista, granja).map(o => ({ valor: o.valor, etiqueta: o.etiqueta })) : []} vacio={campo.lista === 'coops' ? 'Primero crea un gallinero.' : campo.lista === 'incubaciones' ? 'Primero registra una incubación.' : campo.lista === 'stock' ? 'Primero registra una compra: así aparece el producto.' : 'Todavía no hay aves para elegir.'} />;
    case 'multiple':
      return <SelectorMultiple etiqueta={etiqueta} valor={valor} alCambiar={alCambiar} error={error} ayuda={campo.ayuda} opciones={campo.lista ? opcionesDe(campo.lista, granja).map(o => ({ valor: o.valor, etiqueta: o.etiqueta })) : []} vacio="Todavía no hay gallinas registradas." />;
    case 'fecha':
      return <Campo etiqueta={etiqueta} value={valor} onChangeText={alCambiar} error={error} ayuda={campo.ayuda} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} accion={{ titulo: 'Hoy', alPulsar: () => alCambiar(hoyTexto()) }} />;
    case 'entero':
      return <Campo etiqueta={etiqueta} value={valor} onChangeText={alCambiar} error={error} ayuda={campo.ayuda} keyboardType={campo.minimo !== undefined && campo.minimo < 0 ? 'numbers-and-punctuation' : 'number-pad'} placeholder="0" maxLength={9} />;
    case 'decimal':
      return <Campo etiqueta={etiqueta} value={valor} onChangeText={alCambiar} error={error} ayuda={campo.ayuda} keyboardType="decimal-pad" placeholder="0" maxLength={12} />;
    case 'area':
      return <Campo etiqueta={etiqueta} value={valor} onChangeText={alCambiar} error={error} ayuda={campo.ayuda} area autoCapitalize="sentences" maxLength={1000} />;
    default:
      return <Campo etiqueta={etiqueta} value={valor} onChangeText={alCambiar} error={error} ayuda={campo.ayuda} autoCapitalize="sentences" placeholder={campo.placeholder} maxLength={120} />;
  }
}

const styles = StyleSheet.create({
  campos: { gap: 16 },
});
