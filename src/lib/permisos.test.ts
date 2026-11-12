import { describe, expect, it } from 'vitest';
import type { Usuario } from '../datos/repositorio';
import { etiquetaAdmin, pestanasAdmin, SOLO_ADMIN_OPERARIO, validarOperario } from './permisos';

const capturista: Usuario = { id: 'u1', correo: 'a@x', nombre: 'Asistente', rol: 'capturista' };
const admin: Usuario = { ...capturista, id: 'u9', rol: 'admin' };
const maria = { id: 'op-1', nombre: 'María González', area: 'Planta Alta', activo: true };

describe('pestañas de Administración', () => {
  it('el administrador ve todo; el capturista solo los operarios', () => {
    expect(pestanasAdmin('admin')).toEqual(['productos', 'operarios', 'usuarios']);
    expect(pestanasAdmin('capturista')).toEqual(['operarios']);
  });

  it('en la navegación, el capturista ve el ítem como "Operarios"', () => {
    expect(etiquetaAdmin('admin')).toBe('Admin');
    expect(etiquetaAdmin('capturista')).toBe('Operarios');
  });
});

describe('validarOperario', () => {
  it('el capturista agrega operarios y los desactiva o reactiva', () => {
    expect(() => validarOperario(undefined, { ...maria, id: '' }, capturista)).not.toThrow();
    expect(() => validarOperario(maria, { ...maria, activo: false }, capturista)).not.toThrow();
    expect(() => validarOperario({ ...maria, activo: false }, maria, capturista)).not.toThrow();
  });

  it('solo el administrador cambia el nombre o el área', () => {
    expect(() => validarOperario(maria, { ...maria, nombre: 'María G.' }, capturista)).toThrow(SOLO_ADMIN_OPERARIO);
    expect(() => validarOperario(maria, { ...maria, area: 'Gluten Free' }, capturista)).toThrow(SOLO_ADMIN_OPERARIO);
    expect(() => validarOperario(maria, { ...maria, nombre: 'María G.', area: 'Gluten Free' }, admin)).not.toThrow();
    expect(SOLO_ADMIN_OPERARIO).toBe('Solo un administrador puede cambiar el nombre o el área de un operario.');
  });
});
