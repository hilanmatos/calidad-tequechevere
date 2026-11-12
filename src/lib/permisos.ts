import type { Rol, Usuario } from '../datos/repositorio';
import type { Operario } from '../motor/tipos';

export type PestanaAdmin = 'productos' | 'operarios' | 'usuarios';

/** Pestañas de Administración que ve cada rol: la capturista solo administra operarios. */
export function pestanasAdmin(rol: Rol): PestanaAdmin[] {
  return rol === 'admin' ? ['productos', 'operarios', 'usuarios'] : ['operarios'];
}

/** Nombre del ítem de navegación hacia Administración. */
export function etiquetaAdmin(rol: Rol): string {
  return rol === 'admin' ? 'Admin' : 'Operarios';
}

/** Mismo mensaje que el trigger de public.operarios (supabase/migrations/20261112000000_caja_transparente.sql). */
export const SOLO_ADMIN_OPERARIO = 'Solo un administrador puede cambiar el nombre o el área de un operario.';

/**
 * Reglas de public.operarios, para que el modo demo se comporte igual que producción: cualquier usuario activo agrega
 * operarios y los activa o desactiva; cambiar el nombre o el área de uno existente es solo del administrador. No se
 * borran. Lanza un Error si no se puede guardar.
 */
export function validarOperario(previo: Operario | undefined, nuevo: Operario, usuario: Usuario): void {
  if (!previo || usuario.rol === 'admin') return;
  if (nuevo.nombre !== previo.nombre || nuevo.area !== previo.area) throw new Error(SOLO_ADMIN_OPERARIO);
}
