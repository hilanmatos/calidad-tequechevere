import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CierreDia, Registro } from '../datos/repositorio';
import { formato } from '../formatos';
import { COLOR } from '../graficos/Grafico';
import { echarts } from '../graficos/motor-echarts';
import { cuartosResumen, higienePorCriterio, higienePorOperario, indicadores, lavadoMapa, pareto, porDia } from '../graficos/series';
import { diasEntre, fechaCorta, fechaLarga, horaLegible, horaPanama, hoyPanama } from '../lib/fechas';
import { rutinaDelDia } from '../lib/rutina';
import { fmt } from '../motor/evaluar';
import type { Operario, Producto } from '../motor/tipos';

export interface DatosInforme {
  titulo: string;
  desde: string;
  hasta: string;
  registros: Registro[];
  productos: Producto[];
  operarios: Operario[];
  cierres: CierreDia[];
  generadoPor: string;
}

const VINO: [number, number, number] = [110, 26, 31];
const TINTA: [number, number, number] = [42, 19, 22];
const SUAVE: [number, number, number] = [107, 91, 94];
const ROJO: [number, number, number] = [208, 59, 59];
const VERDE: [number, number, number] = [31, 157, 85];

/** La fuente estándar del PDF solo cubre Latin-1: se reemplazan los signos que no tiene. */
const t = (s: string) => s
  .replace(/−/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/…/g, '...')
  .replace(/[‐-―]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[^\x00-\xFF]/g, '');

const pct = (x: number) => `${Math.round(x * 100)} %`;
const reales = (r: Registro) => r.desviaciones.filter((d) => d.severidad !== 'por-confirmar');

async function imagenUrl(url: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res, rej) => {
      const lector = new FileReader();
      lector.onload = () => res(String(lector.result));
      lector.onerror = rej;
      lector.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** Dibuja un gráfico de ECharts fuera de pantalla y lo devuelve como imagen JPEG (liviana para enviar). */
async function graficoPng(opcion: Record<string, unknown>, ancho: number, alto: number): Promise<string> {
  const g = echarts.init(null, null, { renderer: 'svg', ssr: true, width: ancho, height: alto });
  g.setOption({ animation: false, textStyle: { fontFamily: 'Helvetica, Arial, sans-serif', color: '#2a1316' }, ...opcion });
  const svg = g.renderToSVGString();
  g.dispose();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho * 2;
    lienzo.height = alto * 2;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function resumenTexto(d: DatosInforme): string {
  const k = indicadores(d.registros);
  const periodo = d.desde === d.hasta ? `del ${fechaCorta(d.desde)}` : `del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`;
  let texto = `Informe de calidad ${periodo}: ${k.total} registros, ${pct(k.pctConformidad)} de conformidad, ${k.desviaciones} desviaciones`;
  texto += k.conPcc ? `, ${k.conPcc} con PCC fuera de límite.` : ', ningún PCC fuera de límite.';
  if (d.desde === d.hasta) {
    const pasos = rutinaDelDia(d.registros, d.desde);
    texto += ` Rutina: ${pasos.filter((p) => p.hecho).length} de ${pasos.length}.`;
    texto += d.cierres.some((c) => c.fecha === d.desde) ? ' Día cerrado.' : ' Día abierto.';
  }
  return texto;
}

export async function generarInformePdf(d: DatosInforme): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const k = indicadores(d.registros);
  const unDia = d.desde === d.hasta;

  // Encabezado
  doc.setFillColor(...VINO);
  doc.rect(0, 0, W, 32, 'F');
  const logo = await imagenUrl(`${import.meta.env.BASE_URL}logo.png`);
  if (logo) doc.addImage(logo, 'PNG', M, 6, 20, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(t(d.titulo), M + 25, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const periodo = unDia ? fechaLarga(d.desde) : `Del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`;
  doc.text(t(periodo.charAt(0).toUpperCase() + periodo.slice(1)), M + 25, 22);
  doc.text(t('Teque Chévere Internacional, S.A.'), W - M, 15, { align: 'right' });
  doc.text(t(`Generado ${fechaCorta(hoyPanama())}, ${horaLegible(horaPanama())}`), W - M, 22, { align: 'right' });
  doc.text(t(`por ${d.generadoPor}`), W - M, 27, { align: 'right' });

  // Indicadores
  let y = 40;
  const cajas: [string, string, [number, number, number]][] = [
    ['Registros', String(k.total), VINO],
    ['Conformidad', pct(k.pctConformidad), VINO],
    ['Desviaciones', String(k.desviaciones), k.desviaciones ? ROJO : VINO],
    ['Con PCC fuera de límite', String(k.conPcc), k.conPcc ? ROJO : VINO],
  ];
  const anchoCaja = (W - 2 * M - 9) / 4;
  cajas.forEach(([etiqueta, valor, color], i) => {
    const x = M + i * (anchoCaja + 3);
    doc.setDrawColor(217, 224, 231);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, anchoCaja, 22, 3, 3, 'FD');
    doc.setTextColor(...SUAVE);
    doc.setFontSize(8.5);
    doc.text(t(etiqueta), x + 4, y + 6);
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(t(valor), x + 4, y + 17);
    doc.setFont('helvetica', 'normal');
  });
  y += 30;

  const titulo = (texto: string) => {
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setTextColor(...VINO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(t(texto), M, y);
    doc.setFont('helvetica', 'normal');
    y += 3;
  };
  const tabla = (head: string[], body: (string | number)[][], opciones: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head.map(t)],
      body: body.map((f) => f.map((c) => t(String(c)))),
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: TINTA, lineColor: [217, 224, 231], lineWidth: 0.1 },
      headStyles: { fillColor: VINO, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      ...opciones,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  };

  // Rutina del día y cierre
  if (unDia) {
    titulo('Rutina del día');
    const pasos = rutinaDelDia(d.registros, d.desde);
    const cierre = d.cierres.find((c) => c.fecha === d.desde);
    tabla(
      ['Control', 'Área', 'Estado', 'Responsable'],
      [
        ...pasos.map((p) => [
          p.def.nombreCorto, p.area ?? '',
          p.hecho ? `Hecho, ${horaLegible(p.hecho.hora ?? horaPanama(new Date(p.hecho.creadoEn)))}${reales(p.hecho).length ? `, ${reales(p.hecho).length} ${reales(p.hecho).length === 1 ? 'desviación' : 'desviaciones'}` : ''}` : 'Pendiente',
          p.hecho?.realizadoPor ?? '',
        ]),
        ['Cierre del día', '', cierre ? `Cerrado, ${horaLegible(horaPanama(new Date(cierre.cerradoEn)))}` : 'Abierto', cierre?.cerradoPorNombre ?? ''],
      ],
      {
        didParseCell: (h: { section: string; column: { index: number }; cell: { raw: unknown; styles: { textColor: unknown; fontStyle: string } } }) => {
          if (h.section === 'body' && h.column.index === 2) {
            const v = String(h.cell.raw);
            h.cell.styles.textColor = v.startsWith('Pendiente') || v === 'Abierto' ? ROJO : VERDE;
            h.cell.styles.fontStyle = 'bold';
          }
        },
      },
    );
  }

  // Gráficos
  const dias = diasEntre(d.desde, d.hasta);
  if (!unDia && dias.length <= 120) {
    titulo('Registros por día');
    const datos = porDia(d.registros, d.desde, d.hasta);
    const img = await graficoPng({
      grid: { left: 36, right: 12, top: 28, bottom: 28 },
      legend: { top: 0, right: 0, data: ['Conformes', 'Con desviación'], itemWidth: 10, itemHeight: 10 },
      xAxis: { type: 'category', data: datos.map((x) => fechaCorta(x.fecha, false)), axisTick: { show: false }, axisLine: { lineStyle: { color: COLOR.linea } }, axisLabel: { color: COLOR.suave } },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: COLOR.grilla } }, axisLabel: { color: COLOR.suave } },
      series: [
        { type: 'bar', name: 'Conformes', stack: 'r', barMaxWidth: 14, data: datos.map((x) => x.conformes), itemStyle: { color: COLOR.serie1 } },
        { type: 'bar', name: 'Con desviación', stack: 'r', barMaxWidth: 14, data: datos.map((x) => x.conDesviacion), itemStyle: { color: COLOR.critico, borderRadius: [3, 3, 0, 0] } },
      ],
    }, 900, 300);
    doc.addImage(img, 'JPEG', M, y, W - 2 * M, (W - 2 * M) / 3);
    y += (W - 2 * M) / 3 + 8;
  }

  const p = pareto(d.registros, 8);
  if (p.length >= 2) {
    titulo('Desviaciones más frecuentes');
    const img = await graficoPng({
      grid: { left: 190, right: 40, top: 6, bottom: 6 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: p.map((f) => f.etiqueta), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: COLOR.tinta, width: 180, overflow: 'truncate' } },
      series: [{ type: 'bar', barMaxWidth: 14, data: p.map((f) => f.cantidad), itemStyle: { color: COLOR.critico, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: COLOR.tinta, fontWeight: 'bold' } }],
    }, 900, Math.max(120, p.length * 30 + 12));
    const alto = ((W - 2 * M) * Math.max(120, p.length * 30 + 12)) / 900;
    if (y + alto > 280) { doc.addPage(); y = 18; }
    doc.addImage(img, 'JPEG', M, y, W - 2 * M, alto);
    y += alto + 8;
  }

  // Desviaciones con su acción correctiva
  const conDesv = d.registros.filter((r) => reales(r).length).sort((a, b) => a.fecha.localeCompare(b.fecha));
  titulo('Desviaciones y acciones correctivas');
  if (conDesv.length === 0) {
    doc.setTextColor(...VERDE);
    doc.setFontSize(10);
    doc.text(t('Sin desviaciones en el período.'), M, y + 4);
    y += 12;
  } else {
    tabla(
      ['Fecha', 'Formato', 'Desviación', 'Valor', 'Esperado', 'Acción correctiva'],
      conDesv.flatMap((r) => {
        const def = formato(r.formato);
        const prod = d.productos.find((x) => x.id === r.productoId);
        const donde = [def?.nombreCorto ?? r.formato, prod?.nombre ?? r.area, r.lote && `lote ${r.lote}`].filter(Boolean).join(', ');
        return reales(r).map((x) => [fechaCorta(r.fecha, false), donde, `${x.pcc ? `${x.pcc} ` : ''}${x.etiqueta}`, x.valor, x.esperado, r.accionCorrectiva ?? 'Sin registrar']);
      }),
      { columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 38 }, 5: { cellWidth: 50 } } },
    );
  }

  // Cuartos fríos
  const cuartos = cuartosResumen(d.registros).filter((c) => c.n > 0);
  if (cuartos.length) {
    titulo('Cuartos fríos');
    tabla(
      ['Cuarto', 'Lecturas', 'Promedio', 'Rango', 'Fuera de rango', 'Pistola contra termómetro'],
      cuartos.map((c) => [
        c.nombre, c.n, c.promedio !== undefined ? `${fmt(c.promedio, 1)} °C` : '', c.limite.min !== undefined ? `${c.limite.min} a ${c.limite.max} °C` : `<= ${c.limite.max} °C`,
        `${c.fuera} (${pct(c.fuera / c.n)})`, c.diferencia !== undefined ? `${c.diferencia > 0 ? '+' : ''}${fmt(c.diferencia, 1)} °C` : '',
      ]),
    );
  }

  // Personal
  const criterios = higienePorCriterio(d.registros).filter((c) => c.revisiones > 0);
  if (criterios.length) {
    titulo('Higiene y uniforme');
    const nombre = (id: string) => d.operarios.find((o) => o.id === id)?.nombre ?? 'Operario retirado';
    const conFallas = criterios.filter((c) => c.fallas > 0).sort((a, b) => b.fallas - a.fallas);
    if (conFallas.length) {
      tabla(['Criterio', 'Revisiones', 'Fallas', '% de fallas'], conFallas.map((c) => [c.criterio, c.revisiones, c.fallas, pct(c.fallas / c.revisiones)]));
    } else {
      doc.setTextColor(...VERDE);
      doc.setFontSize(10);
      doc.text(t(`Sin fallas en los ${criterios.length} criterios revisados.`), M, y + 4);
      y += 12;
    }
    const personas = higienePorOperario(d.registros).filter((o) => o.fallas > 0).slice(0, 8);
    if (personas.length) {
      tabla(['Persona', 'Fallas', 'Última observación'], personas.map((o) => [nombre(o.operarioId), o.fallas, o.notas.slice(-1)[0] ?? '']));
    }
  }
  const lavado = lavadoMapa(d.registros);
  if (lavado.length) {
    titulo('Lavado de manos');
    const porArea = new Map<string, { lavo: number; total: number }>();
    for (const c of lavado) {
      const area = d.operarios.find((o) => o.id === c.operarioId)?.area ?? 'Sin área';
      const a = porArea.get(area) ?? { lavo: 0, total: 0 };
      a.lavo += c.lavo; a.total += c.total;
      porArea.set(area, a);
    }
    tabla(['Área', 'Lavados a tiempo', 'Horarios evaluados', 'Cumplimiento'], [...porArea].map(([a, v]) => [a, v.lavo, v.total, pct(v.lavo / v.total)]));
  }

  // Registros por formato
  titulo('Registros por formato');
  const grupos = new Map<string, Registro[]>();
  for (const r of d.registros) grupos.set(r.formato, [...(grupos.get(r.formato) ?? []), r]);
  tabla(
    ['Formato', 'Registros', 'Con desviación', 'Conformidad'],
    [...grupos].map(([c, rs]) => {
      const con = rs.filter((r) => reales(r).length).length;
      return [formato(c)?.nombreCorto ?? c, rs.length, con, pct((rs.length - con) / rs.length)];
    }),
  );

  // Pie de página
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...SUAVE);
    doc.text(t(`Calidad Chévere, ${d.titulo.toLowerCase()}`), M, 290);
    doc.text(`Página ${i} de ${paginas}`, W - M, 290, { align: 'right' });
  }
  return doc.output('blob');
}
