import { aNumero } from '../motor/evaluar';
import type { DefinicionFormato } from '../motor/tipos';
import {
  ambiente, apariencia, conforme, metales, num, opcion, POR_DEFINIR, REFRIGERACION, temp, vencimiento,
} from './comunes';

const declaradoG = (kg?: number) => (kg ?? 0.6) * 1000;

export const cqSalsaTartara: DefinicionFormato = {
  codigo: 'cq-salsa-tartara',
  version: 1,
  nombre: 'Control de calidad Salsa tártara',
  nombreCorto: 'Salsa tártara',
  rotulo: 'ST',
  familia: 'linea',
  icono: 'salsa',
  usaProducto: true,
  usaLote: true,
  usaHora: false,
  frecuencia: 'por-produccion',
  etapas: [
    {
      id: 'generales', titulo: 'Ambiente y vegetales',
      campos: [...ambiente, apariencia('aparienciaVegetales', 'Apariencia de los vegetales')],
    },
    {
      id: 'higienizacion', titulo: 'Higienización',
      campos: [
        conforme('lavado', 'Lavado'),
        num('sanitec', 'Concentración de Sanitec', 'mL/L', { decimales: 1, pcc: 'PCC1', limite: POR_DEFINIR }),
        num('tiempoHigienizacion', 'Tiempo de higienización', 'min', { decimales: 0, pcc: 'PCC1', limite: POR_DEFINIR }),
        conforme('enjuague', 'Enjuague'),
        conforme('escurrido', 'Escurrido'),
        conforme('corte', 'Despepitado y corte de 2 a 3 cm'),
        conforme('picado', 'Picado'),
      ],
    },
    {
      id: 'formulacion', titulo: 'Formulación y mezclado',
      descripcion: 'Pesos conforme a la fórmula.',
      campos: [
        conforme('pesoVegetal', 'Peso del vegetal limpio'),
        conforme('pesoMayonesa', 'Peso de la mayonesa'),
        conforme('pesoVinagre', 'Peso del vinagre'),
        conforme('pesoSal', 'Peso de la sal'),
        num('tiempoMezclado', 'Tiempo de mezclado', 'min', { decimales: 0 }),
        opcion('aparienciaMezcla', 'Apariencia de la mezcla', ['Homogénea', 'No homogénea'], ['No homogénea']),
      ],
    },
    {
      id: 'producto', titulo: 'Control del producto',
      campos: [
        num('ph', 'pH', 'pH', { decimales: 2, pcc: 'PCC2', limite: POR_DEFINIR }),
        opcion('colorSalsa', 'Color', ['Característico', 'Atípico'], ['Atípico']),
        opcion('olor', 'Olor', ['Característico', 'Atípico'], ['Atípico']),
        opcion('consistencia', 'Consistencia', ['Cremosa y homogénea', 'Líquida', 'Grumosa'], ['Líquida', 'Grumosa']),
      ],
    },
    {
      id: 'envasado', titulo: 'Envasado',
      campos: [
        temp('tEnvasado', 'Temperatura del producto al envasar', { pcc: 'PCC3', limite: POR_DEFINIR }),
        num('tiempoExpuesto', 'Tiempo expuesto', 'min', { decimales: 0, pcc: 'PCC3', limite: POR_DEFINIR }),
        num('pesoNeto', 'Peso neto', 'g', { decimales: 0, referencia: (c) => declaradoG(c.producto?.pesoDeclaradoKg) }),
        {
          id: 'diferenciaNeto', etiqueta: 'Diferencia contra lo declarado', tipo: 'calculado', unidad: 'g', decimales: 0,
          formula: (c) => {
            const v = aNumero(c.valores.pesoNeto);
            return v === undefined ? undefined : v - declaradoG(c.producto?.pesoDeclaradoKg);
          },
          limite: { min: 0 },
        },
        conforme('etiquetado', 'Etiquetado con alérgeno huevo'),
        vencimiento,
        conforme('cierre', 'Tapado y cierre', { opciones: ['Correcto', 'Incorrecto'] }),
      ],
    },
    {
      id: 'inocuidad', titulo: 'Inocuidad final',
      campos: [metales('PCC4'), conforme('inspeccionVisual', 'Inspección visual final')],
    },
    {
      id: 'almacenamiento', titulo: 'Almacenamiento',
      campos: [temp('tAlmacenamiento', 'Temperatura de almacenamiento', { pcc: 'PCC5', limite: REFRIGERACION })],
    },
  ],
};
