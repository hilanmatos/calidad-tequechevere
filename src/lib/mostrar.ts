import { aNumero, fmt, resumenMuestras } from '../motor/evaluar';
import type { ValorChecklist } from '../motor/materializar';
import type { Campo, Contexto, FilaMuestras } from '../motor/tipos';
import { fechaCorta } from './fechas';

/** Texto legible del valor de un campo, para detalle, impresión y Excel. */
export function textoCampo(campo: Campo, ctx: Contexto): string {
  const v = campo.tipo === 'calculado' ? campo.formula(ctx) : ctx.valores[campo.id];
  if (v === undefined || v === null || v === '') return '';
  switch (campo.tipo) {
    case 'numero':
    case 'calculado': {
      if (v === 'Ambiente') return 'Ambiente';
      const n = aNumero(v);
      return n === undefined ? String(v) : `${fmt(n, campo.decimales)}${campo.unidad ? ` ${campo.unidad}` : ''}`;
    }
    case 'duracion':
      return `${fmt(aNumero(v))} s`;
    case 'fecha':
      return fechaCorta(String(v));
    case 'foto':
      return 'Foto adjunta';
    case 'checklist': {
      const filas = Object.values(v as ValorChecklist);
      const malos = new Set(campo.estados.filter((e) => e.tono === 'fuera').map((e) => e.id));
      const fallas = filas.reduce((n, f) => n + Object.entries(f).filter(([k, e]) => k !== '_obs' && malos.has(e)).length, 0);
      return `${filas.length} personas revisadas, ${fallas} ${fallas === 1 ? 'falla' : 'fallas'}`;
    }
    case 'muestras': {
      const filas = v as FilaMuestras[];
      const todas = filas.flatMap((f) => f.muestras);
      const r = resumenMuestras(todas);
      return `${filas.length} ${filas.length === 1 ? 'mesa' : 'mesas'}, promedio ${fmt(r.promedio, 1)} g`;
    }
    default:
      return String(v);
  }
}
