import type { SupabaseClient } from '@supabase/supabase-js';
import type { Operario, Producto } from '../motor/tipos';
import { DiaCerrado, RegistroDuplicado, type CambioRegistro, type CierreDia, type Perfil, type Registro, type Repositorio, type Usuario } from './repositorio';

type Fila = Record<string, any>;

const aProducto = (f: Fila): Producto => ({
  id: f.id,
  codigo: f.codigo,
  nombre: f.nombre,
  linea: f.linea,
  presentacion: f.presentacion ?? '',
  pesoUnidadG: f.peso_unidad_g ?? undefined,
  pesoUnidadMinG: f.peso_unidad_min_g ?? undefined,
  pesoUnidadMaxG: f.peso_unidad_max_g ?? undefined,
  pesoRellenoG: f.peso_relleno_g ?? undefined,
  pesoDeclaradoKg: f.peso_declarado_kg ?? undefined,
  vidaUtilMeses: f.vida_util_meses ?? undefined,
  llevaRelleno: f.lleva_relleno,
  esPrecocido: f.es_precocido,
  activo: f.activo,
});

const deProducto = (p: Producto): Fila => ({
  ...(p.id ? { id: p.id } : {}),
  codigo: p.codigo,
  nombre: p.nombre,
  linea: p.linea,
  presentacion: p.presentacion,
  peso_unidad_g: p.pesoUnidadG ?? null,
  peso_unidad_min_g: p.pesoUnidadMinG ?? null,
  peso_unidad_max_g: p.pesoUnidadMaxG ?? null,
  peso_relleno_g: p.pesoRellenoG ?? null,
  peso_declarado_kg: p.pesoDeclaradoKg ?? null,
  vida_util_meses: p.vidaUtilMeses ?? null,
  lleva_relleno: p.llevaRelleno,
  es_precocido: p.esPrecocido,
  activo: p.activo,
});

export const aRegistro = (f: Fila): Registro => ({
  id: f.id,
  formato: f.formato,
  versionFormato: f.version_formato,
  fecha: f.fecha,
  hora: f.hora ?? undefined,
  area: f.area ?? undefined,
  productoId: f.producto_id ?? undefined,
  lote: f.lote ?? undefined,
  datos: f.datos ?? {},
  desviaciones: f.desviaciones ?? [],
  tieneDesviacionPcc: f.tiene_desviacion_pcc,
  accionCorrectiva: f.accion_correctiva ?? undefined,
  observaciones: f.observaciones ?? undefined,
  fotos: f.fotos ?? [],
  origen: f.origen,
  realizadoPor: f.realizado_por ?? '',
  claveUnica: f.clave_unica ?? undefined,
  creadoPor: f.creado_por ?? undefined,
  creadoEn: f.creado_en,
  actualizadoEn: f.actualizado_en ?? undefined,
});

const aCierre = (f: Fila): CierreDia => ({
  fecha: f.fecha,
  cerradoPor: f.cerrado_por ?? undefined,
  cerradoPorNombre: f.cerrado_por_nombre,
  cerradoEn: f.cerrado_en,
  resumen: f.resumen ?? { registros: 0, desviaciones: 0, pendientes: [] },
});

const comprobar = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export function repoSupabase(sb: SupabaseClient): Repositorio {
  const usuarioActual = async (): Promise<Usuario | null> => {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const perfil = comprobar(await sb.from('perfiles').select('*').eq('id', u.id).maybeSingle()) as Fila | null;
    if (perfil && !perfil.activo) {
      await sb.auth.signOut();
      throw new Error('Este usuario está desactivado. Pide acceso al administrador.');
    }
    return { id: u.id, correo: u.email ?? '', nombre: perfil?.nombre ?? u.email ?? '', rol: perfil?.rol ?? 'capturista' };
  };

  return {
    modo: 'supabase',
    sesion: usuarioActual,
    async ingresar(correo, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
      const u = await usuarioActual();
      if (!u) throw new Error('No se pudo abrir la sesión.');
      return u;
    },
    async salir() {
      await sb.auth.signOut();
    },
    alCambiarSesion(cb) {
      const { data } = sb.auth.onAuthStateChange((evento) => {
        if (evento === 'SIGNED_OUT') cb(null);
      });
      return () => data.subscription.unsubscribe();
    },

    async productos() {
      return (comprobar(await sb.from('productos').select('*').order('linea').order('nombre')) as Fila[]).map(aProducto);
    },
    async guardarProducto(p) {
      comprobar(await sb.from('productos').upsert(deProducto(p)));
    },
    async operarios() {
      return (comprobar(await sb.from('operarios').select('*').order('area').order('nombre')) as Fila[]).map((f) => ({
        id: f.id, nombre: f.nombre, area: f.area, activo: f.activo,
      }));
    },
    async guardarOperario(o: Operario) {
      comprobar(await sb.from('operarios').upsert({ ...(o.id ? { id: o.id } : {}), nombre: o.nombre, area: o.area, activo: o.activo }));
    },
    async perfiles() {
      return (comprobar(await sb.from('perfiles').select('*').order('nombre')) as Fila[]).map((f) => ({
        id: f.id, correo: f.correo, nombre: f.nombre, rol: f.rol, activo: f.activo,
      }));
    },
    async guardarPerfil(p: Perfil) {
      comprobar(await sb.from('perfiles').update({ nombre: p.nombre, rol: p.rol, activo: p.activo }).eq('id', p.id));
    },

    async registros({ desde, hasta, formato }) {
      const todas: Fila[] = [];
      const pagina = 1000;
      for (let i = 0; ; i += pagina) {
        let q = sb.from('registros').select('*').gte('fecha', desde).lte('fecha', hasta)
          .order('fecha', { ascending: false }).order('creado_en', { ascending: false }).range(i, i + pagina - 1);
        if (formato) q = q.eq('formato', formato);
        const filas = comprobar(await q) as Fila[];
        todas.push(...filas);
        if (filas.length < pagina) break;
      }
      return todas.map(aRegistro);
    },
    async registro(id) {
      const f = comprobar(await sb.from('registros').select('*').eq('id', id).maybeSingle()) as Fila | null;
      return f ? aRegistro(f) : null;
    },
    async porClave(clave) {
      const f = comprobar(await sb.from('registros').select('*').eq('clave_unica', clave).maybeSingle()) as Fila | null;
      return f ? aRegistro(f) : null;
    },
    async guardarRegistro(r) {
      const fila: Fila = {
        formato: r.formato,
        version_formato: r.versionFormato,
        fecha: r.fecha,
        hora: r.hora ?? null,
        area: r.area ?? null,
        producto_id: r.productoId ?? null,
        lote: r.lote ?? null,
        datos: r.datos,
        desviaciones: r.desviaciones,
        tiene_desviacion_pcc: r.tieneDesviacionPcc,
        accion_correctiva: r.accionCorrectiva ?? null,
        observaciones: r.observaciones ?? null,
        fotos: r.fotos,
        realizado_por: r.realizadoPor,
        clave_unica: r.claveUnica ?? null,
      };
      const { data: auth } = await sb.auth.getUser();
      const res = r.id
        ? await sb.from('registros').update(fila).eq('id', r.id).select().single()
        : await sb.from('registros').insert({ ...fila, creado_por: auth.user?.id, origen: 'app' }).select().single();
      if (res.error) {
        if (res.error.code === '23505') throw new RegistroDuplicado();
        const cerrado = await sb.from('cierres_dia').select('fecha').eq('fecha', r.fecha).maybeSingle();
        if (cerrado.data) throw new DiaCerrado();
        if (res.error.code === '42501' || res.error.code === 'PGRST116') {
          throw new Error('No tienes permiso para guardar este registro. Solo se editan los registros propios del mismo día.');
        }
        throw new Error(res.error.message);
      }
      return aRegistro(res.data as Fila);
    },
    async eliminarRegistro(id) {
      comprobar(await sb.from('registros').delete().eq('id', id));
    },
    async historial(id) {
      const filas = comprobar(await sb.from('registros_historial').select('*').eq('registro_id', id).order('en', { ascending: false })) as Fila[];
      return filas.map((f): CambioRegistro => ({
        id: f.id,
        accion: f.accion,
        usuario: f.usuario_nombre ?? undefined,
        en: f.en,
        antes: aRegistro(f.antes),
        despues: f.despues ? aRegistro(f.despues) : undefined,
      }));
    },

    async cierres(desde, hasta) {
      const filas = comprobar(await sb.from('cierres_dia').select('*').gte('fecha', desde).lte('fecha', hasta)) as Fila[];
      return filas.map(aCierre);
    },
    async cerrarDia(c) {
      const { data } = await sb.auth.getUser();
      const res = await sb.from('cierres_dia')
        .insert({ fecha: c.fecha, cerrado_por: data.user?.id, cerrado_por_nombre: c.cerradoPorNombre, resumen: c.resumen })
        .select().single();
      if (res.error?.code === '23505') throw new Error('Este día ya estaba cerrado.');
      if (res.error) throw new Error(res.error.message);
      return aCierre(res.data as Fila);
    },
    async reabrirDia(fecha) {
      comprobar(await sb.from('cierres_dia').delete().eq('fecha', fecha));
    },

    async subirFoto(archivo, nombre) {
      const ruta = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${nombre.replace(/[^\w.-]/g, '_')}`;
      comprobar(await sb.storage.from('fotos').upload(ruta, archivo, { contentType: archivo.type || 'image/jpeg' }));
      return ruta;
    },
    async urlFoto(ruta) {
      const r = await sb.storage.from('fotos').createSignedUrl(ruta, 60 * 60);
      if (r.error) throw new Error(r.error.message);
      return r.data.signedUrl;
    },
  };
}
