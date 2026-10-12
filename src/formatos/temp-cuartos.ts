import { aNumero } from '../motor/evaluar';
import type { Campo, DefinicionFormato, Limite } from '../motor/tipos';
import { CONGELACION, REFRIGERACION, temp } from './comunes';

function cuarto(id: string, nombre: string, limite: Limite): Campo[] {
  return [
    temp(`${id}Display`, `${nombre}: termómetro del cuarto`, { limite }),
    temp(`${id}Pistola`, `${nombre}: pistola`, { ayuda: 'Lectura con termómetro infrarrojo de verificación.' }),
    {
      id: `${id}Diferencia`, etiqueta: `${nombre}: diferencia pistola contra cuarto`, tipo: 'calculado', unidad: '°C', decimales: 1,
      formula: (c) => {
        const a = aNumero(c.valores[`${id}Pistola`]);
        const b = aNumero(c.valores[`${id}Display`]);
        return a === undefined || b === undefined ? undefined : Math.round((a - b) * 10) / 10;
      },
    },
  ];
}

export const CUARTOS = [
  { id: 'frioPB', nombre: 'Cuarto frío PB', limite: REFRIGERACION },
  { id: 'congPB', nombre: 'Congelación PB', limite: CONGELACION },
  { id: 'frioPA', nombre: 'Cuarto frío PA', limite: REFRIGERACION },
  { id: 'congPA', nombre: 'Congelación PA', limite: CONGELACION },
];

export const tempCuartos: DefinicionFormato = {
  codigo: 'temp-cuartos',
  version: 1,
  nombre: 'Temperatura de cuartos de almacenamiento en frío',
  nombreCorto: 'Cuartos fríos',
  familia: 'almacenamiento',
  icono: 'termometro',
  usaProducto: false,
  usaLote: false,
  usaHora: true,
  frecuencia: 'diaria',
  unicidad: 'dia',
  etapas: [
    {
      id: 'pb', titulo: 'Planta baja',
      campos: [...cuarto('frioPB', 'Cuarto frío', REFRIGERACION), ...cuarto('congPB', 'Congelación', CONGELACION)],
    },
    {
      id: 'pa', titulo: 'Planta alta',
      campos: [...cuarto('frioPA', 'Cuarto frío', REFRIGERACION), ...cuarto('congPA', 'Congelación', CONGELACION)],
    },
  ],
};
