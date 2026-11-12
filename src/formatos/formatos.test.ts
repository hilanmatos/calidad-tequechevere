import { describe, expect, it } from 'vitest';
import {
  camposDiferidos, camposVisibles, desviaciones, esDiferido, estadoCampo, etapasVisibles, faltantes, pendientesDiferidos,
} from '../motor/evaluar';
import type { Campo, Contexto, DefinicionFormato, Producto } from '../motor/tipos';
import { minutosEntre, POR_DEFINIR } from './comunes';
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

  it('un registro viejo de boquita muestra lo que ya tenía, sin pedir los campos nuevos de congelación', () => {
    const boquita: Producto = { ...tequeno(false), nombre: 'Tequeño Boquita', llevaCongelacion: false };
    const ctx: Contexto = { valores: { tInicialCong: 6 }, producto: boquita, fecha: '2026-10-16' };
    const pide = [...faltantes(def, ctx), ...pendientesDiferidos(def, ctx)].map((x) => x.campoId);
    for (const nuevo of ['horaPrimeraBandeja', 'tUltimaBandeja', 'horaUltimaBandeja', 'bandejasCiclo']) expect(pide).not.toContain(nuevo);
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
    for (const codigo of ['cq-l2-empanadas-trigo', 'cq-l3-empanadas-maiz', 'cq-l5-yuca']) {
      expect(formato(codigo)!.version, codigo).toBe(2);
    }
    // v3: productos en caja transparente
    for (const codigo of ['cq-l1-tequenos', 'cq-l4-almond']) {
      expect(formato(codigo)!.version, codigo).toBe(3);
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

describe('productos en caja transparente', () => {
  // Operaciones: en caja transparente no se toman temperaturas internas, solo la superficial, al día siguiente en el empaque
  const enCaja = (linea: string, extra: Partial<Producto> = {}): Producto => ({
    ...tequeno(false), linea, nombre: 'Producto x50', presentacion: 'x50 · caja transparente', cajaTransparente: true, ...extra,
  });
  const normal = (linea: string, extra: Partial<Producto> = {}): Producto => ({ ...tequeno(false), linea, ...extra });
  const ctx = (producto: Producto, valores: Contexto['valores'] = {}): Contexto => ({ valores, producto, fecha: '2026-11-12' });
  const visibles = (def: DefinicionFormato, c: Contexto) => etapasVisibles(def, c).flatMap((e) => camposVisibles(e, c).map((x) => x.id));
  const etapas = (def: DefinicionFormato, c: Contexto) => etapasVisibles(def, c).map((e) => e.id);
  const pedidos = (def: DefinicionFormato, c: Contexto) => [...faltantes(def, c), ...pendientesDiferidos(def, c)].map((x) => x.campoId);

  describe('cq-l1-tequenos', () => {
    const def = formato('cq-l1-tequenos')!;
    const internas = [
      'tInternaTurbo', 'tInternaFreido', 'tInicialCong', 'horaPrimeraBandeja', 'tUltimaBandeja', 'horaUltimaBandeja', 'tiempoEntreBandejas', 'tFinal',
    ];

    it('no pide temperaturas internas, ni sus horas ni el tiempo entre bandejas; lo demás sigue igual', () => {
      // precocido para que también aparezca el freído
      const c = ctx(enCaja('cq-l1-tequenos', { esPrecocido: true }));
      const ids = visibles(def, c);
      for (const id of internas) {
        expect(ids, id).not.toContain(id);
        expect(pedidos(def, c), id).not.toContain(id);
      }
      expect(ids).toEqual(expect.arrayContaining([
        'aparienciaEnrollado', 'pesoPromedio', 'tAceite', 'aspectoFreido', 'bandejasCiclo', 'aparienciaCong', 'pesoEmpaque', 'metales',
      ]));
    });

    it('la etapa del turbo queda sin campos y no aparece como paso vacío', () => {
      const c = ctx(enCaja('cq-l1-tequenos'));
      expect(etapas(def, c)).not.toContain('turbo');
      // la congelación sigue por las bandejas por ciclo y la apariencia
      expect(etapas(def, c)).toContain('congelacion');
      expect(etapas(def, ctx(normal('cq-l1-tequenos')))).toContain('turbo');
    });

    it('pide la temperatura superficial como dato del día siguiente', () => {
      const c = ctx(enCaja('cq-l1-tequenos'));
      expect(faltantes(def, c).map((x) => x.campoId)).not.toContain('tSuperficial');
      expect(pendientesDiferidos(def, c).map((x) => x.campoId)).toContain('tSuperficial');
      expect(camposDiferidos(def)).toContain('tSuperficial');
      const campo = campoDe(def, 'tSuperficial');
      const empaque = def.etapas.find((e) => e.id === 'empaque')!;
      expect(empaque.campos).toContain(campo);
      expect(esDiferido(campo, empaque)).toBe(true);
      expect(campo.etiqueta).toBe('Temperatura superficial');
      expect(campo.ayuda).toBe('Se toma al día siguiente, en la superficie del producto empacado');
      expect(campo.pcc).toBe('PCC3');
      expect(campo.pcc).toBe(campoDe(def, 'tFinal').pcc);
      expect(campo.tipo === 'numero' && campo.unidad).toBe('°C');
      expect(campo.tipo === 'numero' && campo.limite).toEqual(POR_DEFINIR);
    });

    it('con un producto normal todo sigue igual', () => {
      const c = ctx(normal('cq-l1-tequenos'));
      const ids = visibles(def, c);
      expect(ids).not.toContain('tSuperficial');
      for (const id of ['tInternaTurbo', 'tInicialCong', 'horaPrimeraBandeja', 'tUltimaBandeja', 'horaUltimaBandeja', 'tiempoEntreBandejas', 'tFinal']) {
        expect(ids, id).toContain(id);
      }
      expect(faltantes(def, c).map((x) => x.campoId)).toContain('tInicialCong');
      expect(pendientesDiferidos(def, c).map((x) => x.campoId)).toEqual(expect.arrayContaining(['tUltimaBandeja', 'tFinal']));
      expect(pendientesDiferidos(def, c).map((x) => x.campoId)).not.toContain('tSuperficial');
      expect(visibles(def, ctx(normal('cq-l1-tequenos', { esPrecocido: true })))).toContain('tInternaFreido');
    });

    it('un registro viejo que ya tiene temperaturas internas las sigue mostrando', () => {
      const c = ctx(enCaja('cq-l1-tequenos'), { tInicialCong: 6, tFinal: -8 });
      const ids = visibles(def, c);
      expect(ids).toContain('tInicialCong');
      expect(ids).toContain('tFinal');
      // solo lo que ya tenía: no pide las demás temperaturas internas
      expect(pedidos(def, c)).not.toContain('horaPrimeraBandeja');
      expect(pedidos(def, c)).not.toContain('tUltimaBandeja');
      // ya midió la temperatura final interna: no se le pide además la superficial
      expect(ids).not.toContain('tSuperficial');
    });

    it('una temperatura superficial ya registrada se sigue mostrando aunque el producto deje de ir en caja', () => {
      expect(visibles(def, ctx(normal('cq-l1-tequenos'), { tSuperficial: -12 }))).toContain('tSuperficial');
    });
  });

  describe('cq-l4-almond', () => {
    const def = formato('cq-l4-almond')!;

    it('no pide temperaturas internas; la congelación sigue con la apariencia', () => {
      const c = ctx(enCaja('cq-l4-almond'));
      const ids = visibles(def, c);
      for (const id of ['tInternaCong', 'tFinal']) {
        expect(ids, id).not.toContain(id);
        expect(pedidos(def, c), id).not.toContain(id);
      }
      expect(etapas(def, c)).toContain('congelacion');
      expect(ids).toContain('aparienciaCong');
    });

    it('pide la temperatura superficial como dato del día siguiente, con el PCC que tenía la temperatura final', () => {
      const c = ctx(enCaja('cq-l4-almond'));
      expect(faltantes(def, c).map((x) => x.campoId)).not.toContain('tSuperficial');
      expect(pendientesDiferidos(def, c).map((x) => x.campoId)).toContain('tSuperficial');
      expect(camposDiferidos(def)).toContain('tSuperficial');
      const campo = campoDe(def, 'tSuperficial');
      expect(campo.etiqueta).toBe('Temperatura superficial');
      expect(campo.pcc).toBe('PCC2');
      expect(campo.pcc).toBe(campoDe(def, 'tFinal').pcc);
      expect(campo.tipo === 'numero' && campo.limite).toEqual(POR_DEFINIR);
    });

    it('con un producto normal todo sigue igual', () => {
      const c = ctx(normal('cq-l4-almond'));
      expect(visibles(def, c)).not.toContain('tSuperficial');
      expect(faltantes(def, c).map((x) => x.campoId)).toContain('tInternaCong');
      expect(pendientesDiferidos(def, c).map((x) => x.campoId)).toContain('tFinal');
    });

    it('un registro viejo con temperatura interna la sigue mostrando', () => {
      const ids = visibles(def, ctx(enCaja('cq-l4-almond'), { tInternaCong: -3, tFinal: -15 }));
      expect(ids).toContain('tInternaCong');
      expect(ids).toContain('tFinal');
      expect(ids).not.toContain('tSuperficial');
    });
  });
});
