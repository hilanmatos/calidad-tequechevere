import { describe, expect, it } from 'vitest';
import { camposDiferidos, desviaciones, estadoCampo, etapasVisibles, faltantes, pendientesDiferidos } from '../motor/evaluar';
import type { Campo, Contexto, DefinicionFormato, Producto } from '../motor/tipos';
import { minutosEntre } from './comunes';
import { FORMATOS, formato } from './index';

const campoDe = (def: DefinicionFormato, id: string): Campo => def.etapas.flatMap((e) => e.campos).find((c) => c.id === id)!;
const idsEtapa = (def: DefinicionFormato, etapa: string) => def.etapas.find((e) => e.id === etapa)!.campos.map((c) => c.id);

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

  it('pide los campos obligatorios y no los sensoriales; el empaque queda para el día siguiente', () => {
    const ctx: Contexto = { valores: {}, producto: tequeno(false), fecha: '2026-10-12' };
    const f = faltantes(def, ctx).map((x) => x.campoId);
    expect(f).toContain('tMasa');
    expect(f).not.toContain('metales');
    expect(f).not.toContain('sabor');
    expect(pendientesDiferidos(def, ctx).map((x) => x.campoId)).toContain('metales');
  });

  it('pide lote y conformidad del queso; el comentario es opcional', () => {
    expect(idsEtapa(def, 'masa')).toEqual(expect.arrayContaining(['proveedorQueso', 'loteQueso', 'quesoConforme', 'comentarioQueso']));
    const f = faltantes(def, { valores: {}, producto: tequeno(false), fecha: '2026-10-12' }).map((x) => x.campoId);
    expect(f).toContain('loteQueso');
    expect(f).toContain('quesoConforme');
    expect(f).not.toContain('comentarioQueso');
    const ctx: Contexto = { valores: { quesoConforme: 'No conforme' }, producto: tequeno(false), fecha: '2026-10-12' };
    expect(desviaciones(def, ctx).map((x) => x.campoId)).toContain('quesoConforme');
  });

  it('evalúa el peso del relleno contra el rango del producto, y sin rango no lo limita', () => {
    const relleno = campoDe(def, 'pesoRelleno');
    const conRango: Producto = { ...tequeno(false), pesoRellenoMinG: 16, pesoRellenoMaxG: 18 };
    const ctx = (v: number, producto: Producto): Contexto => ({ valores: { pesoRelleno: v }, producto, fecha: '2026-10-12' });
    expect(estadoCampo(relleno, ctx(15.5, conRango))).toBe('fuera');
    expect(estadoCampo(relleno, ctx(17, conRango))).toBe('ok');
    expect(estadoCampo(relleno, ctx(18.4, conRango))).toBe('fuera');
    expect(estadoCampo(relleno, ctx(15.5, tequeno(false)))).toBe('ok');
    // obligatorio en L1
    expect(faltantes(def, { valores: {}, producto: conRango, fecha: '2026-10-12' }).map((x) => x.campoId)).toContain('pesoRelleno');
  });

  it('registra primera y última bandeja de la congelación', () => {
    expect(idsEtapa(def, 'congelacion')).toEqual(expect.arrayContaining([
      'tInicialCong', 'horaPrimeraBandeja', 'tUltimaBandeja', 'horaUltimaBandeja', 'tiempoEntreBandejas', 'bandejasCiclo',
    ]));
    expect(campoDe(def, 'tInicialCong').etiqueta).toBe('Temperatura de la primera bandeja');
    expect(campoDe(def, 'tInicialCong').pcc).toBe('PCC2');
    expect(campoDe(def, 'tUltimaBandeja').pcc).toBe('PCC2');
    const t = campoDe(def, 'tiempoEntreBandejas');
    expect(t.tipo === 'calculado' && t.formula({ valores: { horaPrimeraBandeja: '08:10', horaUltimaBandeja: '09:35' }, fecha: '' })).toBe(85);
  });

  it('las boquitas no pasan por congelación, salvo registros viejos que ya la tienen', () => {
    const boquita: Producto = { ...tequeno(false), nombre: 'Tequeño Boquita', llevaCongelacion: false };
    const etapas = (producto: Producto, valores: Contexto['valores'] = {}) =>
      etapasVisibles(def, { valores, producto, fecha: '2026-10-12' }).map((e) => e.id);
    expect(etapas(boquita)).not.toContain('congelacion');
    expect(etapas(tequeno(false))).toContain('congelacion');
    expect(etapas(boquita, { tInicialCong: 6 })).toContain('congelacion');
    expect(faltantes(def, { valores: {}, producto: boquita, fecha: '2026-10-12' }).map((x) => x.campoId)).not.toContain('tInicialCong');
  });
});

describe('minutosEntre', () => {
  it('cuenta los minutos entre dos horas', () => {
    expect(minutosEntre('08:10', '09:35')).toBe(85);
    expect(minutosEntre('14:00', '14:00')).toBe(0);
  });

  it('si la última hora es menor, asume que pasó la medianoche', () => {
    expect(minutosEntre('23:40', '00:25')).toBe(45);
    expect(minutosEntre('22:00', '01:30')).toBe(210);
  });

  it('sin alguna de las dos horas no calcula', () => {
    expect(minutosEntre(undefined, '09:00')).toBeUndefined();
    expect(minutosEntre('09:00', '')).toBeUndefined();
    expect(minutosEntre('9h', '10:00')).toBeUndefined();
  });
});

describe('cq-l5-yuca', () => {
  const def = formato('cq-l5-yuca')!;
  const yuca: Producto = { ...tequeno(true), linea: 'cq-l5-yuca' };
  const ctx = (valores: Contexto['valores']): Contexto => ({ valores, producto: yuca, fecha: '2026-10-12' });
  const visiblesEnMasa = (c: Contexto) => def.etapas.find((e) => e.id === 'masa')!.campos.filter((x) => !x.aplica || x.aplica(c)).map((x) => x.id);

  it('pide la altura del agua y solo muestra la cantidad de agua en registros viejos', () => {
    const altura = campoDe(def, 'alturaAgua');
    expect(altura.tipo === 'numero' && altura.unidad).toBe('cm');
    const f = faltantes(def, ctx({})).map((x) => x.campoId);
    expect(f).toContain('alturaAgua');
    expect(f).not.toContain('cantidadAgua');
    expect(visiblesEnMasa(ctx({}))).not.toContain('cantidadAgua');
    expect(visiblesEnMasa(ctx({ cantidadAgua: 20 }))).toContain('cantidadAgua');
    expect(faltantes(def, ctx({ cantidadAgua: 20 })).map((x) => x.campoId)).not.toContain('cantidadAgua');
  });

  it('registra primera y última bandeja de la congelación con el tiempo entre ambas', () => {
    expect(idsEtapa(def, 'congelacion')).toEqual(expect.arrayContaining([
      'tInternaCong', 'horaPrimeraBandeja', 'tUltimaBandeja', 'horaUltimaBandeja', 'tiempoEntreBandejas',
    ]));
    expect(campoDe(def, 'tInternaCong').etiqueta).toBe('Temperatura de la primera bandeja');
    const t = campoDe(def, 'tiempoEntreBandejas');
    expect(t.tipo === 'calculado' && t.formula({ valores: { horaPrimeraBandeja: '23:50', horaUltimaBandeja: '00:20' }, fecha: '' })).toBe(30);
  });
});

describe('empanadas', () => {
  for (const codigo of ['cq-l2-empanadas-trigo', 'cq-l3-empanadas-maiz']) {
    const def = formato(codigo)!;
    const empanada: Producto = { ...tequeno(false), linea: codigo };

    it(`${codigo}: congelación y empaque se completan al día siguiente`, () => {
      const ctx: Contexto = { valores: {}, producto: empanada, fecha: '2026-10-12' };
      const f = faltantes(def, ctx).map((x) => x.campoId);
      const p = pendientesDiferidos(def, ctx).map((x) => x.campoId);
      for (const id of ['tInternaCong', 'aparienciaCong', 'pesoEmpaque', 'metales', 'tFinalEmpaque']) {
        expect(f, id).not.toContain(id);
        expect(p, id).toContain(id);
      }
      expect(f).toContain('tMasa');
    });

    it(`${codigo}: registra la temperatura final de empaque, sin límite`, () => {
      const campo = campoDe(def, 'tFinalEmpaque');
      expect(idsEtapa(def, 'empaque')).toContain('tFinalEmpaque');
      expect(campo.etiqueta).toBe('Temperatura final de empaque');
      expect(campo.ayuda).toMatch(/día siguiente/);
      expect(estadoCampo(campo, { valores: { tFinalEmpaque: -5 }, fecha: '2026-10-12' })).toBe('ok');
    });
  }
});

describe('formatos de línea con empaque al día siguiente', () => {
  it('L1, L4 y L5 difieren el empaque completo; L2 y L3 además la congelación', () => {
    const diferidas = (codigo: string) => formato(codigo)!.etapas.filter((e) => e.diferida).map((e) => e.id);
    expect(diferidas('cq-l1-tequenos')).toEqual(['empaque']);
    expect(diferidas('cq-l4-almond')).toEqual(['empaque']);
    expect(diferidas('cq-l5-yuca')).toEqual(['empaque']);
    expect(diferidas('cq-l2-empanadas-trigo')).toEqual(['congelacion', 'empaque']);
    expect(diferidas('cq-l3-empanadas-maiz')).toEqual(['congelacion', 'empaque']);
    expect(camposDiferidos(formato('cq-l1-tequenos')!)).toContain('diferenciaPeso');
  });

  it('suben de versión los formatos que cambiaron', () => {
    for (const codigo of ['cq-l1-tequenos', 'cq-l2-empanadas-trigo', 'cq-l3-empanadas-maiz', 'cq-l4-almond', 'cq-l5-yuca']) {
      expect(formato(codigo)!.version, codigo).toBe(2);
    }
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

describe('última bandeja de congelación', () => {
  it('se puede completar al día siguiente en tequeños y yuca (el ciclo puede terminar tarde)', () => {
    for (const codigo of ['cq-l1-tequenos', 'cq-l5-yuca']) {
      const diferidos = camposDiferidos(formato(codigo)!);
      expect(diferidos).toEqual(expect.arrayContaining(['tUltimaBandeja', 'horaUltimaBandeja', 'tiempoEntreBandejas']));
      expect(diferidos).not.toContain('horaPrimeraBandeja');
    }
  });
});
