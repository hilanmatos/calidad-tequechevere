import type { DefinicionFormato } from '../motor/tipos';
import {
  ambiente, apariencia, bandejasCongelacion, cierreEmpaque, conforme, etapaSensorial, metales, num, opcion, pct, pesoEmpaqueCampos,
  pesoRellenoCampo, pesoUnidadCampo, POR_DEFINIR, presentacion, temp, tempAgua, vencimiento,
} from './comunes';

export const cqL1Tequenos: DefinicionFormato = {
  codigo: 'cq-l1-tequenos',
  version: 2,
  nombre: 'Control de calidad Línea 1 Tequeños',
  nombreCorto: 'Tequeños',
  rotulo: 'L1',
  familia: 'linea',
  icono: 'tequeno',
  usaProducto: true,
  usaLote: true,
  usaHora: false,
  frecuencia: 'por-produccion',
  unicidad: 'lote',
  etapas: [
    { id: 'generales', titulo: 'Ambiente', campos: ambiente },
    {
      id: 'masa', titulo: 'Masa',
      campos: [
        tempAgua,
        temp('tMasa', 'Temperatura de la masa'),
        pct('hMasa', 'Humedad de la masa', { decimales: 2 }),
        { id: 'proveedorQueso', etiqueta: 'Proveedor del queso', tipo: 'texto', opcional: true },
        { id: 'loteQueso', etiqueta: 'Lote del queso', tipo: 'texto' },
        conforme('quesoConforme', 'Queso conforme', { opciones: ['Conforme', 'No conforme'] }),
        { id: 'comentarioQueso', etiqueta: 'Comentario sobre el queso', tipo: 'texto', opcional: true },
        pct('hQueso', 'Humedad del queso', { decimales: 2, opcional: true }),
        temp('tQueso', 'Temperatura del queso', { opcional: true, ayuda: 'Anótala cuando se mida; ayuda a explicar variaciones de la masa.' }),
        apariencia('aparienciaMasa'),
      ],
    },
    {
      id: 'enrollado', titulo: 'Enrollado',
      campos: [
        num('vueltas', 'Vueltas de masa', 'uds', { decimales: 0 }),
        apariencia('aparienciaEnrollado'),
        pesoUnidadCampo(),
        pesoRellenoCampo(),
      ],
    },
    {
      id: 'turbo', titulo: 'Enfriamiento en turbo',
      descripcion: 'El turbo enfría; la congelación ocurre en el cuarto.',
      campos: [temp('tInternaTurbo', 'Temperatura interna', { opcional: true })],
    },
    {
      id: 'freido', titulo: 'Freído', descripcion: 'Solo productos precocidos.',
      aplica: (c) => !!c.producto?.esPrecocido,
      campos: [
        temp('tAceite', 'Temperatura del aceite'),
        num('tiempoFreido', 'Tiempo de freído', 's', { decimales: 0 }),
        temp('tInternaFreido', 'Temperatura interna', { pcc: 'PCC1', limite: POR_DEFINIR }),
        opcion('aspectoFreido', 'Aspecto general', ['Excelente', 'Buena', 'Regular', 'Mala'], ['Mala']),
        num('defectos', 'Tequeños con defecto', 'uds', { decimales: 0 }),
      ],
    },
    {
      id: 'congelacion', titulo: 'Congelación',
      // Las boquitas no pasan por congelación; los registros viejos que ya la tienen la siguen mostrando.
      aplica: (c) => c.producto?.llevaCongelacion !== false || c.valores.tInicialCong != null || c.valores.aparienciaCong != null,
      campos: [
        // tInicialCong conserva su id para el histórico: antes era "Temperatura inicial del producto".
        ...bandejasCongelacion('tInicialCong', { pcc: 'PCC2', limite: POR_DEFINIR }),
        num('bandejasCiclo', 'Número de bandejas por ciclo', 'uds', { decimales: 0 }),
        apariencia('aparienciaCong', 'Apariencia'),
      ],
    },
    {
      id: 'empaque', titulo: 'Empaque', diferida: true,
      descripcion: 'Hay referencias que se empacan al día siguiente: puedes guardar sin estos datos y completarlos después.',
      campos: [
        presentacion,
        vencimiento,
        temp('tFinal', 'Temperatura final del producto', { pcc: 'PCC3', limite: POR_DEFINIR }),
        ...pesoEmpaqueCampos,
        metales('PCC4'),
        temp('tSellado', 'Temperatura de sellado', { opcional: true }),
        ...cierreEmpaque,
      ],
    },
    etapaSensorial,
  ],
};
