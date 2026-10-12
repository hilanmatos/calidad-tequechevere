import { describe, expect, it } from 'vitest';
import { FORMATOS } from '../formatos';
import { generarDemo } from './demo';

describe('generarDemo', () => {
  const demo = generarDemo('2026-10-12');

  it('cubre los 12 formatos con varias semanas de datos', () => {
    const codigos = new Set(demo.registros.map((r) => r.formato));
    expect(codigos.size).toBe(FORMATOS.length);
    expect(demo.registros.length).toBeGreaterThan(200);
  });

  it('incluye algunas desviaciones, pero son minoría', () => {
    const con = demo.registros.filter((r) => r.desviaciones.some((d) => d.severidad !== 'por-confirmar'));
    expect(con.length).toBeGreaterThan(5);
    expect(con.length).toBeLessThan(demo.registros.length * 0.6);
  });
});
