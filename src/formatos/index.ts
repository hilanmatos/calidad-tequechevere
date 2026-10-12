import type { DefinicionFormato, Familia } from '../motor/tipos';
import { cqL2EmpanadasTrigo, cqL3EmpanadasMaiz } from './cq-empanadas';
import { cqL1Tequenos } from './cq-l1-tequenos';
import { cqL4Almond } from './cq-l4-almond';
import { cqL5Yuca } from './cq-l5-yuca';
import { cqSalsaTartara } from './cq-salsa-tartara';
import { fq32Empanadas, fq32GlutenFree, fq32Tequenos } from './fq32-peso';
import { higieneUniforme, lavadoManos } from './personal';
import { tempCuartos } from './temp-cuartos';

export const FORMATOS: DefinicionFormato[] = [
  cqL1Tequenos,
  cqL2EmpanadasTrigo,
  cqL3EmpanadasMaiz,
  cqL4Almond,
  cqL5Yuca,
  cqSalsaTartara,
  fq32Tequenos,
  fq32Empanadas,
  fq32GlutenFree,
  higieneUniforme,
  lavadoManos,
  tempCuartos,
];

export const FAMILIAS: { id: Familia; titulo: string; descripcion: string }[] = [
  { id: 'linea', titulo: 'Control de calidad por línea', descripcion: 'Uno por cada producción' },
  { id: 'peso', titulo: 'Control de peso F-Q-32', descripcion: 'Muestras por mesa de trabajo' },
  { id: 'personal', titulo: 'Personal', descripcion: 'Una vez al día por área' },
  { id: 'almacenamiento', titulo: 'Almacenamiento', descripcion: 'Lecturas de los cuartos' },
];

export function formato(codigo: string): DefinicionFormato | undefined {
  return FORMATOS.find((f) => f.codigo === codigo);
}

export function formatosDe(familia: Familia): DefinicionFormato[] {
  return FORMATOS.filter((f) => f.familia === familia);
}
