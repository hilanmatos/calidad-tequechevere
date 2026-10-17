import { formato } from '../formatos';
import {
  camposVisibles, claveUnica, desviaciones, etapasVisibles, hayPcc, limiteDe, sumarDias,
} from '../motor/evaluar';
import type { Campo, Contexto, FilaMuestras, Operario, Producto, Valores } from '../motor/tipos';
import { OPERARIOS_DEMO, PRODUCTOS_DEMO } from './catalogo-demo';
import type { Registro } from './repositorio';

/** PRNG determinista para que el demo se vea igual en cada carga. */
function azar(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rangos típicos observados en los registros de planta. */
const RANGOS: Record<string, [number, number]> = {
  tAmbiente: [24, 30], hrAmbiente: [50, 62], tAgua: [8, 14], tMasa: [28, 36], hMasa: [25, 32], hQueso: [40, 48],
  vueltas: [3, 4], tInternaTurbo: [2, 8], tAceite: [165, 180], tiempoFreido: [55, 70], tInternaFreido: [72, 85],
  defectos: [0, 9], tInicialCong: [4, 9], tFinal: [-8, -2], tSellado: [150, 170], tRelleno: [5, 12],
  tInternaCong: [-4, -1], pesoMasa: [45, 58], tiempoEspera: [30, 60], tRellenoFinal: [12, 19], tiempoFormado: [40, 50],
  pctNoConforme: [0, 5], hYuca: [54, 58], tiempoCoccion: [20, 22], tCoccion: [95, 100], cantidadAgua: [18, 22],
  tiempoPreCong: [45, 60], tInternaPreCong: [-3, -1], tiempoFritura: [30, 60], pctNoConformeFritura: [5, 30],
  pctNoConformeFormado: [0, 5], sanitec: [20, 20], tiempoHigienizacion: [3, 3], tiempoMezclado: [7, 7], ph: [3.75, 3.98],
  tEnvasado: [8, 10], tiempoExpuesto: [28, 38], pesoNeto: [599, 604], tAlmacenamiento: [2.5, 4],
  tiCongelacion: [8, 12], tfCongelacion: [-4, -1], tFritura: [170, 178], tiCongEmpaque: [-4, -1], tfCongEmpaque: [-19, -17],
  bandejasCiclo: [10, 14], tUltimaBandeja: [3, 8], alturaAgua: [12, 15], tFinalEmpaque: [-19, -16], frioPBDisplay: [2.5, 4.4], frioPADisplay: [2.6, 4.8], congPBDisplay: [-20.5, -17.9], congPADisplay: [-19.8, -16.8],
  frioPBPistola: [-2.5, -0.5], frioPAPistola: [-1.2, 1], congPBPistola: [-29, -25.5], congPAPistola: [-16, -12],
};

const ACCIONES = [
  'Se retuvo el lote y Calidad repitió la medición; el valor quedó dentro de rango.',
  'Se ajustó la temperatura del equipo y se volvió a medir a los 15 minutos.',
  'Producto retenido para evaluación; se notificó al Supervisor de Producción.',
];

function valorDemo(campo: Campo, ctx: Contexto, r: () => number): unknown {
  const entre = (a: number, b: number, dec = 1) => Math.round((a + (b - a) * r()) * 10 ** dec) / 10 ** dec;
  const p = ctx.producto;
  switch (campo.tipo) {
    case 'numero': {
      if (campo.opcional && r() < 0.25) return undefined;
      if (campo.permiteAmbiente && r() < 0.6) return 'Ambiente';
      const dec = campo.decimales ?? 1;
      if (campo.id === 'pesoPromedio' || campo.id === 'pesoProducto') {
        const base = p?.pesoUnidadG ?? 30;
        return entre(base - 0.8, base + 1.2, 1);
      }
      if (campo.id === 'pesoRelleno') {
        // con rango del SQF: casi siempre dentro, a veces un poco por encima
        if (p?.pesoRellenoMinG !== undefined && p.pesoRellenoMaxG !== undefined) {
          return r() < 0.95 ? entre(p.pesoRellenoMinG, p.pesoRellenoMaxG, 1) : entre(p.pesoRellenoMaxG, p.pesoRellenoMaxG + 0.6, 1);
        }
        return p?.pesoRellenoG ? entre(p.pesoRellenoG - 0.8, p.pesoRellenoG + 0.8, 1) : undefined;
      }
      if (campo.id === 'pesoEmpaque') {
        const d = p?.pesoDeclaradoKg ?? 0.5;
        return entre(d - 0.002, d + 0.04, 3);
      }
      const rango = RANGOS[campo.id];
      if (rango) return entre(rango[0], rango[1], dec);
      const lim = limiteDe(campo, ctx);
      if (lim?.min !== undefined && lim?.max !== undefined) return entre(lim.min, lim.max, dec);
      return entre(0, 10, dec);
    }
    case 'conforme': {
      const [bien, mal] = campo.opciones ?? ['Conforme', 'No conforme'];
      return r() < 0.985 ? bien : mal;
    }
    case 'opcion':
      if (campo.opcional && r() < 0.4) return undefined;
      return r() < 0.95 ? campo.opciones[0] : campo.opciones[Math.min(1, campo.opciones.length - 1)];
    case 'fecha':
      return campo.sugerido?.(ctx);
    case 'texto':
      if (campo.id === 'loteQueso') return `QB-${2600 + Math.floor(r() * 90)}`;
      return campo.sugerido?.(ctx);
    case 'hora': {
      // la última bandeja sale entre 40 y 90 minutos después de la primera
      const primera = ctx.valores.horaPrimeraBandeja;
      const min = typeof primera === 'string' && campo.id === 'horaUltimaBandeja'
        ? Number(primera.slice(0, 2)) * 60 + Number(primera.slice(3)) + 40 + Math.floor(r() * 50)
        : 9 * 60 + Math.floor(r() * 150);
      return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    }
    case 'checklist': {
      const ops = (ctx.operarios ?? []).filter((o) => o.area === ctx.area && o.activo);
      const malo = campo.estados.find((e) => e.tono === 'fuera')!.id;
      const bueno = campo.estados.find((e) => e.tono === 'ok')!.id;
      const valor: Record<string, Record<string, string>> = {};
      for (const o of ops) {
        if (r() < 0.05) { valor[o.id] = { _ausente: 'si' }; continue; }
        const fila: Record<string, string> = {};
        for (const c of campo.columnas) {
          if (c.aplica && !c.aplica(ctx)) continue;
          fila[c.id] = r() < (campo.id === 'lavado' ? 0.03 : 0.004) ? malo : bueno;
        }
        valor[o.id] = fila;
      }
      return valor;
    }
    case 'muestras': {
      const prods = (ctx.productos ?? []).filter((x) => campo.lineas.includes(x.linea));
      const ops = (ctx.operarios ?? []).filter((o) => o.area === (campo.lineas.includes('cq-l4-almond') ? 'Gluten Free' : 'Planta Alta'));
      const filas: FilaMuestras[] = [];
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const prod = prods[Math.floor(r() * prods.length)];
        const base = prod?.pesoUnidadG ?? 30;
        filas.push({
          operarioId: ops[i % Math.max(1, ops.length)]?.id,
          productoId: prod?.id,
          muestras: Array.from({ length: campo.nMuestras }, () => entre(base - 0.9, base + 1, 1)),
          apariencia: r() < 0.95 ? 'C' : 'NC',
          lote: campo.columnasExtra?.includes('lote') ? String(28800 + Math.floor(r() * 300)) : undefined,
        });
      }
      return filas;
    }
    default:
      return undefined;
  }
}

function crearRegistro(
  codigo: string, fecha: string, hora: string | undefined, r: () => number,
  base: { productos: Producto[]; operarios: Operario[]; producto?: Producto; area?: string; lote?: string },
): Registro {
  const def = formato(codigo)!;
  const valores: Valores = {};
  const ctx: Contexto = { valores, producto: base.producto, productos: base.productos, operarios: base.operarios, fecha, area: base.area };
  for (const etapa of etapasVisibles(def, ctx)) {
    for (const campo of camposVisibles(etapa, ctx)) {
      if (campo.tipo === 'calculado' || campo.tipo === 'foto') continue;
      const v = valorDemo(campo, ctx, r);
      if (v !== undefined) valores[campo.id] = v;
    }
  }
  const d = desviaciones(def, ctx);
  const pcc = hayPcc(d);
  return {
    id: crypto.randomUUID(),
    formato: codigo,
    versionFormato: def.version,
    fecha,
    hora,
    area: base.area,
    productoId: base.producto?.id,
    lote: base.lote,
    datos: valores,
    desviaciones: d,
    tieneDesviacionPcc: pcc,
    accionCorrectiva: d.some((x) => x.severidad !== 'por-confirmar') ? ACCIONES[Math.floor(r() * ACCIONES.length)] : undefined,
    fotos: [],
    origen: 'app',
    realizadoPor: 'Asistente de Calidad',
    claveUnica: claveUnica(def, { fecha, area: base.area, lote: base.lote }) ?? undefined,
    creadoPor: 'demo',
    creadoEn: `${fecha}T${hora ?? '10:00'}:00-05:00`,
  };
}

export function generarDemo(hoy: string, dias = 45) {
  const r = azar(20261012);
  const productos: Producto[] = PRODUCTOS_DEMO.map((x, i) => ({ ...x, id: `prod-${i + 1}` }));
  const operarios: Operario[] = OPERARIOS_DEMO.map((x, i) => ({ ...x, id: `op-${i + 1}` }));
  const registros: Registro[] = [];
  let lote = 28700;
  const de = (linea: string) => productos.filter((x) => x.linea === linea);
  const elegir = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const base = { productos, operarios };

  for (let i = dias; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i);
    if (new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0) continue;
    const esHoy = i === 0;
    const sale = (prob: number) => !esHoy && r() < prob;

    registros.push(crearRegistro('temp-cuartos', fecha, '07:30', r, base));
    registros.push(crearRegistro('higiene-uniforme', fecha, undefined, r, { ...base, area: 'Planta Alta' }));
    if (sale(0.95)) registros.push(crearRegistro('higiene-uniforme', fecha, undefined, r, { ...base, area: 'Gluten Free' }));
    if (!esHoy) registros.push(crearRegistro('lavado-manos', fecha, undefined, r, { ...base, area: 'Planta Alta' }));
    if (sale(0.95)) registros.push(crearRegistro('lavado-manos', fecha, undefined, r, { ...base, area: 'Gluten Free' }));

    const lineas: [string, number][] = [
      ['cq-l1-tequenos', 1], ['cq-l1-tequenos', 0.7], ['cq-l2-empanadas-trigo', 0.5], ['cq-l3-empanadas-maiz', 0.4],
      ['cq-l4-almond', 0.3], ['cq-l5-yuca', 0.4], ['cq-salsa-tartara', 0.08],
    ];
    for (const [codigo, prob] of lineas) {
      if (esHoy ? codigo === 'cq-l1-tequenos' && prob === 1 : r() < prob) {
        registros.push(crearRegistro(codigo, fecha, undefined, r, { ...base, producto: elegir(de(codigo)), lote: String(lote++) }));
      }
    }
    if (!esHoy) registros.push(crearRegistro('fq32-tequenos', fecha, '10:15', r, base));
    if (sale(0.4)) registros.push(crearRegistro('fq32-gluten-free', fecha, '11:00', r, base));
    if (sale(0.4)) registros.push(crearRegistro('fq32-empanadas', fecha, '09:40', r, base));
  }
  return { productos, operarios, registros: registros.reverse() };
}
