import type { Worksheet } from 'exceljs';
import type { Registro } from '../datos/repositorio';
import { formato } from '../formatos';
import { fechaCorta, horaLegible, momentoLegible } from '../lib/fechas';
import { textoCampo } from '../lib/mostrar';
import { aNumero, estadoCampo, limitePeso, resumenMuestras } from '../motor/evaluar';
import type { ValorChecklist } from '../motor/materializar';
import type { Campo, CampoChecklist, CampoMuestras, Contexto, DefinicionFormato, FilaMuestras, Operario, Producto } from '../motor/tipos';

interface Opciones { desde: string; hasta: string; productos: Producto[]; operarios: Operario[] }

const VINO = 'FF6E1A1F';
const ROJO_CLARO = 'FFFDE3E0';

function nombreHoja(def: DefinicionFormato, usados: Set<string>) {
  let n = def.nombreCorto.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
  for (let i = 2; usados.has(n); i++) n = `${n.slice(0, 28)} ${i}`;
  usados.add(n);
  return n;
}

function encabezar(ws: Worksheet, def: DefinicionFormato, op: Opciones, columnas: string[]) {
  ws.addRow([`${def.nombre}${def.codigoSQF ? ` (${def.codigoSQF})` : ''}`]).font = { bold: true, size: 14, color: { argb: VINO } };
  ws.addRow([`Del ${fechaCorta(op.desde)} al ${fechaCorta(op.hasta)}. Exportado el ${momentoLegible(new Date().toISOString())}.`]).font = { italic: true, color: { argb: 'FF6B5B5E' } };
  ws.addRow([]);
  const h = ws.addRow(columnas);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.alignment = { wrapText: true, vertical: 'middle' };
  h.height = 34;
  h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VINO } }; });
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 1 }];
  columnas.forEach((_, i) => { ws.getColumn(i + 1).width = i === 0 ? 13 : 18; });
}

const marcarFuera = (ws: Worksheet, fila: number, columna: number) => {
  const c = ws.getRow(fila).getCell(columna);
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_CLARO } };
  c.font = { bold: true, color: { argb: 'FFD42A20' } };
};

function valorCelda(c: Campo, ctx: Contexto): string | number {
  if (c.tipo === 'numero' || c.tipo === 'calculado') {
    const v = c.tipo === 'calculado' ? c.formula(ctx) : ctx.valores[c.id];
    if (v === 'Ambiente') return 'Ambiente';
    return aNumero(v) ?? '';
  }
  return textoCampo(c, ctx);
}

const titulo = (c: Campo) => {
  const unidad = c.tipo === 'numero' || c.tipo === 'calculado' ? c.unidad : '';
  return `${c.etiqueta}${unidad ? ` (${unidad})` : ''}${c.pcc ? ` ${c.pcc}` : ''}`;
};

export async function exportarRegistros(registros: Registro[], op: Opciones) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Calidad Chévere';
  const usados = new Set<string>();
  const grupos = new Map<string, Registro[]>();
  for (const r of [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? ''))) {
    grupos.set(r.formato, [...(grupos.get(r.formato) ?? []), r]);
  }

  for (const [codigo, rs] of grupos) {
    const def = formato(codigo);
    if (!def) continue;
    const ws = wb.addWorksheet(nombreHoja(def, usados));
    const todos = def.etapas.flatMap((e) => e.campos);
    const checklist = todos.find((c): c is CampoChecklist => c.tipo === 'checklist');
    const muestras = todos.find((c): c is CampoMuestras => c.tipo === 'muestras');
    const simples = todos.filter((c) => !['checklist', 'muestras', 'foto'].includes(c.tipo));
    const ctxDe = (r: Registro): Contexto => ({
      valores: r.datos, fecha: r.fecha, area: r.area, productos: op.productos, operarios: op.operarios,
      producto: op.productos.find((p) => p.id === r.productoId),
    });
    const nombreOp = (id?: string) => op.operarios.find((o) => o.id === id)?.nombre ?? '';
    const cierre = ['Desviaciones', 'Acción correctiva', 'Observaciones', 'Realizado por', 'Origen'];
    const cierreDe = (r: Registro) => [
      r.desviaciones.filter((d) => d.severidad !== 'por-confirmar').map((d) => `${d.etiqueta}: ${d.valor}`).join('; '),
      r.accionCorrectiva ?? '', r.observaciones ?? '', r.realizadoPor, r.origen === 'importado' ? 'Importado' : 'App',
    ];

    if (checklist) {
      const cols = checklist.columnas;
      encabezar(ws, def, op, ['Fecha', 'Área', 'Operario', ...cols.map((c) => c.etiqueta), 'Observación', 'Realizado por']);
      for (const r of rs) {
        for (const [opId, fila] of Object.entries((r.datos[checklist.id] ?? {}) as ValorChecklist)) {
          if (fila._ausente) {
            ws.addRow([fechaCorta(r.fecha), r.area ?? '', nombreOp(opId), 'No asistió', ...cols.slice(1).map(() => ''), fila._obs ?? '', r.realizadoPor]);
            continue;
          }
          const row = ws.addRow([
            fechaCorta(r.fecha), r.area ?? '', nombreOp(opId),
            ...cols.map((c) => checklist.estados.find((e) => e.id === fila[c.id])?.etiqueta ?? ''),
            fila._obs ?? '', r.realizadoPor,
          ]);
          cols.forEach((c, i) => {
            if (checklist.estados.find((e) => e.id === fila[c.id])?.tono === 'fuera') marcarFuera(ws, row.number, 4 + i);
          });
        }
      }
      continue;
    }

    if (muestras) {
      const otros = simples;
      encabezar(ws, def, op, [
        'Fecha', 'Hora', 'Operador', 'Producto', ...Array.from({ length: muestras.nMuestras }, (_, i) => `M${i + 1} (g)`),
        'Promedio (g)', 'Fuera de tolerancia', 'Apariencia', 'Lote', 'Vencimiento', 'Observación', ...otros.map(titulo), 'Realizado por',
      ]);
      for (const r of rs) {
        const ctx = ctxDe(r);
        for (const f of (r.datos[muestras.id] ?? []) as FilaMuestras[]) {
          const lim = limitePeso(f.productoId, ctx);
          const res = resumenMuestras(f.muestras, lim);
          const row = ws.addRow([
            fechaCorta(r.fecha), horaLegible(r.hora), nombreOp(f.operarioId), op.productos.find((p) => p.id === f.productoId)?.nombre ?? '',
            ...f.muestras.map((m) => m ?? ''), res.promedio ?? '', res.fuera, f.apariencia === 'NC' ? 'No cumple' : f.apariencia === 'C' ? 'Cumple' : '',
            f.lote ?? '', f.vencimiento ? fechaCorta(f.vencimiento) : '', f.observacion ?? '', ...otros.map((c) => valorCelda(c, ctx)), r.realizadoPor,
          ]);
          f.muestras.forEach((m, k) => {
            if (m !== null && lim && ((lim.min !== undefined && m < lim.min) || (lim.max !== undefined && m > lim.max))) marcarFuera(ws, row.number, 5 + k);
          });
        }
      }
      continue;
    }

    encabezar(ws, def, op, ['Fecha', 'Hora', 'Área', 'Producto', 'Lote', ...simples.map(titulo), ...cierre]);
    for (const r of rs) {
      const ctx = ctxDe(r);
      const row = ws.addRow([
        fechaCorta(r.fecha), horaLegible(r.hora), r.area ?? '', ctx.producto?.nombre ?? '', r.lote ?? '',
        ...simples.map((c) => valorCelda(c, ctx)), ...cierreDe(r),
      ]);
      simples.forEach((c, i) => { if (estadoCampo(c, ctx) === 'fuera') marcarFuera(ws, row.number, 6 + i); });
    }
  }

  if (wb.worksheets.length === 0) throw new Error('No hay registros para exportar.');
  const datos = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Calidad Chévere ${op.desde} a ${op.hasta}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
