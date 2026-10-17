import { describe, expect, it } from 'vitest';
import { FORMATOS } from '../formatos';
import { camposDiferidos } from '../motor/evaluar';
import sql from '../../supabase/migrations/20261017000000_dia_siguiente.sql?raw';

/** Pares (formato, campo) que siembra la migración en public.campos_diferidos. */
function sembrados(texto: string): string[] {
  const bloque = /insert into public\.campos_diferidos[^;]*;/i.exec(texto)?.[0] ?? '';
  return [...bloque.matchAll(/\('([\w-]+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}|${m[2]}`);
}

describe('migración del día siguiente', () => {
  it('siembra exactamente los campos diferidos de los formatos', () => {
    const desdeTs = FORMATOS.flatMap((f) => camposDiferidos(f).map((c) => `${f.codigo}|${c}`)).sort();
    const desdeSql = sembrados(sql);
    expect(desdeTs.length).toBeGreaterThan(0);
    expect(new Set(desdeSql).size, 'pares repetidos en el SQL').toBe(desdeSql.length);
    expect([...desdeSql].sort()).toEqual(desdeTs);
  });
});
