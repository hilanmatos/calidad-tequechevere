import { aNumero, vencimientoSugerido } from '../motor/evaluar';
import type {
  Campo,
  CampoCalculado,
  CampoConforme,
  CampoNumero,
  CampoOpcion,
  Contexto,
  Etapa,
  Limite,
  Producto,
} from '../motor/tipos';

/** Rangos de almacenamiento definidos en el sistema SQF. */
export const REFRIGERACION: Limite = { min: 1, max: 5 };
export const CONGELACION: Limite = { max: -18 };
/** PCC cuyo límite crítico aún no está documentado: se registra y se marca "por definir". */
export const POR_DEFINIR: Limite = { porConfirmar: true };

type Extra<T> = Partial<Omit<T, 'id' | 'etiqueta' | 'tipo'>>;

export const temp = (id: string, etiqueta: string, extra: Extra<CampoNumero> = {}): CampoNumero => ({
  id, etiqueta, tipo: 'numero', unidad: '°C', decimales: 1, ...extra,
});

export const pct = (id: string, etiqueta: string, extra: Extra<CampoNumero> = {}): CampoNumero => ({
  id, etiqueta, tipo: 'numero', unidad: '%', decimales: 1, ...extra,
});

export const num = (id: string, etiqueta: string, unidad: CampoNumero['unidad'], extra: Extra<CampoNumero> = {}): CampoNumero => ({
  id, etiqueta, tipo: 'numero', unidad, ...extra,
});

export const conforme = (id: string, etiqueta: string, extra: Extra<CampoConforme> = {}): CampoConforme => ({
  id, etiqueta, tipo: 'conforme', ...extra,
});

/** Apariencia con el vocabulario que usa Calidad en planta. */
export const apariencia = (id: string, etiqueta = 'Apariencia general', extra: Extra<CampoConforme> = {}): CampoConforme =>
  conforme(id, etiqueta, { opciones: ['Correcta', 'Incorrecta'], ...extra });

export const opcion = (id: string, etiqueta: string, opciones: string[], malas: string[] = [], extra: Extra<CampoOpcion> = {}): CampoOpcion => ({
  id, etiqueta, tipo: 'opcion', opciones, malas, ...extra,
});

export const metales = (pcc: string): CampoOpcion =>
  opcion('metales', 'Detección de metales', ['Ausencia', 'Presencia'], ['Presencia'], { pcc });

const llevaRelleno = (c: Contexto) => c.producto?.llevaRelleno ?? true;
const pesoUnidad = (p?: Producto): Limite | undefined =>
  p && (p.pesoUnidadMinG !== undefined || p.pesoUnidadMaxG !== undefined)
    ? { min: p.pesoUnidadMinG, max: p.pesoUnidadMaxG }
    : undefined;

export const pesoUnidadCampo = (id = 'pesoPromedio', etiqueta = 'Peso promedio por unidad'): CampoNumero =>
  num(id, etiqueta, 'g', {
    decimales: 1,
    referencia: (c) => c.producto?.pesoUnidadG,
    limite: (c) => pesoUnidad(c.producto),
  });

export const pesoRellenoCampo = (extra: Extra<CampoNumero> = {}): CampoNumero =>
  num('pesoRelleno', 'Peso promedio del relleno', 'g', {
    decimales: 1,
    referencia: (c) => c.producto?.pesoRellenoG,
    aplica: llevaRelleno,
    ...extra,
  });

export const ambiente: Campo[] = [
  temp('tAmbiente', 'Temperatura ambiente'),
  pct('hrAmbiente', 'Humedad relativa ambiente', { decimales: 0 }),
];

export const tempAgua = temp('tAgua', 'Temperatura del agua', {
  permiteAmbiente: true,
  ayuda: 'Si el agua se usa a temperatura ambiente, toca "Ambiente".',
});

export const conRelleno = llevaRelleno;

const pesoDeclarado: CampoCalculado = {
  id: 'pesoDeclarado', etiqueta: 'Peso declarado del empaque', tipo: 'calculado', unidad: 'kg', decimales: 3,
  formula: (c) => c.producto?.pesoDeclaradoKg,
};

/** Bajo peso en producto terminado es criterio de rechazo (SQF): la diferencia no puede ser negativa. */
const diferenciaPeso: CampoCalculado = {
  id: 'diferenciaPeso', etiqueta: 'Diferencia contra lo declarado', tipo: 'calculado', unidad: 'kg', decimales: 3,
  formula: (c) => {
    const medido = aNumero(c.valores.pesoEmpaque);
    const declarado = c.producto?.pesoDeclaradoKg;
    return medido === undefined || declarado === undefined ? undefined : Math.round((medido - declarado) * 1000) / 1000;
  },
  limite: { min: 0 },
};

export const vencimiento: Campo = {
  id: 'vencimiento', etiqueta: 'Fecha de vencimiento', tipo: 'fecha', sugerido: vencimientoSugerido,
};

export const presentacion: Campo = {
  id: 'presentacion', etiqueta: 'Presentación', tipo: 'texto', sugerido: (c) => c.producto?.presentacion,
};

export const pesoEmpaqueCampos: Campo[] = [
  num('pesoEmpaque', 'Peso medido del empaque', 'kg', { decimales: 3 }),
  pesoDeclarado,
  diferenciaPeso,
];

export const cierreEmpaque: Campo[] = [
  conforme('sellado', 'Calidad del sellado', { opciones: ['Correcto', 'Incorrecto'] }),
  conforme('impresionLote', 'Impresión de lote', { opciones: ['Correcta', 'Incorrecta'] }),
];

const ESCALA = ['Excelente', 'Buena', 'Regular', 'Mala'];

export const etapaSensorial: Etapa = {
  id: 'sensorial',
  titulo: 'Evaluación sensorial',
  descripcion: 'Producto terminado. Opcional, cuando se haga la prueba.',
  campos: [
    opcion('sabor', 'Sabor', ESCALA, ['Mala'], { opcional: true }),
    opcion('color', 'Color', ESCALA, ['Mala'], { opcional: true }),
    opcion('textura', 'Textura', ESCALA, ['Mala'], { opcional: true }),
    opcion('aparienciaSensorial', 'Apariencia', ESCALA, ['Mala'], { opcional: true }),
    { id: 'foto', etiqueta: 'Foto del producto', tipo: 'foto', opcional: true },
  ],
};

export const AREAS = ['Tequeños', 'Gluten Free', 'Tienda', 'Planta Alta'];
