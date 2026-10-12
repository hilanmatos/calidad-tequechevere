import { describe, expect, it } from 'vitest';
import type { Registro } from '../datos/repositorio';
import { estacionesRutina, rutinaDelDia } from './rutina';

const reg = (formato: string, fecha: string, area?: string): Registro => ({
  id: `${formato}-${fecha}-${area}`, formato, versionFormato: 1, fecha, area, datos: {}, desviaciones: [],
  tieneDesviacionPcc: false, fotos: [], origen: 'app', realizadoPor: 'X', creadoEn: `${fecha}T10:00:00Z`,
});

describe('rutinaDelDia', () => {
  it('espera cuartos una vez y personal por cada área, solo del día indicado', () => {
    const pasos = rutinaDelDia([
      reg('temp-cuartos', '2026-10-12'),
      reg('higiene-uniforme', '2026-10-12', 'Planta Alta'),
      reg('higiene-uniforme', '2026-10-11', 'Gluten Free'),
    ], '2026-10-12');
    const est = estacionesRutina(pasos);
    const por = Object.fromEntries(est.map((e) => [e.def.codigo, `${e.hechos}/${e.total}`]));
    expect(por).toEqual({ 'temp-cuartos': '1/1', 'higiene-uniforme': '1/2', 'lavado-manos': '0/2' });
  });
});
