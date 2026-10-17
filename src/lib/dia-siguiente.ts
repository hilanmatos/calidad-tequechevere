import type { Registro, Usuario } from '../datos/repositorio';
import { formato } from '../formatos';
import { dentroDeVentana, DIAS_PARA_COMPLETAR, pendientesDiferidos, sumarDias } from '../motor/evaluar';
import type { Faltante, Producto } from '../motor/tipos';
import { hoyPanama } from './fechas';

/** Último día en que se completan los datos del día siguiente de un registro de esa fecha. */
export function fechaLimite(fecha: string): string {
  return sumarDias(fecha, DIAS_PARA_COMPLETAR);
}

/** Campos del día siguiente que le faltan a un registro guardado. Lo importado del Excel no se completa en la app. */
export function pendientesDeRegistro(r: Registro, productos: Producto[] = []): Faltante[] {
  const def = formato(r.formato);
  if (!def || r.origen === 'importado') return [];
  return pendientesDiferidos(def, {
    valores: r.datos, producto: productos.find((p) => p.id === r.productoId), productos, fecha: r.fecha, area: r.area,
  });
}

/** Completar los datos del día siguiente: el creador o un administrador, hasta 2 días después de la fecha del registro. */
export function puedeCompletar(r: Registro, u: Usuario, hoy = hoyPanama()): boolean {
  return (u.rol === 'admin' || r.creadoPor === u.id) && dentroDeVentana(r.fecha, hoy);
}

/** Registros dentro de la ventana que aún tienen datos del día siguiente por llenar. */
export function porCompletar(registros: Registro[], productos: Producto[], hoy: string) {
  return registros
    .filter((r) => dentroDeVentana(r.fecha, hoy))
    .map((registro) => ({ registro, pendientes: pendientesDeRegistro(registro, productos) }))
    .filter((x) => x.pendientes.length > 0);
}
