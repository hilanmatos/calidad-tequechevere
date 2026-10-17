import type { DefinicionFormato, Etapa } from '../motor/tipos';
import {
  ambiente, apariencia, cierreEmpaque, conRelleno, metales, num, pct, pesoEmpaqueCampos,
  pesoRellenoCampo, pesoUnidadCampo, POR_DEFINIR, presentacion, temp, tempAgua, vencimiento,
} from './comunes';

function etapasEmpanadas(maiz: boolean): Etapa[] {
  return [
    { id: 'generales', titulo: 'Ambiente', campos: ambiente },
    {
      id: 'masa', titulo: 'Masa',
      campos: [
        tempAgua,
        temp('tMasa', 'Temperatura de la masa'),
        pct('hMasa', 'Humedad de la masa', { decimales: 2 }),
        apariencia('aparienciaMasa'),
      ],
    },
    {
      id: 'producto', titulo: 'Producto',
      campos: [
        ...(maiz ? [num('pesoMasa', 'Peso de la masa', 'g', { decimales: 1 })] : []),
        pesoRellenoCampo(),
        pesoUnidadCampo('pesoProducto', 'Peso promedio del producto final'),
        apariencia('aparienciaProducto'),
      ],
    },
    {
      id: 'congelacion', titulo: 'Congelación', diferida: true,
      descripcion: 'Se mide al día siguiente: puedes guardar sin estos datos y completarlos desde el registro.',
      campos: [
        temp('tRelleno', 'Temperatura del relleno', { aplica: conRelleno }),
        temp('tInternaCong', 'Temperatura interna', { pcc: 'PCC1', limite: POR_DEFINIR }),
        apariencia('aparienciaCong', 'Apariencia'),
      ],
    },
    {
      id: 'empaque', titulo: 'Empaque', diferida: true,
      descripcion: 'Se empaca al día siguiente: puedes guardar sin estos datos y completarlos desde el registro.',
      campos: [
        presentacion,
        vencimiento,
        temp('tFinalEmpaque', 'Temperatura final de empaque', { ayuda: 'La que alcanza al día siguiente en el cuarto de congelación.' }),
        ...pesoEmpaqueCampos,
        ...(maiz ? [apariencia('aparienciaEmpaque', 'Apariencia del empaque', { pcc: 'PCC2' })] : []),
        metales(maiz ? 'PCC3' : 'PCC2'),
        ...cierreEmpaque,
      ],
    },
  ];
}

export const cqL2EmpanadasTrigo: DefinicionFormato = {
  codigo: 'cq-l2-empanadas-trigo',
  version: 2,
  nombre: 'Control de calidad Línea 2 Empanadas de trigo, discos y pastelitos',
  nombreCorto: 'Empanadas de trigo, discos y pastelitos',
  rotulo: 'L2',
  familia: 'linea',
  icono: 'empanada',
  usaProducto: true,
  usaLote: true,
  usaHora: false,
  frecuencia: 'por-produccion',
  unicidad: 'lote',
  etapas: etapasEmpanadas(false),
};

export const cqL3EmpanadasMaiz: DefinicionFormato = {
  codigo: 'cq-l3-empanadas-maiz',
  version: 2,
  nombre: 'Control de calidad Línea 3 Empanadas de maíz',
  nombreCorto: 'Empanadas de maíz',
  rotulo: 'L3',
  familia: 'linea',
  icono: 'empanada',
  usaProducto: true,
  usaLote: true,
  usaHora: false,
  frecuencia: 'por-produccion',
  unicidad: 'lote',
  etapas: etapasEmpanadas(true),
};
