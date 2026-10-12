import { describe, expect, it } from 'vitest';
import { desviaciones, estadoCampo, etapasVisibles, faltantes } from '../motor/evaluar';
import type { Contexto, Producto } from '../motor/tipos';
import { FORMATOS, formato } from './index';

const tequeno = (esPrecocido: boolean): Producto => ({
  id: 'p', codigo: 'PT013', nombre: 'Tequeño', linea: 'cq-l1-tequenos', presentacion: '20 unidades',
  llevaRelleno: true, esPrecocido, activo: true, pesoDeclaradoKg: 0.8, vidaUtilMeses: 6,
});

describe('catálogo de formatos', () => {
  it('tiene 12 formatos con códigos e ids de campo únicos', () => {
    expect(FORMATOS).toHaveLength(12);
    expect(new Set(FORMATOS.map((f) => f.codigo)).size).toBe(12);
    for (const f of FORMATOS) {
      expect(f.etapas.length).toBeGreaterThan(0);
      const ids = f.etapas.flatMap((e) => e.campos.map((c) => c.id));
      // la etapa de sensorial y otros bloques se reutilizan entre formatos, pero no dentro de uno
      expect(new Set(ids).size, f.codigo).toBe(ids.length);
    }
  });
});

describe('temp-cuartos', () => {
  const def = formato('temp-cuartos')!;
  const campo = def.etapas[0].campos.find((c) => c.id === 'congPBDisplay')!;
  const ctx = (v: number): Contexto => ({ valores: { congPBDisplay: v }, fecha: '2026-10-12' });

  it('exige −18 °C o menos en congelación', () => {
    expect(estadoCampo(campo, ctx(-12))).toBe('fuera');
    expect(estadoCampo(campo, ctx(-19))).toBe('ok');
  });

  it('calcula la diferencia pistola contra cuarto', () => {
    const dif = def.etapas[0].campos.find((c) => c.id === 'frioPBDiferencia')!;
    expect(dif.tipo === 'calculado' && dif.formula({ valores: { frioPBPistola: -1.6, frioPBDisplay: 3.6 }, fecha: '' })).toBe(-5.2);
  });
});

describe('cq-l1-tequenos', () => {
  const def = formato('cq-l1-tequenos')!;

  it('solo muestra freído en precocidos', () => {
    const ids = (p: boolean) => etapasVisibles(def, { valores: {}, producto: tequeno(p), fecha: '2026-10-12' }).map((e) => e.id);
    expect(ids(false)).not.toContain('freido');
    expect(ids(true)).toContain('freido');
  });

  it('marca bajo peso del empaque como desviación', () => {
    const ctx: Contexto = { valores: { pesoEmpaque: 0.79 }, producto: tequeno(false), fecha: '2026-10-12' };
    const d = desviaciones(def, ctx).map((x) => x.campoId);
    expect(d).toContain('diferenciaPeso');
  });

  it('pide los campos obligatorios y no los sensoriales', () => {
    const f = faltantes(def, { valores: {}, producto: tequeno(false), fecha: '2026-10-12' }).map((x) => x.campoId);
    expect(f).toContain('tMasa');
    expect(f).toContain('metales');
    expect(f).not.toContain('sabor');
  });
});

describe('lavado-manos', () => {
  it('no incluye el horario de 2:30 p. m. los sábados', () => {
    const campo = formato('lavado-manos')!.etapas[0].campos[0];
    if (campo.tipo !== 'checklist') throw new Error('tipo');
    const col = campo.columnas.find((c) => c.id === 'h1430')!;
    expect(col.aplica!({ valores: {}, fecha: '2026-10-17' })).toBe(false);
    expect(col.aplica!({ valores: {}, fecha: '2026-10-16' })).toBe(true);
  });
});
