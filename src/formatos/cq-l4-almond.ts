import type { DefinicionFormato } from '../motor/tipos';
import {
  ambiente, apariencia, cierreEmpaque, conRelleno, etapaSensorial, metales, num, pct, pesoEmpaqueCampos,
  pesoRellenoCampo, pesoUnidadCampo, POR_DEFINIR, presentacion, temp, vencimiento,
} from './comunes';

export const cqL4Almond: DefinicionFormato = {
  codigo: 'cq-l4-almond',
  version: 2,
  nombre: 'Control de calidad Línea 4 Almond Bites',
  nombreCorto: 'Almond Bites',
  rotulo: 'L4',
  familia: 'linea',
  icono: 'bites',
  usaProducto: true,
  usaLote: true,
  usaHora: false,
  frecuencia: 'por-produccion',
  unicidad: 'lote',
  etapas: [
    {
      id: 'masa', titulo: 'Masa',
      campos: [
        ...ambiente,
        temp('tMasa', 'Temperatura de la masa'),
        pct('hMasa', 'Humedad de la masa', { decimales: 2, opcional: true }),
        apariencia('aparienciaMasa'),
      ],
    },
    {
      id: 'formado', titulo: 'Formado',
      campos: [
        temp('tRelleno', 'Temperatura del relleno', { aplica: conRelleno, opcional: true }),
        num('tiempoEspera', 'Tiempo de espera del relleno', 'min', { decimales: 0, opcional: true }),
        temp('tRellenoFinal', 'Temperatura final del relleno', { aplica: conRelleno, opcional: true }),
        num('tiempoFormado', 'Tiempo de formado', 'min', { decimales: 0 }),
        pesoUnidadCampo(),
        pesoRellenoCampo(),
        apariencia('aparienciaFormado', 'Apariencia'),
        pct('pctNoConforme', 'Producto no conforme', { decimales: 0, opcional: true }),
      ],
    },
    {
      id: 'congelacion', titulo: 'Congelación',
      campos: [
        temp('tInternaCong', 'Temperatura interna', { pcc: 'PCC1', limite: POR_DEFINIR }),
        apariencia('aparienciaCong', 'Apariencia'),
      ],
    },
    {
      id: 'empaque', titulo: 'Empaque', diferida: true,
      descripcion: 'Hay referencias que se empacan al día siguiente: puedes guardar sin estos datos y completarlos después.',
      campos: [
        presentacion,
        vencimiento,
        ...pesoEmpaqueCampos,
        temp('tFinal', 'Temperatura interna final', { pcc: 'PCC2', limite: POR_DEFINIR }),
        ...cierreEmpaque,
        metales('PCC3'),
      ],
    },
    etapaSensorial,
  ],
};
