import type { Registro } from '../datos/repositorio';
import { FORMATOS } from '../formatos';
import type { DefinicionFormato } from '../motor/tipos';

export interface PasoRutina {
  def: DefinicionFormato;
  area?: string;
  /** Registro que cumple este paso, si ya se hizo. */
  hecho?: Registro;
}

/** Formatos que se llenan una vez al día (o una vez por área): la rutina diaria. */
export const FORMATOS_RUTINA = FORMATOS.filter((f) => f.unicidad === 'dia' || f.unicidad === 'dia-area');

/** Qué se espera hoy y qué ya se hizo. Solo cuenta los registros de la fecha indicada. */
export function rutinaDelDia(registros: Registro[], fecha: string): PasoRutina[] {
  const delDia = registros.filter((r) => r.fecha === fecha);
  return FORMATOS_RUTINA.flatMap((def): PasoRutina[] => {
    if (def.unicidad === 'dia-area') {
      return (def.areasDiarias ?? def.areas ?? []).map((area) => ({
        def, area, hecho: delDia.find((r) => r.formato === def.codigo && r.area === area),
      }));
    }
    return [{ def, hecho: delDia.find((r) => r.formato === def.codigo) }];
  });
}

/** Agrupa los pasos por formato, para mostrarlos como estaciones. */
export function estacionesRutina(pasos: PasoRutina[]) {
  return FORMATOS_RUTINA.map((def) => {
    const propios = pasos.filter((p) => p.def.codigo === def.codigo);
    return { def, pasos: propios, hechos: propios.filter((p) => p.hecho).length, total: propios.length };
  });
}
