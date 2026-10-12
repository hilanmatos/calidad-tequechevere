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
  guardarRegistro(r: NuevoRegistro): Promise<Registro>;
  eliminarRegistro(id: string): Promise<void>;
  historial(id: string): Promise<CambioRegistro[]>;

  subirFoto(archivo: Blob, nombre: string): Promise<string>;
  urlFoto(ruta: string): Promise<string>;
}
