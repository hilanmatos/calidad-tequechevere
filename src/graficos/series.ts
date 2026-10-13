import type { Registro } from '../datos/repositorio';
import { formato } from '../formatos';
import { CUARTOS } from '../formatos/temp-cuartos';
import { diasEntre } from '../lib/fechas';
import { aNumero, estadoNumero, limitePeso, resumenMuestras } from '../motor/evaluar';
import type { ValorChecklist } from '../motor/materializar';
import type { Campo, CampoChecklist, Contexto, Estado, FilaMuestras, Limite, Producto } from '../motor/tipos';

const reales = (r: Registro) => r.desviaciones.filter((d) => d.severidad !== 'por-confirmar');

export function indicadores(rs: Registro[]) {
  const conformes = rs.filter((r) => reales(r).length === 0).length;
  return {
    total: rs.length,
    conformes,
    pctConformidad: rs.length ? conformes / rs.length : 0,
    desviaciones: rs.reduce((n, r) => n + reales(r).length, 0),
    conPcc: rs.filter((r) => r.tieneDesviacionPcc).length,
  };
}

export function porDia(rs: Registro[], desde: string, hasta: string) {
  const mapa = new Map(diasEntre(desde, hasta).map((f) => [f, { fecha: f, conformes: 0, conDesviacion: 0 }]));
  for (const r of rs) {
    const d = mapa.get(r.fecha);
    if (!d) continue;
    if (reales(r).length) d.conDesviacion++; else d.conformes++;
  }
  return [...mapa.values()];
}

export interface FilaPareto { clave: string; etiqueta: string; formatos: string[]; cantidad: number; pct: number; acumulado: number }

export function pareto(rs: Registro[], max = 10): FilaPareto[] {
  const mapa = new Map<string, { etiqueta: string; formatos: Set<string>; cantidad: number }>();
  for (const r of rs) {
    for (const d of reales(r)) {
      const clave = d.etiqueta;
      const fila = mapa.get(clave) ?? { etiqueta: d.etiqueta, formatos: new Set<string>(), cantidad: 0 };
      fila.cantidad++;
      fila.formatos.add(formato(r.formato)?.nombreCorto ?? r.formato);
      mapa.set(clave, fila);
    }
  }
  const total = [...mapa.values()].reduce((n, f) => n + f.cantidad, 0);
  let acum = 0;
  return [...mapa.entries()]
    .sort((a, b) => b[1].cantidad - a[1].cantidad)
    .slice(0, max)
    .map(([clave, f]) => {
      acum += f.cantidad;
      return { clave, etiqueta: f.etiqueta, formatos: [...f.formatos], cantidad: f.cantidad, pct: f.cantidad / total, acumulado: acum / total };
    });
}

export interface PuntoSerie { fecha: string; hora?: string; valor: number; registroId: string; estado: Estado; productoId?: string }

/** Campos numéricos de un formato, para el explorador de variables. */
export function camposNumericos(codigo: string): Campo[] {
  return (formato(codigo)?.etapas ?? []).flatMap((e) => e.campos).filter((c) => c.tipo === 'numero' || c.tipo === 'calculado');
}

export function serieCampo(rs: Registro[], codigo: string, campoId: string, productos: Producto[] = [], productoId?: string): PuntoSerie[] {
  const campo = formato(codigo)?.etapas.flatMap((e) => e.campos).find((c) => c.id === campoId);
  const puntos: PuntoSerie[] = [];
  for (const r of rs) {
    if (r.formato !== codigo || (productoId && r.productoId !== productoId)) continue;
    const valor = aNumero(r.datos[campoId]);
    if (valor === undefined) continue;
    const ctx: Contexto = { valores: r.datos, fecha: r.fecha, producto: productos.find((p) => p.id === r.productoId), productos };
    const limite = campo && (campo.tipo === 'numero' || campo.tipo === 'calculado')
      ? (typeof campo.limite === 'function' ? campo.limite(ctx) : campo.limite)
      : undefined;
    puntos.push({ fecha: r.fecha, hora: r.hora, valor, registroId: r.id, estado: estadoNumero(valor, limite), productoId: r.productoId });
  }
  return puntos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? ''));
}

export function limiteFijo(codigo: string, campoId: string, producto?: Producto): Limite | undefined {
  const campo = formato(codigo)?.etapas.flatMap((e) => e.campos).find((c) => c.id === campoId);
  if (!campo || (campo.tipo !== 'numero' && campo.tipo !== 'calculado')) return undefined;
  return typeof campo.limite === 'function' ? campo.limite({ valores: {}, fecha: '', producto }) : campo.limite;
}

export function cuartosResumen(rs: Registro[]) {
  const lecturas = rs.filter((r) => r.formato === 'temp-cuartos');
  return CUARTOS.map((c) => {
    const display = lecturas.map((r) => aNumero(r.datos[`${c.id}Display`])).filter((v): v is number => v !== undefined);
    const difs = lecturas
      .map((r) => {
        const a = aNumero(r.datos[`${c.id}Pistola`]);
        const b = aNumero(r.datos[`${c.id}Display`]);
        return a === undefined || b === undefined ? undefined : a - b;
      })
      .filter((v): v is number => v !== undefined);
    const prom = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined);
    return {
      id: c.id,
      nombre: c.nombre,
      limite: c.limite,
      n: display.length,
      promedio: prom(display),
      fuera: display.filter((v) => estadoNumero(v, c.limite) === 'fuera').length,
      diferencia: prom(difs),
    };
  });
}

export function serieCuarto(rs: Registro[], id: string) {
  return rs
    .filter((r) => r.formato === 'temp-cuartos')
    .map((r) => ({ fecha: r.fecha, hora: r.hora ?? '', valor: aNumero(r.datos[`${id}Display`]) }))
    .filter((p): p is { fecha: string; hora: string; valor: number } => p.valor !== undefined)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
}

export function pesoPorToma(rs: Registro[], productoId: string, productos: Producto[]) {
  const ctx: Contexto = { valores: {}, fecha: '', productos };
  const res: { fecha: string; hora?: string; promedio: number; minimo: number; maximo: number; n: number; fuera: number }[] = [];
  for (const r of rs) {
    if (!r.formato.startsWith('fq32-')) continue;
    for (const f of (r.datos.muestras ?? []) as FilaMuestras[]) {
      if (f.productoId !== productoId) continue;
      const s = resumenMuestras(f.muestras, limitePeso(productoId, ctx));
      if (s.n === 0) continue;
      res.push({ fecha: r.fecha, hora: r.hora, promedio: s.promedio!, minimo: s.minimo!, maximo: s.maximo!, n: s.n, fuera: s.fuera });
    }
  }
  return res.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? ''));
}

function checklistDe(codigo: string): CampoChecklist {
  return formato(codigo)!.etapas[0].campos[0] as CampoChecklist;
}

export function higienePorCriterio(rs: Registro[]) {
  const campo = checklistDe('higiene-uniforme');
  const filas = campo.columnas.map((c) => ({ id: c.id, criterio: c.etiqueta, revisiones: 0, fallas: 0 }));
  for (const r of rs) {
    if (r.formato !== 'higiene-uniforme') continue;
    for (const fila of Object.values((r.datos[campo.id] ?? {}) as ValorChecklist)) {
      for (const f of filas) {
        const e = fila[f.id];
        if (!e || e === 'na') continue;
        f.revisiones++;
        if (e === 'falla') f.fallas++;
      }
    }
  }
  return filas;
}

export function higienePorOperario(rs: Registro[]) {
  const campo = checklistDe('higiene-uniforme');
  const mapa = new Map<string, { operarioId: string; revisiones: number; fallas: number; notas: string[] }>();
  for (const r of rs) {
    if (r.formato !== 'higiene-uniforme') continue;
    for (const [opId, fila] of Object.entries((r.datos[campo.id] ?? {}) as ValorChecklist)) {
      if (fila._ausente) continue;
      const m = mapa.get(opId) ?? { operarioId: opId, revisiones: 0, fallas: 0, notas: [] };
      for (const c of campo.columnas) {
        const e = fila[c.id];
        if (!e || e === 'na') continue;
        m.revisiones++;
        if (e === 'falla') m.fallas++;
      }
      if (fila._obs) m.notas.push(fila._obs);
      mapa.set(opId, m);
    }
  }
  return [...mapa.values()].sort((a, b) => b.fallas - a.fallas);
}

/** Posición de la proporción de omisiones en cada celda del mapa: el visualMap debe colorear con esta dimensión. */
export const DIM_OMISION = 2;

/** Celda del mapa de calor: [día, operario, proporción de omisiones, lavados, total]. */
export function celdaMapaLavado(c: { operarioId: string; fecha: string; lavo: number; total: number }, fechas: string[], ops: string[]) {
  return [fechas.indexOf(c.fecha), ops.indexOf(c.operarioId), (c.total - c.lavo) / c.total, c.lavo, c.total];
}

export function lavadoMapa(rs: Registro[]) {
  const campo = checklistDe('lavado-manos');
  const res: { operarioId: string; fecha: string; lavo: number; total: number }[] = [];
  for (const r of rs) {
    if (r.formato !== 'lavado-manos') continue;
    const porOp = new Map<string, { lavo: number; total: number }>();
    for (const [opId, fila] of Object.entries((r.datos[campo.id] ?? {}) as ValorChecklist)) {
      const acc = porOp.get(opId) ?? { lavo: 0, total: 0 };
      if (fila._ausente) continue;
      for (const [k, e] of Object.entries(fila)) {
        if (k.startsWith('_')) continue;
        if (e === 'lavo') { acc.lavo++; acc.total++; } else if (e === 'no') acc.total++;
      }
      porOp.set(opId, acc);
    }
    for (const [operarioId, v] of porOp) if (v.total > 0) res.push({ operarioId, fecha: r.fecha, ...v });
  }
  return res;
}
