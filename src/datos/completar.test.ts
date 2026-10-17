import { describe, expect, it } from 'vitest';
import type { Desviacion } from '../motor/tipos';
import { aplicarCompletar, validarCompletar, type Completado } from './completar';
import { repoLocal } from './repo-local';
import type { Registro, Usuario } from './repositorio';

const capturista: Usuario = { id: 'u1', correo: 'a@x', nombre: 'Asistente', rol: 'capturista' };
const otro: Usuario = { ...capturista, id: 'u2', nombre: 'Otra persona' };
const admin: Usuario = { ...capturista, id: 'u9', nombre: 'Admin', rol: 'admin' };

const desvMasa: Desviacion = { campoId: 'tMasa', etiqueta: 'Temperatura de la masa', etapa: 'Masa', valor: '40 °C', esperado: '≤ 30 °C', severidad: 'calidad' };
const desvMetales: Desviacion = { campoId: 'metales', etiqueta: 'Detección de metales', etapa: 'Empaque', valor: 'Presencia', esperado: 'Distinto de Presencia', pcc: 'PCC3', severidad: 'pcc' };

const previo: Registro = {
  id: 'r1', formato: 'cq-l3-empanadas-maiz', versionFormato: 2, fecha: '2026-10-15', lote: '29001', productoId: 'p1',
  datos: { tMasa: 40, aparienciaMasa: 'Correcta', pesoDeclarado: 1, tInternaCong: null },
  desviaciones: [desvMasa], tieneDesviacionPcc: false, accionCorrectiva: 'Se ajustó el agua.',
  fotos: [], origen: 'app', realizadoPor: 'Asistente', creadoPor: 'u1', creadoEn: '2026-10-15T15:00:00Z',
};

const completo = (extra: Partial<Completado> = {}): Completado => ({
  datos: { ...previo.datos, tInternaCong: -19, metales: 'Ausencia', pesoEmpaque: 1.02, diferenciaPeso: 0.02 },
  desviaciones: previo.desviaciones,
  tieneDesviacionPcc: false,
  ...extra,
});

describe('validarCompletar', () => {
  it('deja llenar campos del día siguiente vacíos al creador, hasta 2 días después', () => {
    expect(() => validarCompletar(previo, completo(), capturista, '2026-10-15')).not.toThrow();
    expect(() => validarCompletar(previo, completo(), capturista, '2026-10-17')).not.toThrow();
  });

  it('el registro tiene que existir', () => {
    expect(() => validarCompletar(null, completo(), capturista, '2026-10-16')).toThrow('El registro no existe o fue eliminado.');
  });

  it('solo el creador o un administrador', () => {
    expect(() => validarCompletar(previo, completo(), otro, '2026-10-16')).toThrow(/Solo quien creó el registro o un administrador/);
    expect(() => validarCompletar(previo, completo(), admin, '2026-10-16')).not.toThrow();
  });

  it('pasados 2 días ya no se completa', () => {
    expect(() => validarCompletar(previo, completo(), capturista, '2026-10-18')).toThrow(/Pasaron más de 2 días desde el registro del 15\/10\/2026/);
    expect(() => validarCompletar(previo, completo(), admin, '2026-10-18')).toThrow(/Pasaron más de 2 días/);
  });

  it('no cambia datos que no son del día siguiente, ni los quita', () => {
    const cambia = completo({ datos: { ...completo().datos, tMasa: 25 } });
    expect(() => validarCompletar(previo, cambia, capturista, '2026-10-16')).toThrow('Por esta vía solo se completan los datos del día siguiente. No se puede cambiar: tMasa.');
    const { aparienciaMasa: _, ...sinApariencia } = completo().datos;
    expect(() => validarCompletar(previo, completo({ datos: sinApariencia }), capturista, '2026-10-16')).toThrow(/No se puede cambiar: aparienciaMasa/);
  });

  it('no cambia un dato del día siguiente que ya estaba medido', () => {
    const conMetales = { ...previo, datos: { ...previo.datos, metales: 'Ausencia' } };
    const cambia = completo({ datos: { ...completo().datos, metales: 'Presencia' } });
    expect(() => validarCompletar(conMetales, cambia, capturista, '2026-10-16')).toThrow(/ya estaban registrados y no se cambian por esta vía: metales/);
    // el calculado que ya tenía valor tampoco
    const cambiaDeclarado = completo({ datos: { ...completo().datos, pesoDeclarado: 0.9 } });
    expect(() => validarCompletar(previo, cambiaDeclarado, capturista, '2026-10-16')).toThrow(/pesoDeclarado/);
  });

  it('un valor guardado como null cuenta como vacío', () => {
    const soloCong = completo({ datos: { ...previo.datos, tInternaCong: -20 } });
    expect(() => validarCompletar(previo, soloCong, capturista, '2026-10-16')).not.toThrow();
  });

  it('exige al menos un dato nuevo', () => {
    expect(() => validarCompletar(previo, completo({ datos: { ...previo.datos } }), capturista, '2026-10-16')).toThrow('No hay datos nuevos para guardar.');
  });

  it('conserva las desviaciones ya registradas', () => {
    expect(() => validarCompletar(previo, completo({ desviaciones: [] }), capturista, '2026-10-16')).toThrow('Las desviaciones ya registradas no se pueden quitar por esta vía.');
    expect(() => validarCompletar(previo, completo({ desviaciones: [desvMasa, desvMetales] }), capturista, '2026-10-16')).not.toThrow();
  });

  it('la acción correctiva solo se amplía', () => {
    const reescribe = completo({ accionCorrectiva: 'Otra cosa.' });
    expect(() => validarCompletar(previo, reescribe, capturista, '2026-10-16')).toThrow(/solo ampliar/);
    const amplia = completo({ accionCorrectiva: 'Se ajustó el agua.\nSe retuvo el lote por metales.' });
    expect(() => validarCompletar(previo, amplia, capturista, '2026-10-16')).not.toThrow();
    const sinAccion = { ...previo, accionCorrectiva: undefined };
    expect(() => validarCompletar(sinAccion, reescribe, capturista, '2026-10-16')).not.toThrow();
  });
});

describe('aplicarCompletar', () => {
  it('actualiza datos y desviaciones, y no pierde el PCC', () => {
    const r = aplicarCompletar(previo, completo({ desviaciones: [desvMasa, desvMetales], tieneDesviacionPcc: false }), '2026-10-16T14:00:00Z');
    expect(r.datos.tInternaCong).toBe(-19);
    expect(r.desviaciones).toHaveLength(2);
    expect(r.tieneDesviacionPcc).toBe(true);
    expect(r.accionCorrectiva).toBe('Se ajustó el agua.');
    expect(r.actualizadoEn).toBe('2026-10-16T14:00:00Z');
    expect(aplicarCompletar({ ...previo, tieneDesviacionPcc: true }, completo(), 'x').tieneDesviacionPcc).toBe(true);
  });
});

describe('repoLocal.completarRegistro', () => {
  it('completa con el día cerrado, deja historial y aplica las mismas reglas', async () => {
    const repo = repoLocal();
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());
    const r = await repo.guardarRegistro({
      formato: 'cq-l3-empanadas-maiz', versionFormato: 2, fecha: hoy, lote: 'PRUEBA-1', productoId: 'prod-8',
      datos: { tMasa: 30 }, desviaciones: [], tieneDesviacionPcc: false, fotos: [], origen: 'app', realizadoPor: 'Asistente',
      claveUnica: 'cq-l3-empanadas-maiz|lote|PRUEBA-1',
    });
    await repo.cerrarDia({ fecha: hoy, cerradoPorNombre: 'Asistente', resumen: { registros: 1, desviaciones: 0, pendientes: [] } });

    const hecho = await repo.completarRegistro(r.id, { ...r.datos, tInternaCong: -19, aparienciaCong: 'Correcta' }, [], false);
    expect(hecho.datos.tInternaCong).toBe(-19);
    expect((await repo.registro(r.id))?.datos.aparienciaCong).toBe('Correcta');
    expect((await repo.historial(r.id))[0].despues?.datos?.tInternaCong).toBe(-19);

    await expect(repo.completarRegistro(r.id, { ...hecho.datos, tMasa: 20 }, [], false)).rejects.toThrow(/No se puede cambiar: tMasa/);
    await expect(repo.completarRegistro(r.id, { ...hecho.datos, tInternaCong: -25 }, [], false)).rejects.toThrow(/ya estaban registrados/);
    await expect(repo.completarRegistro('no-existe', {}, [], false)).rejects.toThrow('El registro no existe o fue eliminado.');
  }, 20_000); // genera el demo completo
});
