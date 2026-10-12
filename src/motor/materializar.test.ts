import { describe, expect, it } from 'vitest';
import { formato } from '../formatos';
import { completarChecklist } from './materializar';
import type { CampoChecklist, Contexto } from './tipos';

describe('completarChecklist', () => {
  const campo = formato('higiene-uniforme')!.etapas[0].campos[0] as CampoChecklist;
  const ctx: Contexto = {
    valores: {}, fecha: '2026-10-12', area: 'Planta Alta',
    operarios: [
      { id: 'a', nombre: 'A', area: 'Planta Alta', activo: true },
      { id: 'b', nombre: 'B', area: 'Planta Alta', activo: true },
      { id: 'c', nombre: 'C', area: 'Gluten Free', activo: true },
    ],
  };

  it('llena con "cumple" lo no tocado, respeta las ausencias y solo incluye el área', () => {
    const r = completarChecklist(campo, ctx, { a: { mascarilla: 'falla' }, b: { _ausente: 'si', _obs: 'vacaciones' } });
    expect(Object.keys(r)).toEqual(['a', 'b']);
    expect(r.a.mascarilla).toBe('falla');
    expect(r.a.salud).toBe('cumple');
    expect(r.b).toEqual({ _ausente: 'si', _obs: 'vacaciones' });
  });
});
