import { describe, expect, it } from 'vitest';
import { FORMATOS } from '../formatos';
import { camposDiferidos } from '../motor/evaluar';
import catalogoPy from '../../tools/importar/catalogo.py?raw';

/** Todas las migraciones por nombre de archivo: cada una puede sembrar más campos del día siguiente. */
const MIGRACIONES = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sql = Object.keys(MIGRACIONES).sort().map((k) => MIGRACIONES[k]).join('\n');
const cajaTransparente = Object.entries(MIGRACIONES).find(([k]) => k.endsWith('_caja_transparente.sql'))?.[1] ?? '';

/** Pares (formato, campo) que siembran las migraciones en public.campos_diferidos. */
function sembrados(texto: string): string[] {
  const bloques = texto.match(/insert into public\.campos_diferidos[^;]*;/gi) ?? [];
  return bloques.flatMap((b) => [...b.matchAll(/\('([\w-]+)',\s*'(\w+)'\)/g)].map((m) => `${m[1]}|${m[2]}`));
}

describe('migraciones del día siguiente', () => {
  it('siembran exactamente los campos diferidos de los formatos', () => {
    const desdeTs = FORMATOS.flatMap((f) => camposDiferidos(f).map((c) => `${f.codigo}|${c}`)).sort();
    const desdeSql = sembrados(sql);
    expect(desdeTs.length).toBeGreaterThan(0);
    expect(new Set(desdeSql).size, 'pares repetidos en el SQL').toBe(desdeSql.length);
    expect([...desdeSql].sort()).toEqual(desdeTs);
  });
});

describe('migración de caja transparente', () => {
  /** (línea, nombre, presentación) de tools/importar/catalogo.py. */
  const catalogo = [...catalogoPy.matchAll(/\('([\w-]+)',\s*'[^']*',\s*'([^']+)',\s*'([^']*)'\)/g)].map((m) => ({
    linea: m[1], nombre: m[2], presentacion: m[3],
  }));
  const presentacionEnCatalogo = (linea: string, nombre: string) =>
    catalogo.find((p) => p.linea === linea && p.nombre === nombre)?.presentacion;

  it('los productos nuevos y las presentaciones que cambian coinciden con el catálogo del importador', () => {
    expect(cajaTransparente).not.toBe('');
    // filas de productos nuevos: ('', 'Nombre', 'línea', 'presentación', …
    const nuevos = [...cajaTransparente.matchAll(/\('',\s*'([^']+)',\s*'([\w-]+)',\s*'([^']*)'/g)];
    expect(nuevos).toHaveLength(7);
    for (const [, nombre, linea, presentacion] of nuevos) {
      expect(presentacionEnCatalogo(linea, nombre), nombre).toBe(presentacion);
    }
    // update public.productos set presentacion = '…' … where linea = '…' and nombre = '…';
    const cambios = [...cajaTransparente.matchAll(/set presentacion = '([^']*)'[^;]*?linea = '([\w-]+)' and nombre = '([^']+)'/g)];
    expect(cambios).toHaveLength(6);
    for (const [, presentacion, linea, nombre] of cambios) {
      expect(presentacionEnCatalogo(linea, nombre), nombre).toBe(presentacion);
    }
  });
});
