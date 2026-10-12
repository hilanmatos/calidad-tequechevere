import type { DefinicionFormato } from '../motor/tipos';
import {
  ambiente, apariencia, cierreEmpaque, conRelleno, etapaSensorial, metales, num, pct, pesoEmpaqueCampos,
  pesoRellenoCampo, pesoUnidadCampo, POR_DEFINIR, presentacion, temp, vencimiento,
} from './comunes';

export const cqL5Yuca: DefinicionFormato = {
  codigo: 'cq-l5-yuca',
  version: 1,
  nombre: 'Control de calidad Línea 5 Yuca Bites y carimañola',
  nombreCorto: 'Yuca Bites y carimañola',
  rotulo: 'L5',
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
        pct('hYuca', 'Humedad de la yuca fresca', { decimales: 2 }),
        num('tiempoCoccion', 'Tiempo de cocción de la yuca', 'min', { decimales: 0 }),
        temp('tCoccion', 'Temperatura de cocción de la yuca'),
        num('cantidadAgua', 'Cantidad de agua', 'L', { decimales: 1 }),
        temp('tMasa', 'Temperatura de la masa', { opcional: true }),
        ...ambiente.map((c) => ({ ...c, opcional: true })),
        pct('hMasa', 'Humedad de la masa', { decimales: 2 }),
        apariencia('aparienciaMasa'),
      ],
    },
    {
      id: 'formado', titulo: 'Formado',
      campos: [
        temp('tRelleno', 'Temperatura del relleno', { aplica: conRelleno, opcional: true }),
        num('tiempoEspera', 'Tiempo de espera del relleno', 'min', { decimales: 0, opcional: true }),
        temp('tRellenoFinal', 'Temperatura final del relleno', { aplica: conRelleno, opcional: true }),
        num('tiempoFormado', 'Tiempo de formado', 'min', { decimales: 0, opcional: true }),
        pesoUnidadCampo(),
        pesoRellenoCampo({ opcional: true }),
        apariencia('aparienciaFormado', 'Apariencia'),
        pct('pctNoConformeFormado', 'Producto no conforme', { decimales: 0, opcional: true }),
      ],
    },
    {
      id: 'precongelacion', titulo: 'Congelación previa',
      campos: [
        num('tiempoPreCong', 'Tiempo en congelación', 'min', { decimales: 0, opcional: true }),
        temp('tInternaPreCong', 'Temperatura interna', { opcional: true }),
      ],
    },
    {
      id: 'fritura', titulo: 'Fritura u horneado',
      campos: [
        temp('tAceite', 'Temperatura del aceite u horno'),
        num('tiempoFritura', 'Tiempo de fritura', 's', { decimales: 0 }),
        temp('tInternaFritura', 'Temperatura interna', { pcc: 'PCC1', limite: POR_DEFINIR }),
        pct('pctNoConformeFritura', 'Producto no conforme', { decimales: 0, opcional: true }),
      ],
    },
    {
      id: 'congelacion', titulo: 'Congelación',
      campos: [
        temp('tInternaCong', 'Temperatura interna'),
        apariencia('aparienciaCong', 'Apariencia'),
      ],
    },
    {
      id: 'empaque', titulo: 'Empaque',
      campos: [
        presentacion,
        vencimiento,
        temp('tFinal', 'Temperatura interna final', { pcc: 'PCC2', limite: POR_DEFINIR }),
        ...pesoEmpaqueCampos,
        metales('PCC3'),
        ...cierreEmpaque,
      ],
    },
    etapaSensorial,
  ],
};
