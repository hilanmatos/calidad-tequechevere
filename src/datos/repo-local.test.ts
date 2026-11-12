import { describe, expect, it } from 'vitest';
import { SOLO_ADMIN_OPERARIO } from '../lib/permisos';
import { repoLocal } from './repo-local';
import type { Usuario } from './repositorio';

const capturista: Usuario = { id: 'u1', correo: 'a@x', nombre: 'Asistente', rol: 'capturista' };

describe('repoLocal: operarios con las mismas reglas que Supabase', () => {
  it('un capturista agrega operarios y los desactiva o reactiva, pero no cambia su nombre ni su área', async () => {
    const repo = repoLocal(capturista);
    await repo.guardarOperario({ id: '', nombre: 'Persona Nueva', area: 'Gluten Free', activo: true });
    const nueva = (await repo.operarios()).find((o) => o.nombre === 'Persona Nueva')!;
    expect(nueva).toMatchObject({ area: 'Gluten Free', activo: true });
    expect(nueva.id).not.toBe('');

    await repo.guardarOperario({ ...nueva, activo: false });
    expect((await repo.operarios()).find((o) => o.id === nueva.id)?.activo).toBe(false);
    await repo.guardarOperario({ ...nueva, activo: true });
    expect((await repo.operarios()).find((o) => o.id === nueva.id)?.activo).toBe(true);

    await expect(repo.guardarOperario({ ...nueva, nombre: 'Otro Nombre' })).rejects.toThrow(SOLO_ADMIN_OPERARIO);
    await expect(repo.guardarOperario({ ...nueva, area: 'Planta Alta' })).rejects.toThrow(SOLO_ADMIN_OPERARIO);
    await expect(repo.guardarOperario({ ...nueva, area: 'Planta Alta', activo: false })).rejects.toThrow(SOLO_ADMIN_OPERARIO);
    // nada de eso quedó guardado
    expect((await repo.operarios()).find((o) => o.id === nueva.id)).toEqual(nueva);
  });

  it('el administrador del demo sí cambia nombre y área', async () => {
    const repo = repoLocal();
    const [primero] = await repo.operarios();
    await repo.guardarOperario({ ...primero, nombre: 'Nombre Corregido', area: 'Gluten Free' });
    expect((await repo.operarios()).find((o) => o.id === primero.id)).toMatchObject({ nombre: 'Nombre Corregido', area: 'Gluten Free' });
  });
});
