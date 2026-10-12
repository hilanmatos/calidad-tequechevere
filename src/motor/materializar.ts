import { camposVisibles, estaVacio, etapasVisibles } from './evaluar';
import type { CampoChecklist, Contexto, DefinicionFormato, Valores } from './tipos';

export type ValorChecklist = Record<string, Record<string, string>>;

export function operariosDelArea(ctx: Contexto) {
  return (ctx.operarios ?? []).filter((o) => o.activo && o.area === ctx.area);
}

/** Matriz completa: las celdas sin tocar toman el estado por defecto. */
export function completarChecklist(campo: CampoChecklist, ctx: Contexto, valor: ValorChecklist | undefined): ValorChecklist {
  const res: ValorChecklist = {};
  const columnas = campo.columnas.filter((c) => !c.aplica || c.aplica(ctx));
  for (const o of operariosDelArea(ctx)) {
    const fila: Record<string, string> = {};
    for (const c of columnas) fila[c.id] = valor?.[o.id]?.[c.id] ?? campo.porDefecto;
    if (valor?.[o.id]?._obs) fila._obs = valor[o.id]._obs;
    res[o.id] = fila;
  }
  return res;
}

/** Valores con las sugerencias aplicadas a los campos vacíos (vencimiento, presentación…). */
export function valoresEfectivos(def: DefinicionFormato, ctx: Contexto): Valores {
  const res: Valores = { ...ctx.valores };
  for (const etapa of def.etapas) {
    for (const campo of etapa.campos) {
      if ((campo.tipo === 'fecha' || campo.tipo === 'texto') && campo.sugerido && estaVacio(res[campo.id])) {
        const s = campo.sugerido({ ...ctx, valores: res });
        if (s !== undefined) res[campo.id] = s;
      }
    }
  }
  return res;
}

/** Lo que se guarda: solo campos visibles, con calculados y grillas completas. */
export function materializar(def: DefinicionFormato, ctx: Contexto): Valores {
  const res: Valores = {};
  for (const etapa of etapasVisibles(def, ctx)) {
    for (const campo of camposVisibles(etapa, ctx)) {
      if (campo.tipo === 'calculado') {
        const v = campo.formula(ctx);
        if (v !== undefined) res[campo.id] = v;
      } else if (campo.tipo === 'checklist') {
        res[campo.id] = completarChecklist(campo, ctx, ctx.valores[campo.id] as ValorChecklist | undefined);
      } else if (!estaVacio(ctx.valores[campo.id])) {
        res[campo.id] = ctx.valores[campo.id];
      }
    }
  }
  return res;
}

export function rutasFotos(def: DefinicionFormato, valores: Valores): string[] {
  return def.etapas
    .flatMap((e) => e.campos)
    .filter((c) => c.tipo === 'foto')
    .map((c) => valores[c.id])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}
