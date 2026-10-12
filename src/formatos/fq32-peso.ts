import type { Campo, DefinicionFormato } from '../motor/tipos';
import { num, pct, temp } from './comunes';

const muestras = (lineas: string[], extra: ('lote' | 'vencimiento' | 'observacion')[]): Campo => ({
  id: 'muestras',
  etiqueta: 'Muestras por mesa de trabajo',
  ayuda: 'Una fila por operador. Pesa 10 unidades y marca la apariencia.',
  tipo: 'muestras',
  nMuestras: 10,
  lineas,
  columnasExtra: extra,
});

const condicionesFritura: Campo[] = [
  temp('tiCongelacion', 'Temperatura inicial de congelación', { opcional: true }),
  temp('tfCongelacion', 'Temperatura final de congelación', { opcional: true }),
  temp('tFritura', 'Temperatura de fritura', { opcional: true }),
  temp('tAceite', 'Temperatura del aceite', { opcional: true }),
  temp('tiCongEmpaque', 'Temperatura inicial de congelación en empaque', { opcional: true }),
  temp('tfCongEmpaque', 'Temperatura final de congelación en empaque', { opcional: true }),
];

const condicionesMasa: Campo[] = [
  temp('tAmbiente', 'Temperatura ambiente', { opcional: true }),
  pct('hrAmbiente', 'Humedad relativa ambiente', { decimales: 0, opcional: true }),
  temp('tMasa', 'Temperatura de la masa', { opcional: true }),
  pct('hMasa', 'Humedad de la masa', { decimales: 2, opcional: true }),
  { id: 'loteQueso', etiqueta: 'Lote del queso', tipo: 'texto', opcional: true },
  pct('hQueso', 'Humedad del queso', { decimales: 2, opcional: true }),
  { id: 'loteProducto', etiqueta: 'Lote del producto', tipo: 'texto', opcional: true },
  num('bandejasCiclo', 'Bandejas por ciclo', 'uds', { decimales: 0, opcional: true }),
];

const base = {
  version: 1,
  familia: 'peso' as const,
  codigoSQF: 'F-Q-32',
  icono: 'balanza',
  usaProducto: false,
  usaLote: false,
  usaHora: true,
  frecuencia: 'diaria' as const,
};

export const fq32Tequenos: DefinicionFormato = {
  ...base,
  codigo: 'fq32-tequenos',
  nombre: 'Control de peso durante el proceso Tequeños',
  nombreCorto: 'Peso Tequeños',
  rotulo: 'TQ',
  etapas: [
    { id: 'muestras', titulo: 'Muestras', campos: [muestras(['cq-l1-tequenos'], ['observacion'])] },
    { id: 'masa', titulo: 'Condiciones de la masa', campos: condicionesMasa },
    { id: 'proceso', titulo: 'Congelación y fritura', campos: condicionesFritura },
  ],
};

export const fq32Empanadas: DefinicionFormato = {
  ...base,
  codigo: 'fq32-empanadas',
  nombre: 'Control de peso durante el proceso Empanaditas, pastelitos y discos',
  nombreCorto: 'Peso Empanaditas, pastelitos y discos',
  rotulo: 'EM',
  etapas: [
    { id: 'muestras', titulo: 'Muestras', campos: [muestras(['cq-l2-empanadas-trigo', 'cq-l3-empanadas-maiz'], ['lote', 'vencimiento'])] },
    {
      id: 'condiciones', titulo: 'Condiciones',
      campos: [
        pct('hMasa', 'Humedad de la masa', { decimales: 2, opcional: true }),
        temp('tMasa', 'Temperatura de la masa', { opcional: true }),
        temp('tRelleno', 'Temperatura del relleno', { opcional: true }),
        num('pesoEmpaque', 'Peso del empaque', 'kg', { decimales: 3, opcional: true }),
      ],
    },
  ],
};

export const fq32GlutenFree: DefinicionFormato = {
  ...base,
  codigo: 'fq32-gluten-free',
  nombre: 'Control de peso durante el proceso Gluten Free',
  nombreCorto: 'Peso Gluten Free',
  rotulo: 'GF',
  etapas: [
    { id: 'muestras', titulo: 'Muestras', campos: [muestras(['cq-l4-almond', 'cq-l5-yuca'], ['observacion'])] },
    { id: 'masa', titulo: 'Condiciones de la masa', campos: condicionesMasa },
    { id: 'proceso', titulo: 'Congelación y fritura', campos: condicionesFritura },
  ],
};
