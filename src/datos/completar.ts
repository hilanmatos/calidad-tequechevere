import { formato } from '../formatos';
import { camposDiferidos, dentroDeVentana } from '../motor/evaluar';
import type { Desviacion, Valores } from '../motor/tipos';
import type { Registro, Usuario } from './repositorio';

/** Lo que se envía al completar los datos del día siguiente de un registro. */
export interface Completado {
  datos: Valores;
  desviaciones: Desviacion[];
  tieneDesviacionPcc: boolean;
  /** Acción correctiva completa: la anterior más lo que se agrega. */
  accionCorrectiva?: string;
}

/** JSON con las claves ordenadas, para comparar como lo hace jsonb (sin importar el orden de las claves). */
const canonico = (v: unknown): string | undefined =>
  JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

const vacio = (v: unknown) => v === undefined || v === null;
const fechaDMA = (f: string) => f.split('-').reverse().join('/');

/**
 * Mismas reglas y mensajes que public.completar_registro (supabase/migrations/20261017000000_dia_siguiente.sql),
 * para que el modo demo se comporte igual que producción. Lanza un Error si no se puede completar.
 */
export function validarCompletar(previo: Registro | null | undefined, c: Completado, usuario: Usuario, hoy: string): asserts previo is Registro {
  if (!previo) throw new Error('El registro no existe o fue eliminado.');
  if (previo.creadoPor !== usuario.id && usuario.rol !== 'admin') {
    throw new Error('Solo quien creó el registro o un administrador puede completar sus datos del día siguiente.');
  }
  if (!dentroDeVentana(previo.fecha, hoy)) {
    throw new Error(`Pasaron más de 2 días desde el registro del ${fechaDMA(previo.fecha)}: los datos del día siguiente ya no se pueden completar. Pide la corrección a un administrador.`);
  }

  const def = formato(previo.formato);
  const diferidos = new Set(def ? camposDiferidos(def) : []);
  const claves = [...new Set([...Object.keys(previo.datos), ...Object.keys(c.datos)])].sort();
  const cambios = claves.filter((k) => canonico(previo.datos[k]) !== canonico(c.datos[k]));
  const noDiferidos = cambios.filter((k) => !diferidos.has(k));
  if (noDiferidos.length) {
    throw new Error(`Por esta vía solo se completan los datos del día siguiente. No se puede cambiar: ${noDiferidos.join(', ')}.`);
  }
  const yaMedidos = cambios.filter((k) => !vacio(previo.datos[k]));
  if (yaMedidos.length) {
    throw new Error(`Estos datos ya estaban registrados y no se cambian por esta vía: ${yaMedidos.join(', ')}. Para corregirlos, pide el cambio a un administrador.`);
  }
  if (cambios.length === 0) throw new Error('No hay datos nuevos para guardar.');

  const nuevas = new Set(c.desviaciones.map(canonico));
  if (previo.desviaciones.some((d) => !nuevas.has(canonico(d)))) {
    throw new Error('Las desviaciones ya registradas no se pueden quitar por esta vía.');
  }

  const antes = previo.accionCorrectiva ?? '';
  if (c.accionCorrectiva?.trim() && antes && !c.accionCorrectiva.startsWith(antes)) {
    throw new Error('La acción correctiva ya registrada no se puede cambiar por esta vía, solo ampliar.');
  }
}

/** El registro como queda después de completar (lo que hace el UPDATE de la función SQL). */
export function aplicarCompletar(previo: Registro, c: Completado, ahora: string): Registro {
  return {
    ...previo,
    datos: c.datos,
    desviaciones: c.desviaciones,
    tieneDesviacionPcc: previo.tieneDesviacionPcc || c.tieneDesviacionPcc || c.desviaciones.some((d) => d.severidad === 'pcc'),
    accionCorrectiva: c.accionCorrectiva?.trim() || previo.accionCorrectiva,
    actualizadoEn: ahora,
  };
}
