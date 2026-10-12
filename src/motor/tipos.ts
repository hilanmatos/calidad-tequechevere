export type Unidad = '°C' | '%' | 'g' | 'kg' | 'min' | 's' | 'mL/L' | 'pH' | 'L' | 'uds' | '';

export interface Limite {
  min?: number;
  max?: number;
  /** Límite aún no validado por Calidad: se muestra en índigo y no bloquea.
   *  Sin min ni max significa "límite por definir". */
  porConfirmar?: boolean;
}

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  /** Código de formato de línea al que pertenece (ej. 'cq-l1-tequenos'). */
  linea: string;
  presentacion: string;
  pesoUnidadG?: number;
  pesoUnidadMinG?: number;
  pesoUnidadMaxG?: number;
  pesoRellenoG?: number;
  pesoDeclaradoKg?: number;
  vidaUtilMeses?: number;
  llevaRelleno: boolean;
  esPrecocido: boolean;
  activo: boolean;
}

export interface Operario {
  id: string;
  nombre: string;
  area: string;
  activo: boolean;
}

export type Valores = Record<string, unknown>;

export interface Contexto {
  valores: Valores;
  producto?: Producto;
  productos?: Producto[];
  operarios?: Operario[];
  /** Fecha del registro, 'YYYY-MM-DD'. */
  fecha: string;
  area?: string;
}

interface CampoBase {
  id: string;
  etiqueta: string;
  ayuda?: string;
  /** Etiqueta del punto crítico de control, ej. 'PCC1'. */
  pcc?: string;
  opcional?: boolean;
  aplica?: (ctx: Contexto) => boolean;
}

export type LimiteDinamico = Limite | ((ctx: Contexto) => Limite | undefined);

export interface CampoNumero extends CampoBase {
  tipo: 'numero';
  unidad: Unidad;
  decimales?: number;
  limite?: LimiteDinamico;
  /** Permite marcar el valor como "Ambiente" en lugar de un número (ej. temperatura del agua). */
  permiteAmbiente?: boolean;
  /** Valor de referencia que se muestra junto al campo (ej. peso teórico del producto). */
  referencia?: (ctx: Contexto) => number | undefined;
}

export interface CampoConforme extends CampoBase {
  tipo: 'conforme';
  /** [bueno, malo]. Por defecto ['Conforme', 'No conforme']. */
  opciones?: [string, string];
}

export interface CampoOpcion extends CampoBase {
  tipo: 'opcion';
  opciones: string[];
  /** Opciones que cuentan como desviación. */
  malas?: string[];
}

export interface CampoTexto extends CampoBase {
  tipo: 'texto';
  multilinea?: boolean;
  sugerido?: (ctx: Contexto) => string | undefined;
}

export interface CampoFecha extends CampoBase {
  tipo: 'fecha';
  sugerido?: (ctx: Contexto) => string | undefined;
}

export interface CampoHora extends CampoBase {
  tipo: 'hora';
}

/** Valor guardado en segundos. */
export interface CampoDuracion extends CampoBase {
  tipo: 'duracion';
  limite?: Limite;
}

export interface CampoFoto extends CampoBase {
  tipo: 'foto';
}

export interface CampoCalculado extends CampoBase {
  tipo: 'calculado';
  unidad: Unidad;
  decimales?: number;
  formula: (ctx: Contexto) => number | undefined;
  limite?: LimiteDinamico;
}

export interface EstadoCelda {
  id: string;
  etiqueta: string;
  corta: string;
  tono: 'ok' | 'fuera' | 'neutro';
}

export interface ColumnaChecklist {
  id: string;
  etiqueta: string;
  aplica?: (ctx: Contexto) => boolean;
}

/** Filas = operarios activos del área. Valor: { [operarioId]: { [columnaId]: estadoId, _obs?: string } } */
export interface CampoChecklist extends CampoBase {
  tipo: 'checklist';
  columnas: ColumnaChecklist[];
  estados: EstadoCelda[];
  porDefecto: string;
  /** Cómo se nombra la desviación de una columna (por defecto, la etiqueta de la columna). */
  etiquetaDesviacion?: (columna: string) => string;
}

export interface FilaMuestras {
  operarioId?: string;
  productoId?: string;
  muestras: (number | null)[];
  apariencia?: 'C' | 'NC';
  lote?: string;
  vencimiento?: string;
  observacion?: string;
}

/** Valor: FilaMuestras[] */
export interface CampoMuestras extends CampoBase {
  tipo: 'muestras';
  nMuestras: number;
  /** Códigos de formato de línea cuyos productos se pueden elegir. */
  lineas: string[];
  columnasExtra?: ('lote' | 'vencimiento' | 'observacion')[];
}

export type Campo =
  | CampoNumero
  | CampoConforme
  | CampoOpcion
  | CampoTexto
  | CampoFecha
  | CampoHora
  | CampoDuracion
  | CampoFoto
  | CampoCalculado
  | CampoChecklist
  | CampoMuestras;

export interface Etapa {
  id: string;
  titulo: string;
  descripcion?: string;
  campos: Campo[];
  aplica?: (ctx: Contexto) => boolean;
}

export type Familia = 'linea' | 'peso' | 'personal' | 'almacenamiento';

export interface DefinicionFormato {
  codigo: string;
  version: number;
  nombre: string;
  nombreCorto: string;
  familia: Familia;
  codigoSQF?: string;
  /** Rótulo corto de la línea para la tarjeta (ej. 'L1'). */
  rotulo?: string;
  icono: string;
  usaProducto: boolean;
  usaLote: boolean;
  usaHora: boolean;
  /** Áreas disponibles si el formato se llena por área. */
  areas?: string[];
  frecuencia: 'diaria' | 'por-produccion';
  etapas: Etapa[];
}

export type Estado = 'vacio' | 'ok' | 'fuera' | 'alerta';

export type Severidad = 'pcc' | 'calidad' | 'por-confirmar';

export interface Desviacion {
  campoId: string;
  etiqueta: string;
  etapa: string;
  valor: string;
  esperado: string;
  pcc?: string;
  severidad: Severidad;
}

export interface Faltante {
  campoId: string;
  etiqueta: string;
  etapa: string;
}
