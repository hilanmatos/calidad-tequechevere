import { hoyPanama } from '../lib/fechas';
import type { Operario, Producto } from '../motor/tipos';
import { generarDemo } from './demo';
import { DiaCerrado, RegistroDuplicado, type CambioRegistro, type CierreDia, type Perfil, type Registro, type Repositorio, type Usuario } from './repositorio';

const CLAVE = 'calidad-chevere-demo-v2';
const CLAVE_SESION = 'calidad-chevere-demo-sesion';

interface Almacen {
  productos: Producto[];
  operarios: Operario[];
  registros: Registro[];
  historial: CambioRegistro[];
  perfiles: Perfil[];
  fotos: Record<string, string>;
  cierres: CierreDia[];
}

const USUARIO_DEMO: Usuario = { id: 'demo', correo: 'demo@calidad.local', nombre: 'Asistente de Calidad', rol: 'admin' };

function leer(): Almacen {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const guardado = JSON.parse(crudo) as Almacen;
      return { ...guardado, cierres: guardado.cierres ?? [] };
    }
  } catch {
    // almacenamiento no disponible o corrupto: se regenera
  }
  const demo = generarDemo(hoyPanama());
  const almacen: Almacen = {
    ...demo,
    historial: [],
    perfiles: [{ id: 'demo', correo: USUARIO_DEMO.correo, nombre: USUARIO_DEMO.nombre, rol: 'admin', activo: true }],
    fotos: {},
    cierres: [],
  };
  guardar(almacen);
  return almacen;
}

function guardar(a: Almacen) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    // sin espacio: el demo sigue en memoria
  }
}

const pausa = () => new Promise((r) => setTimeout(r, 120));

export function repoLocal(): Repositorio {
  let a = leer();
  const oyentes = new Set<(u: Usuario | null) => void>();
  const conId = <T extends { id: string }>(x: T): T => (x.id ? x : { ...x, id: crypto.randomUUID() });
  const reemplazar = <T extends { id: string }>(lista: T[], x: T) => {
    const i = lista.findIndex((y) => y.id === x.id);
    if (i >= 0) lista[i] = x; else lista.push(x);
  };

  return {
    modo: 'demo',
    async sesion() {
      try {
        return localStorage.getItem(CLAVE_SESION) ? USUARIO_DEMO : null;
      } catch {
        return null;
      }
    },
    async ingresar() {
      await pausa();
      try { localStorage.setItem(CLAVE_SESION, '1'); } catch { /* sin almacenamiento */ }
      return USUARIO_DEMO;
    },
    async salir() {
      try { localStorage.removeItem(CLAVE_SESION); } catch { /* sin almacenamiento */ }
      oyentes.forEach((cb) => cb(null));
    },
    alCambiarSesion(cb) {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },

    async productos() { return [...a.productos]; },
    async guardarProducto(p) { reemplazar(a.productos, conId(p)); guardar(a); },
    async operarios() { return [...a.operarios]; },
    async guardarOperario(o) { reemplazar(a.operarios, conId(o)); guardar(a); },
    async perfiles() { return [...a.perfiles]; },
    async guardarPerfil(p) { reemplazar(a.perfiles, p); guardar(a); },

    async registros({ desde, hasta, formato }) {
      await pausa();
      return a.registros
        .filter((r) => r.fecha >= desde && r.fecha <= hasta && (!formato || r.formato === formato))
        .sort((x, y) => (x.fecha === y.fecha ? y.creadoEn.localeCompare(x.creadoEn) : y.fecha.localeCompare(x.fecha)));
    },
    async registro(id) {
      return a.registros.find((r) => r.id === id) ?? null;
    },
    async guardarRegistro(r) {
      await pausa();
      const ahora = new Date().toISOString();
      if (a.cierres.some((c) => c.fecha === r.fecha)) throw new DiaCerrado();
      if (r.claveUnica && a.registros.some((x) => x.claveUnica === r.claveUnica && x.id !== r.id)) throw new RegistroDuplicado();
      if (r.id) {
        const previo = a.registros.find((x) => x.id === r.id);
        if (!previo) throw new Error('El registro ya no existe.');
        const nuevo: Registro = { ...previo, ...r, id: previo.id, actualizadoEn: ahora };
        a.historial.push({ id: a.historial.length + 1, accion: 'UPDATE', usuario: USUARIO_DEMO.nombre, en: ahora, antes: previo, despues: nuevo });
        reemplazar(a.registros, nuevo);
        guardar(a);
        return nuevo;
      }
      const nuevo: Registro = { ...r, id: crypto.randomUUID(), origen: 'app', creadoPor: 'demo', creadoEn: ahora };
      a.registros.push(nuevo);
      guardar(a);
      return nuevo;
    },
    async eliminarRegistro(id) {
      const previo = a.registros.find((x) => x.id === id);
      if (!previo) return;
      a.historial.push({ id: a.historial.length + 1, accion: 'DELETE', usuario: USUARIO_DEMO.nombre, en: new Date().toISOString(), antes: previo });
      a.registros = a.registros.filter((x) => x.id !== id);
      guardar(a);
    },
    async historial(id) {
      return a.historial.filter((h) => h.antes.id === id).sort((x, y) => y.en.localeCompare(x.en));
    },

    async cierres(desde, hasta) {
      return a.cierres.filter((c) => c.fecha >= desde && c.fecha <= hasta);
    },
    async cerrarDia(c) {
      if (a.cierres.some((x) => x.fecha === c.fecha)) throw new Error('Este día ya estaba cerrado.');
      const cierre: CierreDia = { ...c, cerradoPor: 'demo', cerradoEn: new Date().toISOString() };
      a.cierres.push(cierre);
      guardar(a);
      return cierre;
    },
    async reabrirDia(fecha) {
      a.cierres = a.cierres.filter((c) => c.fecha !== fecha);
      guardar(a);
    },

    async subirFoto(archivo) {
      const ruta = crypto.randomUUID();
      const url = await new Promise<string>((res, rej) => {
        const lector = new FileReader();
        lector.onload = () => res(String(lector.result));
        lector.onerror = () => rej(new Error('No se pudo leer la foto.'));
        lector.readAsDataURL(archivo);
      });
      a.fotos[ruta] = url;
      guardar(a);
      return ruta;
    },
    async urlFoto(ruta) {
      return a.fotos[ruta] ?? '';
    },
  };
}

/** Borra el demo para regenerarlo con fechas actuales. */
export function reiniciarDemo() {
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}
