import { describe, expect, it } from 'vitest';
import type { Contexto, DefinicionFormato, Producto } from './tipos';
import {
  desviaciones,
  estadoCampo,
  estadoNumero,
  etapasVisibles,
  faltantes,
  resumenMuestras,
  sumarDias,
  sumarMeses,
  claveUnica,
  textoLimite,
} from './evaluar';

const precocido: Producto = {
  id: 'p1', codigo: 'PT013', nombre: 'Tequeño precocido', linea: 'cq-l1-tequenos', presentacion: '20 uds',
  llevaRelleno: true, esPrecocido: true, activo: true, pesoUnidadMinG: 16, pesoUnidadMaxG: 17,
};
const crudo: Producto = { ...precocido, id: 'p2', esPrecocido: false };

const def: DefinicionFormato = {
  codigo: 'prueba', version: 1, nombre: 'Prueba', nombreCorto: 'Prueba', familia: 'linea', icono: 'flask',
  usaProducto: true, usaLote: false, usaHora: false, frecuencia: 'por-produccion',
  etapas: [
    {
      id: 'masa', titulo: 'Masa',
      campos: [
        { id: 'tMasa', etiqueta: 'Temperatura de masa', tipo: 'numero', unidad: '°C', limite: { max: 30, porConfirmar: true } },
        { id: 'apariencia', etiqueta: 'Apariencia', tipo: 'conforme' },
        { id: 'nota', etiqueta: 'Nota', tipo: 'texto', opcional: true },
      ],
    },
    {
      id: 'freido', titulo: 'Freído', aplica: (c) => !!c.producto?.esPrecocido,
      campos: [
        { id: 'tInterna', etiqueta: 'Temperatura interna', tipo: 'numero', unidad: '°C', pcc: 'PCC1', limite: { min: 70 } },
      ],
    },
    {
      id: 'personal', titulo: 'Personal',
      campos: [
        {
          id: 'higiene', etiqueta: 'Higiene', tipo: 'checklist', porDefecto: 'cumple',
          columnas: [{ id: 'mascarilla', etiqueta: 'Mascarilla' }],
          estados: [
            { id: 'cumple', etiqueta: 'Cumple', corta: '✓', tono: 'ok' },
            { id: 'falla', etiqueta: 'Falla', corta: '✗', tono: 'fuera' },
          ],
        },
      ],
    },
  ],
};

const ctx = (valores: Contexto['valores'], producto?: Producto): Contexto => ({
  valores, producto, fecha: '2026-10-12',
  operarios: [{ id: 'o1', nombre: 'Operario Uno', area: 'Tequeños', activo: true }],
});

describe('estadoNumero', () => {
  it('marca fuera, ok, alerta y vacío', () => {
    expect(estadoNumero(5, { max: 4 })).toBe('fuera');
    expect(estadoNumero(3, { min: 1, max: 5 })).toBe('ok');
    expect(estadoNumero(-12, { max: -18, porConfirmar: true })).toBe('alerta');
    expect(estadoNumero(undefined, { max: 4 })).toBe('vacio');
    expect(estadoNumero(7, undefined)).toBe('ok');
  });
});

describe('textoLimite', () => {
  it('describe rangos con signo menos tipográfico', () => {
    expect(textoLimite({ min: 1, max: 5 }, '°C')).toBe('1 a 5 °C');
    expect(textoLimite({ max: -18 }, '°C')).toBe('≤ −18 °C');
    expect(textoLimite({ min: 70 }, '°C')).toBe('≥ 70 °C');
  });
});

describe('visibilidad', () => {
  it('oculta etapas que no aplican al producto', () => {
    expect(etapasVisibles(def, ctx({}, crudo)).map((e) => e.id)).toEqual(['masa', 'personal']);
    expect(etapasVisibles(def, ctx({}, precocido)).map((e) => e.id)).toEqual(['masa', 'freido', 'personal']);
  });

  it('no exige campos ocultos ni opcionales', () => {
    const f = faltantes(def, ctx({ tMasa: 25 }, crudo)).map((x) => x.campoId);
    expect(f).toEqual(['apariencia']);
  });
});

describe('estadoCampo', () => {
  it('acepta "Ambiente" como valor válido de un número', () => {
    const campo = { id: 't', etiqueta: 'T agua', tipo: 'numero' as const, unidad: '°C' as const, permiteAmbiente: true, limite: { max: 10 } };
    expect(estadoCampo(campo, ctx({ t: 'Ambiente' }))).toBe('ok');
  });
});

describe('desviaciones', () => {
  it('clasifica por severidad', () => {
    const d = desviaciones(def, ctx({
      tMasa: 33, apariencia: 'No conforme', tInterna: 60,
      higiene: { o1: { mascarilla: 'falla' } },
    }, precocido));
    const porCampo = Object.fromEntries(d.map((x) => [x.etiqueta, x.severidad]));
    expect(porCampo['Temperatura de masa']).toBe('por-confirmar');
    expect(porCampo['Apariencia']).toBe('calidad');
    expect(porCampo['Temperatura interna']).toBe('pcc');
    expect(porCampo['Mascarilla']).toBe('calidad');
    const higiene = d.find((x) => x.etiqueta === 'Mascarilla');
    expect(higiene?.valor).toBe('Operario Uno');
  });

  it('no reporta nada cuando todo cumple', () => {
    expect(desviaciones(def, ctx({ tMasa: 25, apariencia: 'Conforme', higiene: {} }, crudo))).toEqual([]);
  });
});

describe('resumenMuestras', () => {
  it('calcula promedio y fuera de tolerancia ignorando vacíos', () => {
    expect(resumenMuestras([16.2, 17.4, null], { min: 16, max: 17 })).toEqual({
      n: 2, promedio: 16.8, minimo: 16.2, maximo: 17.4, fuera: 1,
    });
    expect(resumenMuestras([null, null]).n).toBe(0);
  });
});

describe('sumarDias', () => {
  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-10-12', 180)).toBe('2027-04-10');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('sumarMeses', () => {
  it('conserva el día y ajusta fin de mes', () => {
    expect(sumarMeses('2026-08-01', 6)).toBe('2027-02-01');
    expect(sumarMeses('2026-08-31', 6)).toBe('2027-02-28');
  });
});

describe('claveUnica', () => {
  const base = { ...def, codigo: 'x' };
  it('arma la clave según la regla del formato', () => {
    expect(claveUnica({ ...base, unicidad: 'dia' }, { fecha: '2026-10-12' })).toBe('x|2026-10-12');
    expect(claveUnica({ ...base, unicidad: 'dia-area' }, { fecha: '2026-10-12', area: 'Tienda' })).toBe('x|2026-10-12|Tienda');
    expect(claveUnica({ ...base, unicidad: 'dia-area' }, { fecha: '2026-10-12' })).toBeNull();
    expect(claveUnica({ ...base, unicidad: 'lote' }, { fecha: '2026-10-12', lote: ' 28 950 ' })).toBe('x|lote|28950');
    expect(claveUnica(base, { fecha: '2026-10-12' })).toBeNull();
  });
});

describe('ausencias', () => {
  it('una persona que no asistió no genera desviaciones aunque tenga celdas marcadas', () => {
    const d = desviaciones(def, ctx({ tMasa: 25, apariencia: 'Conforme', higiene: { o1: { _ausente: 'si', mascarilla: 'falla' } } }, crudo));
    expect(d).toEqual([]);
  });
});
