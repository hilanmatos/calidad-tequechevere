import type { Desviacion, Operario, Producto, Valores } from '../motor/tipos';

export type Rol = 'admin' | 'capturista';

export interface Usuario {
  id: string;
  correo: string;
  nombre: string;
  rol: Rol;
}

export interface Registro {
  id: string;
  formato: string;
  versionFormato: number;
  fecha: string;
  hora?: string;
  area?: string;
  productoId?: string;
  lote?: string;
  datos: Valores;
  desviaciones: Desviacion[];
  tieneDesviacionPcc: boolean;
  accionCorrectiva?: string;
  observaciones?: string;
  fotos: string[];
  origen: 'app' | 'importado';
  realizadoPor: string;
  /** Impide duplicados: un registro por día, por día y área, o por lote. */
  claveUnica?: string;
  creadoPor?: string;
  creadoEn: string;
  actualizadoEn?: string;
}

export type NuevoRegistro = Omit<Registro, 'id' | 'creadoEn' | 'creadoPor' | 'actualizadoEn'> & { id?: string };

export interface CambioRegistro {
  id: number;
  accion: 'UPDATE' | 'DELETE';
  usuario?: string;
  en: string;
  antes: Partial<Registro>;
  despues?: Partial<Registro>;
}

export interface FiltroRegistros {
  desde: string;
  hasta: string;
  formato?: string;
}

export interface CierreDia {
  fecha: string;
  cerradoPor?: string;
  cerradoPorNombre: string;
  cerradoEn: string;
  resumen: { registros: number; desviaciones: number; pendientes: string[] };
}

/** Error al guardar un registro que ya existe (clave única repetida). */
export class RegistroDuplicado extends Error {
  constructor() {
    super('Ya existe un registro igual: este formato se llena una sola vez para ese día, área o lote.');
    this.name = 'RegistroDuplicado';
  }
}

export class DiaCerrado extends Error {
  constructor() {
    super('El día está cerrado. Pide al administrador que lo reabra para hacer cambios.');
    this.name = 'DiaCerrado';
  }
}

export interface Perfil {
  id: string;
  correo: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface Repositorio {
  modo: 'supabase' | 'demo';
  sesion(): Promise<Usuario | null>;
  ingresar(correo: string, clave: string): Promise<Usuario>;
  salir(): Promise<void>;
  alCambiarSesion(cb: (u: Usuario | null) => void): () => void;

  productos(): Promise<Producto[]>;
  guardarProducto(p: Producto): Promise<void>;
  operarios(): Promise<Operario[]>;
  guardarOperario(o: Operario): Promise<void>;
  perfiles(): Promise<Perfil[]>;
  guardarPerfil(p: Perfil): Promise<void>;

  registros(f: FiltroRegistros): Promise<Registro[]>;
  registro(id: string): Promise<Registro | null>;
  porClave(clave: string): Promise<Registro | null>;
  guardarRegistro(r: NuevoRegistro): Promise<Registro>;
  /**
   * Llena los campos del día siguiente que quedaron vacíos, aunque el día esté cerrado: solo el creador o un
   * administrador, hasta 2 días después de la fecha del registro. No cambia datos ya medidos.
   */
  completarRegistro(id: string, datos: Valores, desviaciones: Desviacion[], tienePcc: boolean, accionCorrectiva?: string): Promise<Registro>;
  eliminarRegistro(id: string): Promise<void>;
  historial(id: string): Promise<CambioRegistro[]>;

  cierres(desde: string, hasta: string): Promise<CierreDia[]>;
  cerrarDia(c: Omit<CierreDia, 'cerradoEn' | 'cerradoPor'>): Promise<CierreDia>;
  reabrirDia(fecha: string): Promise<void>;

  subirFoto(archivo: Blob, nombre: string): Promise<string>;
  urlFoto(ruta: string): Promise<string>;
}
