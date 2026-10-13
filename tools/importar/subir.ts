/**
 * Sube salida/registros.jsonl a Supabase evaluando cada registro con el motor de la app
 * (las mismas desviaciones, PCC y clave única que calcula la tablet al guardar).
 *
 * Uso, desde la raíz del repo:
 *   npx vite-node tools/importar/subir.ts -- --seco          evalúa y resume, sin escribir nada
 *   npx vite-node tools/importar/subir.ts                    sube lo que no exista todavía
 *   npx vite-node tools/importar/subir.ts -- --reemplazar    borra lo importado antes y vuelve a subir
 *
 * Solo lee VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local. No aplica valores sugeridos
 * (vencimiento calculado, etc.): lo importado muestra solo lo que se anotó en el Excel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATOS } from '../../src/formatos';
import { claveUnica, desviaciones, hayPcc } from '../../src/motor/evaluar';
import { materializar } from '../../src/motor/materializar';
import type { Contexto, DefinicionFormato, Operario, Producto, Valores } from '../../src/motor/tipos';

interface Entrada {
  formato: string; fecha: string; hora: string | null; area: string | null; producto: string | null;
  lote: string | null; valores: Valores; observaciones: string | null; accion_correctiva: string | null;
  realizado_por: string | null; fuente: string;
}
type Fila = Record<string, unknown>;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const SALIDA = path.join(AQUI, 'salida');
const seco = process.argv.includes('--seco');
const reemplazar = process.argv.includes('--reemplazar');

function leerEnv() {
  const v: Record<string, string> = {};
  for (const linea of fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
    const i = linea.indexOf('=');
    const k = linea.slice(0, i).trim();
    if (k === 'VITE_SUPABASE_URL' || k === 'SUPABASE_SERVICE_ROLE_KEY') v[k] = linea.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { url: v.VITE_SUPABASE_URL.replace(/\/$/, ''), llave: v.SUPABASE_SERVICE_ROLE_KEY };
}
const { url, llave } = leerEnv();

async function api(metodo: string, ruta: string, cuerpo?: unknown, prefer?: string) {
  const res = await fetch(`${url}/rest/v1/${ruta}`, {
    method: metodo,
    headers: {
      apikey: llave, Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

async function todas(ruta: string): Promise<Fila[]> {
  const res: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const pagina = (await api('GET', `${ruta}${ruta.includes('?') ? '&' : '?'}limit=1000&offset=${desde}`)) as Fila[];
    res.push(...pagina);
    if (pagina.length < 1000) return res;
  }
}

const aProducto = (p: Fila): Producto => ({
  id: p.id as string, codigo: p.codigo as string, nombre: p.nombre as string, linea: p.linea as string,
  presentacion: p.presentacion as string, pesoUnidadG: (p.peso_unidad_g as number) ?? undefined,
  pesoUnidadMinG: (p.peso_unidad_min_g as number) ?? undefined, pesoUnidadMaxG: (p.peso_unidad_max_g as number) ?? undefined,
  pesoRellenoG: (p.peso_relleno_g as number) ?? undefined, pesoDeclaradoKg: (p.peso_declarado_kg as number) ?? undefined,
  vidaUtilMeses: (p.vida_util_meses as number) ?? undefined, llevaRelleno: p.lleva_relleno as boolean,
  esPrecocido: p.es_precocido as boolean, activo: p.activo as boolean,
});

const clave = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[.\s]+/g, ' ').trim();

/** Nombres de operario que usa un registro (checklists y filas de muestras), con el área del registro. */
function nombresDe(def: DefinicionFormato, e: Entrada): string[] {
  const res: string[] = [];
  for (const etapa of def.etapas) for (const campo of etapa.campos) {
    const v = e.valores[campo.id];
    if (campo.tipo === 'checklist' && v) res.push(...Object.keys(v as object));
    if (campo.tipo === 'muestras' && Array.isArray(v)) for (const f of v) if (f.operario) res.push(f.operario);
  }
  return res;
}

async function main() {
  const entradas: Entrada[] = fs.readFileSync(path.join(SALIDA, 'registros.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const productos = (await todas('productos?select=*')).map(aProducto);
  const operarios: Operario[] = (await todas('operarios?select=*')) as unknown as Operario[];
  const defDe = new Map(FORMATOS.map((d) => [d.codigo, d]));

  // Operarios históricos que no están en el catálogo: se crean inactivos con el área donde más aparecen.
  const porClave = new Map(operarios.map((o) => [clave(o.nombre), o]));
  const areasDe = new Map<string, Map<string, number>>();
  for (const e of entradas) {
    const def = defDe.get(e.formato);
    if (!def) continue;
    for (const n of nombresDe(def, e)) {
      if (porClave.has(clave(n))) continue;
      const m = areasDe.get(n) ?? new Map<string, number>();
      m.set(e.area ?? 'Planta Alta', (m.get(e.area ?? 'Planta Alta') ?? 0) + 1);
      areasDe.set(n, m);
    }
  }
  const nuevos = [...areasDe].map(([nombre, m]) => ({ nombre, area: [...m].sort((a, b) => b[1] - a[1])[0][0], activo: false }));
  const creados: Operario[] = nuevos.length && !seco
    ? (await api('POST', 'operarios', nuevos, 'return=representation')) as Operario[]
    : nuevos.map((n) => ({ ...n, id: `nuevo:${n.nombre}` }));
  for (const o of creados) porClave.set(clave(o.nombre), o);
  const todos = [...operarios, ...creados];
  const idDe = (n: string) => porClave.get(clave(n))?.id;

  if (reemplazar && !seco) await api('DELETE', 'registros?origen=eq.importado');
  const existentes = new Set(
    (await todas(`registros?select=clave_unica&clave_unica=not.is.null${reemplazar ? '&origen=eq.app' : ''}`)).map((r) => r.clave_unica as string),
  );

  const filas: { fila: Fila; inf: Fila }[] = [];
  const informe: Fila[] = [];
  const sinProducto = new Map<string, number>();
  const vistas = new Set<string>();
  let conDescartados = 0;
  for (const e of entradas) {
    const def = defDe.get(e.formato);
    const base = { fuente: e.fuente, formato: e.formato, fecha: e.fecha, area: e.area ?? '', producto: e.producto ?? '' };
    if (!def) { informe.push({ ...base, resultado: 'formato desconocido' }); continue; }
    const producto = e.producto
      ? productos.find((p) => p.codigo && p.codigo === e.producto) ?? productos.find((p) => p.nombre === e.producto)
      : undefined;
    if (e.producto && !producto) sinProducto.set(e.producto, (sinProducto.get(e.producto) ?? 0) + 1);

    // Nombres → IDs dentro de checklists y filas de muestras
    const valores: Valores = { ...e.valores };
    const enRegistro = new Set<string>();
    for (const etapa of def.etapas) for (const campo of etapa.campos) {
      const v = valores[campo.id];
      if (campo.tipo === 'checklist' && v) {
        valores[campo.id] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([n, celdas]) => {
          const id = idDe(n)!;
          enRegistro.add(id);
          return [id, celdas];
        }));
      }
      if (campo.tipo === 'muestras' && Array.isArray(v)) {
        valores[campo.id] = v.map(({ operario, producto: prod, ...resto }) => ({
          ...resto,
          ...(operario ? { operarioId: idDe(operario) } : {}),
          ...(prod ? { productoId: (productos.find((p) => p.codigo && p.codigo === prod) ?? productos.find((p) => p.nombre === prod))?.id } : {}),
        }));
      }
    }
    // En el checklist solo cuentan las personas anotadas ese día, en el área del registro
    const operariosCtx = todos.map((o) => (enRegistro.has(o.id) ? { ...o, activo: true, area: e.area ?? o.area } : { ...o, activo: false }));
    const ctx: Contexto = { valores, producto, productos, operarios: operariosCtx, fecha: e.fecha, area: e.area ?? undefined };
    const desv = desviaciones(def, ctx);
    const datos = materializar(def, ctx);
    const cu = claveUnica(def, { fecha: e.fecha, area: e.area ?? undefined, lote: e.lote ?? undefined });

    const r = { ...base, desviaciones: desv.length, pcc: hayPcc(desv) ? 'sí' : '', detalle: desv.map((d) => `${d.etiqueta}: ${d.valor}`).join(' | ') };
    if (cu && existentes.has(cu)) { informe.push({ ...r, resultado: 'ya existe en la app' }); continue; }
    if (cu && vistas.has(cu)) { informe.push({ ...r, resultado: 'repetido en el Excel (se conserva el primero)' }); continue; }
    if (cu) vistas.add(cu);
    // Lo anotado que el formato no guarda para este producto (p. ej. freído en un producto no precocido)
    // se conserva en observaciones en vez de perderse.
    const etiquetas = new Map(def.etapas.flatMap((et) => et.campos.map((c) => [c.id, c.etiqueta] as const)));
    const descartados = Object.entries(valores).filter(([k, v]) => !(k in datos) && v !== null && v !== undefined && v !== '');
    if (descartados.length) conDescartados++;
    const nota = descartados.length
      ? `Anotado en el Excel, fuera de lo que el formato guarda para este producto: ${descartados
        .map(([k, v]) => `${etiquetas.get(k) ?? k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('; ')}`
      : null;
    const obs = [e.observaciones, nota, `Importado de: ${e.fuente}`].filter(Boolean).join('\n');
    const inf = { ...r, resultado: seco ? 'listo para subir' : 'subido' };
    informe.push(inf);
    filas.push({
      fila: {
        formato: def.codigo, version_formato: def.version, fecha: e.fecha, hora: e.hora, area: e.area,
        producto_id: producto?.id ?? null, lote: e.lote, datos, desviaciones: desv, tiene_desviacion_pcc: hayPcc(desv),
        accion_correctiva: e.accion_correctiva, observaciones: obs, fotos: [], origen: 'importado',
        realizado_por: e.realizado_por || 'Importado de Excel', clave_unica: cu,
      },
      inf,
    });
  }

  if (!seco) {
    for (let i = 0; i < filas.length; i += 100) {
      const lote = filas.slice(i, i + 100);
      try {
        await api('POST', 'registros', lote.map((x) => x.fila), 'return=minimal');
      } catch {
        // Un lote con un error no entra entero: se reintenta fila por fila para aislar la que falla
        for (const x of lote) {
          try { await api('POST', 'registros', x.fila, 'return=minimal'); } catch (err) {
            x.inf.resultado = `error: ${(err as Error).message}`;
          }
        }
      }
    }
  }

  const columnas = ['fuente', 'formato', 'fecha', 'area', 'producto', 'resultado', 'desviaciones', 'pcc', 'detalle'];
  const csv = [columnas.join(','), ...informe.map((f) => columnas.map((c) => `"${String(f[c] ?? '').replace(/"/g, '""')}"`).join(','))];
  fs.writeFileSync(path.join(SALIDA, seco ? 'subida-prueba.csv' : 'subida.csv'), '﻿' + csv.join('\r\n'));

  console.log(seco ? 'PRUEBA (no se escribió nada)\n' : 'SUBIDA\n');
  const porFormato = new Map<string, Fila[]>();
  for (const f of informe) porFormato.set(f.formato as string, [...(porFormato.get(f.formato as string) ?? []), f]);
  for (const [formato, fs_] of [...porFormato].sort()) {
    const ok = fs_.filter((f) => f.resultado === 'subido' || f.resultado === 'listo para subir');
    console.log(`${formato.padEnd(24)} ${String(ok.length).padStart(5)} ${seco ? 'listos' : 'subidos'}`
      + ` | con desviación ${ok.filter((f) => Number(f.desviaciones) > 0).length} | con PCC ${ok.filter((f) => f.pcc).length}`
      + ` | omitidos ${fs_.length - ok.length}`);
  }
  const otros = informe.filter((f) => f.resultado !== 'subido' && f.resultado !== 'listo para subir');
  const motivos = new Map<string, number>();
  for (const f of otros) motivos.set(String(f.resultado).slice(0, 80), (motivos.get(String(f.resultado).slice(0, 80)) ?? 0) + 1);
  for (const [m, n] of motivos) console.log(`  omitidos: ${n} × ${m}`);
  if (sinProducto.size) console.log('Productos sin correspondencia en el catálogo:', Object.fromEntries(sinProducto));
  if (conDescartados) console.log(`Registros con valores que el formato no guarda (pasados a observaciones): ${conDescartados}`);
  console.log(`Operarios históricos ${seco ? 'a crear' : 'creados'} (inactivos): ${nuevos.map((n) => `${n.nombre} (${n.area})`).join(', ') || 'ninguno'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
