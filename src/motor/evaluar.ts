import type {
  Campo,
  CampoChecklist,
  Contexto,
  DefinicionFormato,
  Desviacion,
  Estado,
  Etapa,
  Faltante,
  FilaMuestras,
  Limite,
  Severidad,
} from './tipos';

const NUMERO = new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 });

/** Formatea un número para mostrar, con signo menos tipográfico. */
export function fmt(n: number | undefined | null, decimales?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  const f = decimales === undefined
    ? NUMERO
    : new Intl.NumberFormat('es-PA', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return f.format(n).replace('-', '−');
}

export function textoLimite(l: Limite | undefined, unidad = ''): string {
  if (!l) return '';
  const u = unidad ? ` ${unidad}` : '';
  if (l.min !== undefined && l.max !== undefined) return `${fmt(l.min)} a ${fmt(l.max)}${u}`;
  if (l.max !== undefined) return `≤ ${fmt(l.max)}${u}`;
  if (l.min !== undefined) return `≥ ${fmt(l.min)}${u}`;
  return '';
}

export function estaVacio(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function aNumero(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function estadoNumero(v: number | undefined | null, l: Limite | undefined): Estado {
  if (v === undefined || v === null || Number.isNaN(v)) return 'vacio';
  if (!l) return 'ok';
  const fuera = (l.min !== undefined && v < l.min) || (l.max !== undefined && v > l.max);
  if (!fuera) return 'ok';
  return l.porConfirmar ? 'alerta' : 'fuera';
}

export function limiteDe(campo: Campo, ctx: Contexto): Limite | undefined {
  if (campo.tipo === 'numero' || campo.tipo === 'calculado') {
    return typeof campo.limite === 'function' ? campo.limite(ctx) : campo.limite;
  }
  if (campo.tipo === 'duracion') return campo.limite;
  return undefined;
}

export function campoVisible(campo: Campo, ctx: Contexto): boolean {
  return campo.aplica ? campo.aplica(ctx) : true;
}

export function camposVisibles(etapa: Etapa, ctx: Contexto): Campo[] {
  return etapa.campos.filter((c) => campoVisible(c, ctx));
}

export function etapasVisibles(def: DefinicionFormato, ctx: Contexto): Etapa[] {
  return def.etapas.filter((e) => (e.aplica ? e.aplica(ctx) : true) && camposVisibles(e, ctx).length > 0);
}

export function valorDe(campo: Campo, ctx: Contexto): unknown {
  if (campo.tipo === 'calculado') return campo.formula(ctx);
  return ctx.valores[campo.id];
}

type ValorChecklist = Record<string, Record<string, string>>;

function columnasVisibles(campo: CampoChecklist, ctx: Contexto) {
  return campo.columnas.filter((c) => (c.aplica ? c.aplica(ctx) : true));
}

function celdasFuera(campo: CampoChecklist, ctx: Contexto): { operarioId: string; columna: string }[] {
  const valor = (ctx.valores[campo.id] ?? {}) as ValorChecklist;
  const malos = new Set(campo.estados.filter((e) => e.tono === 'fuera').map((e) => e.id));
  const columnas = columnasVisibles(campo, ctx);
  const res: { operarioId: string; columna: string }[] = [];
  for (const [operarioId, fila] of Object.entries(valor)) {
    for (const col of columnas) {
      if (malos.has(fila?.[col.id])) res.push({ operarioId, columna: col.etiqueta });
    }
  }
  return res;
}

export interface ResumenMuestras {
  n: number;
  promedio?: number;
  minimo?: number;
  maximo?: number;
  fuera: number;
}

export function resumenMuestras(muestras: (number | null)[], l?: Limite): ResumenMuestras {
  const vals = muestras.filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
  if (vals.length === 0) return { n: 0, fuera: 0 };
  const suma = vals.reduce((a, b) => a + b, 0);
  const fuera = vals.filter((v) => estadoNumero(v, l) !== 'ok').length;
  return {
    n: vals.length,
    promedio: Math.round((suma / vals.length) * 1000) / 1000,
    minimo: Math.min(...vals),
    maximo: Math.max(...vals),
    fuera,
  };
}

/** Tolerancia de peso por unidad según el producto de la fila. */
export function limitePeso(productoId: string | undefined, ctx: Contexto): Limite | undefined {
  const p = ctx.productos?.find((x) => x.id === productoId);
  if (!p || (p.pesoUnidadMinG === undefined && p.pesoUnidadMaxG === undefined)) return undefined;
  return { min: p.pesoUnidadMinG, max: p.pesoUnidadMaxG };
}

export function estadoCampo(campo: Campo, ctx: Contexto): Estado {
  const v = valorDe(campo, ctx);
  switch (campo.tipo) {
    case 'numero':
      if (campo.permiteAmbiente && v === 'Ambiente') return 'ok';
      return estadoNumero(aNumero(v), limiteDe(campo, ctx));
    case 'calculado':
      return estadoNumero(v as number | undefined, limiteDe(campo, ctx));
    case 'duracion':
      return estadoNumero(aNumero(v), campo.limite);
    case 'conforme': {
      if (estaVacio(v)) return 'vacio';
      const malo = (campo.opciones ?? ['Conforme', 'No conforme'])[1];
      return v === malo ? 'fuera' : 'ok';
    }
    case 'opcion':
      if (estaVacio(v)) return 'vacio';
      return campo.malas?.includes(v as string) ? 'fuera' : 'ok';
    case 'checklist':
      return celdasFuera(campo, ctx).length > 0 ? 'fuera' : 'ok';
    case 'muestras': {
      const filas = (v ?? []) as FilaMuestras[];
      const conDatos = filas.filter((f) => f.muestras.some((m) => typeof m === 'number'));
      if (conDatos.length === 0) return 'vacio';
      const mala = conDatos.some(
        (f) => f.apariencia === 'NC' || resumenMuestras(f.muestras, limitePeso(f.productoId, ctx)).fuera > 0,
      );
      return mala ? 'fuera' : 'ok';
    }
    default:
      return estaVacio(v) ? 'vacio' : 'ok';
  }
}

function severidadDe(campo: Campo, estado: Estado): Severidad {
  if (estado === 'alerta') return 'por-confirmar';
  return campo.pcc ? 'pcc' : 'calidad';
}

function textoValor(campo: Campo, v: unknown): string {
  if (typeof v === 'number') {
    const dec = campo.tipo === 'numero' || campo.tipo === 'calculado' ? campo.decimales : undefined;
    const unidad = campo.tipo === 'numero' || campo.tipo === 'calculado' ? campo.unidad : '';
    return `${fmt(v, dec)}${unidad ? ` ${unidad}` : ''}`;
  }
  return String(v ?? '');
}

export function desviaciones(def: DefinicionFormato, ctx: Contexto): Desviacion[] {
  const res: Desviacion[] = [];
  const nombre = (id?: string) => ctx.operarios?.find((o) => o.id === id)?.nombre ?? 'Sin operario';
  for (const etapa of etapasVisibles(def, ctx)) {
    for (const campo of camposVisibles(etapa, ctx)) {
      const estado = estadoCampo(campo, ctx);
      if (estado !== 'fuera' && estado !== 'alerta') continue;
      const base = { campoId: campo.id, etapa: etapa.titulo, pcc: campo.pcc };
      if (campo.tipo === 'checklist') {
        for (const celda of celdasFuera(campo, ctx)) {
          const etiqueta = campo.etiquetaDesviacion ? campo.etiquetaDesviacion(celda.columna) : celda.columna;
          res.push({ ...base, etiqueta, valor: nombre(celda.operarioId), esperado: 'Cumple', severidad: severidadDe(campo, estado) });
        }
      } else if (campo.tipo === 'muestras') {
        const filas = (ctx.valores[campo.id] ?? []) as FilaMuestras[];
        for (const f of filas) {
          const lim = limitePeso(f.productoId, ctx);
          const r = resumenMuestras(f.muestras, lim);
          if (r.fuera > 0) {
            res.push({ ...base, etiqueta: 'Peso fuera de tolerancia', valor: `${r.fuera} de ${r.n} muestras, ${nombre(f.operarioId)}`, esperado: textoLimite(lim, 'g'), severidad: severidadDe(campo, estado) });
          }
          if (f.apariencia === 'NC') {
            res.push({ ...base, etiqueta: 'Apariencia no conforme', valor: nombre(f.operarioId), esperado: 'Conforme', severidad: severidadDe(campo, estado) });
          }
        }
      } else {
        const v = valorDe(campo, ctx);
        const esperado = campo.tipo === 'numero' || campo.tipo === 'calculado'
          ? textoLimite(limiteDe(campo, ctx), campo.unidad)
          : campo.tipo === 'conforme'
            ? (campo.opciones ?? ['Conforme'])[0]
            : campo.tipo === 'duracion'
              ? textoLimite(campo.limite, 'min')
              : 'Distinto de ' + String(v);
        res.push({ ...base, etiqueta: campo.etiqueta, valor: textoValor(campo, v), esperado, severidad: severidadDe(campo, estado) });
      }
    }
  }
  return res;
}

const SIN_CAPTURA = new Set<Campo['tipo']>(['calculado', 'foto', 'checklist']);

export function faltantes(def: DefinicionFormato, ctx: Contexto): Faltante[] {
  const res: Faltante[] = [];
  for (const etapa of etapasVisibles(def, ctx)) {
    for (const campo of camposVisibles(etapa, ctx)) {
      if (campo.opcional || SIN_CAPTURA.has(campo.tipo)) continue;
      if (estadoCampo(campo, ctx) === 'vacio') {
        res.push({ campoId: campo.id, etiqueta: campo.etiqueta, etapa: etapa.titulo });
      }
    }
  }
  return res;
}

export function hayPcc(d: Desviacion[]): boolean {
  return d.some((x) => x.severidad === 'pcc');
}

/** Suma días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

/** Suma meses conservando el día; si el mes destino es más corto, usa su último día. */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo)));
  return t.toISOString().slice(0, 10);
}

export function vencimientoSugerido(ctx: Contexto): string | undefined {
  const meses = ctx.producto?.vidaUtilMeses;
  return meses ? sumarMeses(ctx.fecha, meses) : undefined;
}
