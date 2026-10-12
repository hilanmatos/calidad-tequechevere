import { describe, expect, it } from 'vitest';
import type { Registro } from '../datos/repositorio';
import type { Desviacion } from '../motor/tipos';
import { cuartosResumen, higienePorCriterio, indicadores, lavadoMapa, pareto, porDia, serieCampo } from './series';

let n = 0;
const reg = (p: Partial<Registro>): Registro => ({
  id: `r${++n}`, formato: 'temp-cuartos', versionFormato: 1, fecha: '2026-10-10', datos: {}, desviaciones: [],
  tieneDesviacionPcc: false, fotos: [], origen: 'app', realizadoPor: 'X', creadoEn: '2026-10-10T10:00:00Z', ...p,
});
const desv = (etiqueta: string, severidad: Desviacion['severidad'] = 'calidad'): Desviacion => ({
  campoId: etiqueta, etiqueta, etapa: 'E', valor: '1', esperado: '0', severidad,
});

describe('indicadores', () => {
  it('cuenta conformidad sin contar avisos por confirmar', () => {
    const k = indicadores([
      reg({}),
      reg({ desviaciones: [desv('a', 'por-confirmar')] }),
      reg({ desviaciones: [desv('b'), desv('c', 'pcc')], tieneDesviacionPcc: true }),
    ]);
    expect(k).toEqual({ total: 3, conformes: 2, pctConformidad: 2 / 3, desviaciones: 2, conPcc: 1 });
  });
});

describe('porDia', () => {
  it('rellena los días sin registros', () => {
    const d = porDia([reg({ fecha: '2026-10-10' }), reg({ fecha: '2026-10-12', desviaciones: [desv('x')] })], '2026-10-10', '2026-10-12');
    expect(d).toEqual([
      { fecha: '2026-10-10', conformes: 1, conDesviacion: 0 },
      { fecha: '2026-10-11', conformes: 0, conDesviacion: 0 },
      { fecha: '2026-10-12', conformes: 0, conDesviacion: 1 },
    ]);
  });
});

describe('pareto', () => {
  it('ordena por frecuencia y acumula porcentaje', () => {
    const p = pareto([
      reg({ desviaciones: [desv('Mascarilla'), desv('Uñas')] }),
      reg({ desviaciones: [desv('Mascarilla')] }),
      reg({ desviaciones: [desv('Mascarilla'), desv('aviso', 'por-confirmar')] }),
    ]);
    expect(p.map((x) => [x.etiqueta, x.cantidad])).toEqual([['Mascarilla', 3], ['Uñas', 1]]);
    expect(p[0].acumulado).toBeCloseTo(0.75);
    expect(p[1].acumulado).toBeCloseTo(1);
  });
});

describe('serieCampo', () => {
  it('ordena por fecha y hora y omite vacíos y "Ambiente"', () => {
    const s = serieCampo([
      reg({ fecha: '2026-10-11', hora: '14:00', datos: { t: 4 } }),
      reg({ fecha: '2026-10-11', hora: '07:30', datos: { t: 3 } }),
      reg({ fecha: '2026-10-10', datos: { t: 'Ambiente' } }),
      reg({ fecha: '2026-10-09', datos: {} }),
    ], 'temp-cuartos', 't');
    expect(s.map((x) => x.valor)).toEqual([3, 4]);
  });
});

describe('cuartosResumen', () => {
  it('promedia y cuenta lecturas fuera de rango', () => {
    const r = cuartosResumen([
      reg({ datos: { congPBDisplay: -19, congPBPistola: -25 } }),
      reg({ datos: { congPBDisplay: -15, congPBPistola: -21 } }),
    ]).find((c) => c.id === 'congPB')!;
    expect(r).toMatchObject({ n: 2, promedio: -17, fuera: 1, diferencia: -6 });
  });
});

describe('higiene y lavado', () => {
  const higiene = reg({
    formato: 'higiene-uniforme',
    datos: { revision: { o1: { mascarilla: 'falla', manos: 'cumple' }, o2: { mascarilla: 'cumple', manos: 'na' } } },
  });

  it('cuenta fallas por criterio sobre las revisiones aplicables', () => {
    const c = higienePorCriterio([higiene]);
    const masc = c.find((x) => x.id === 'mascarilla')!;
    const manos = c.find((x) => x.id === 'manos')!;
    expect([masc.revisiones, masc.fallas]).toEqual([2, 1]);
    expect([manos.revisiones, manos.fallas]).toEqual([1, 0]);
  });

  it('calcula cumplimiento de lavado ignorando pendientes y ausentes', () => {
    const m = lavadoMapa([reg({
      formato: 'lavado-manos', fecha: '2026-10-10',
      datos: { lavado: { o1: { h0630: 'lavo', h0930: 'no', h1230: 'pendiente' }, o2: { _ausente: 'si' } } },
    })]);
    expect(m).toEqual([{ operarioId: 'o1', fecha: '2026-10-10', lavo: 1, total: 2 }]);
  });
});
