import type { DefinicionFormato } from '../motor/tipos';
import { AREAS } from './comunes';

export const higieneUniforme: DefinicionFormato = {
  codigo: 'higiene-uniforme',
  version: 1,
  nombre: 'Revisión de higiene y uniforme del personal',
  nombreCorto: 'Higiene y uniforme',
  familia: 'personal',
  icono: 'uniforme',
  usaProducto: false,
  usaLote: false,
  usaHora: false,
  areas: AREAS,
  frecuencia: 'diaria',
  unicidad: 'dia-area',
  areasDiarias: AREAS,
  etapas: [
    {
      id: 'revision', titulo: 'Revisión del personal',
      descripcion: 'Todos arrancan en "cumple". Toca solo lo que falla; otro toque lo devuelve a "cumple".',
      campos: [
        {
          id: 'revision',
          etiqueta: 'Personal del área',
          tipo: 'checklist',
          porDefecto: 'cumple',
          ciclo: ['cumple', 'falla'],
          permiteAusencia: true,
          estados: [
            { id: 'cumple', etiqueta: 'Cumple', corta: '✓', tono: 'ok' },
            { id: 'falla', etiqueta: 'Falla', corta: '✗', tono: 'fuera' },
            { id: 'na', etiqueta: 'No aplica', corta: 'N/A', tono: 'neutro' },
          ],
          columnas: [
            { id: 'salud', etiqueta: 'Estado de salud' },
            { id: 'manos', etiqueta: 'Manos limpias y uñas cortas' },
            { id: 'cabello', etiqueta: 'Cabello cubierto' },
            { id: 'barba', etiqueta: 'Barba con cubre barba' },
            { id: 'mascarilla', etiqueta: 'Uso adecuado de mascarilla' },
            { id: 'uniforme', etiqueta: 'Uniforme limpio y en buen estado' },
            { id: 'zapatos', etiqueta: 'Zapatos limpios y cerrados' },
            { id: 'delantal', etiqueta: 'Delantal y cubre mangas' },
            { id: 'maquillaje', etiqueta: 'Sin maquillaje ni pestañas postizas' },
            { id: 'accesorios', etiqueta: 'Sin accesorios' },
          ],
        },
      ],
    },
  ],
};

const esSabado = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay() === 6;

export const lavadoManos: DefinicionFormato = {
  codigo: 'lavado-manos',
  version: 1,
  nombre: 'Control de lavado de manos',
  nombreCorto: 'Lavado de manos',
  familia: 'personal',
  icono: 'manos',
  usaProducto: false,
  usaLote: false,
  usaHora: false,
  areas: AREAS,
  frecuencia: 'diaria',
  unicidad: 'dia-area',
  areasDiarias: AREAS,
  etapas: [
    {
      id: 'lavado', titulo: 'Lavado por horario',
      descripcion: 'Se completa durante el día: un toque marca que se lavó, otro que no se lavó. Puedes volver a abrirlo hasta que se cierre el día.',
      campos: [
        {
          id: 'lavado',
          etiqueta: 'Personal del área',
          tipo: 'checklist',
          porDefecto: 'pendiente',
          ciclo: ['lavo', 'no'],
          permiteAusencia: true,
          etiquetaDesviacion: (horario) => `Lavado de manos de las ${horario}`,
          estados: [
            { id: 'pendiente', etiqueta: 'Pendiente', corta: '·', tono: 'neutro' },
            { id: 'lavo', etiqueta: 'Se lavó', corta: '✓', tono: 'ok' },
            { id: 'no', etiqueta: 'No se lavó', corta: '✗', tono: 'fuera' },
          ],
          columnas: [
            { id: 'h0630', etiqueta: '6:30 a. m.' },
            { id: 'h0930', etiqueta: '9:30 a. m.' },
            { id: 'h1230', etiqueta: '12:30 p. m.' },
            { id: 'h1430', etiqueta: '2:30 p. m.', aplica: (c) => !esSabado(c.fecha) },
          ],
        },
      ],
    },
  ],
};
