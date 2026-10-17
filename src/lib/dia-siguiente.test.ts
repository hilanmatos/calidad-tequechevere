import { describe, expect, it } from 'vitest';
import type { Registro, Usuario } from '../datos/repositorio';
import type { Producto } from '../motor/tipos';
import { fechaLimite, pendientesDeRegistro, porCompletar, puedeCompletar } from './dia-siguiente';

const asistente: Usuario = { id: 'u1', correo: 'a@x', nombre: 'Asistente', rol: 'capturista' };
const disco: Producto = {
  id: 'p1', codigo: 'PD001', nombre: 'Discos', linea: 'cq-l2-empanadas-trigo', presentacion: '12 unidades',
  llevaRelleno: false, esPrecocido: false, activo: true,
};
const reg = (p: Partial<Registro>): Registro => ({
  id: 'r1', formato: 'cq-l2-empanadas-trigo', versionFormato: 2, fecha: '2026-10-16', productoId: 'p1', lote: '29001',
  datos: {}, desviaciones: [], tieneDesviacionPcc: false, fotos: [], origen: 'app', realizadoPor: 'Asistente',
  creadoPor: 'u1', creadoEn: '2026-10-16T15:00:00Z', ...p,
});

describe('puedeCompletar', () => {
  it('el creador o un administrador, hasta 2 días después de la fecha del registro', () => {
    expect(puedeCompletar(reg({}), asistente, '2026-10-18')).toBe(true);
    expect(puedeCompletar(reg({}), asistente, '2026-10-19')).toBe(false);
    expect(puedeCompletar(reg({}), { ...asistente, id: 'u2' }, '2026-10-17')).toBe(false);
    expect(puedeCompletar(reg({}), { ...asistente, id: 'u2', rol: 'admin' }, '2026-10-17')).toBe(true);
  });

  it('la fecha límite es 2 días después de la fecha del registro', () => {
    expect(fechaLimite('2026-10-30')).toBe('2026-11-01');
  });
});

describe('pendientesDeRegistro', () => {
  it('lista los campos del día siguiente vacíos según el producto', () => {
    const ids = pendientesDeRegistro(reg({ datos: { tInternaCong: -19 } }), [disco]).map((f) => f.campoId);
    expect(ids).toContain('aparienciaCong');
    expect(ids).toContain('metales');
    expect(ids).not.toContain('tInternaCong');
    // los discos no llevan relleno
    expect(ids).not.toContain('tRelleno');
  });

  it('lo importado del Excel no queda pendiente', () => {
    expect(pendientesDeRegistro(reg({ origen: 'importado' }), [disco])).toEqual([]);
  });
});

describe('porCompletar', () => {
  it('solo registros de los últimos 2 días con datos pendientes', () => {
    const lleno = reg({ id: 'lleno', formato: 'temp-cuartos', productoId: undefined });
    const viejo = reg({ id: 'viejo', fecha: '2026-10-10' });
    const res = porCompletar([reg({}), lleno, viejo], [disco], '2026-10-17');
    expect(res.map((x) => x.registro.id)).toEqual(['r1']);
    expect(res[0].pendientes.length).toBeGreaterThan(0);
  });
});
