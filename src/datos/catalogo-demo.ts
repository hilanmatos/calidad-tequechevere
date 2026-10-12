import type { Operario, Producto } from '../motor/tipos';

type SinId<T> = Omit<T, 'id'>;

const p = (x: Partial<Producto> & Pick<Producto, 'codigo' | 'nombre' | 'linea' | 'presentacion'>): SinId<Producto> => ({
  llevaRelleno: true, esPrecocido: false, activo: true, vidaUtilMeses: 6, ...x,
});

/** Productos de ejemplo para el modo demo. Los pesos son ilustrativos. */
export const PRODUCTOS_DEMO: SinId<Producto>[] = [
  p({ codigo: 'PT011', nombre: 'Tequeño full queso', linea: 'cq-l1-tequenos', presentacion: '12 unidades', pesoUnidadG: 37, pesoUnidadMinG: 35, pesoUnidadMaxG: 39, pesoRellenoG: 12, pesoDeclaradoKg: 0.444 }),
  p({ codigo: 'PT013', nombre: 'Tequeño full queso precocido', linea: 'cq-l1-tequenos', presentacion: '20 unidades', pesoUnidadG: 38, pesoUnidadMinG: 36, pesoUnidadMaxG: 40, pesoRellenoG: 12, pesoDeclaradoKg: 0.76, esPrecocido: true }),
  p({ codigo: 'PT026', nombre: 'Tequeño full queso precocido', linea: 'cq-l1-tequenos', presentacion: '24 unidades', pesoUnidadG: 38, pesoUnidadMinG: 36, pesoUnidadMaxG: 40, pesoRellenoG: 12, pesoDeclaradoKg: 0.912, esPrecocido: true }),
  p({ codigo: 'PT014', nombre: 'Tequeño boquita', linea: 'cq-l1-tequenos', presentacion: '24 unidades', pesoUnidadG: 20, pesoUnidadMinG: 19, pesoUnidadMaxG: 22, pesoRellenoG: 6, pesoDeclaradoKg: 0.48 }),
  p({ codigo: 'PD001', nombre: 'Discos', linea: 'cq-l2-empanadas-trigo', presentacion: '12 unidades', pesoUnidadG: 38, pesoUnidadMinG: 36, pesoUnidadMaxG: 40, pesoDeclaradoKg: 0.46, llevaRelleno: false }),
  p({ codigo: 'PE010', nombre: 'Pastelitos de pollo', linea: 'cq-l2-empanadas-trigo', presentacion: '30 unidades', pesoUnidadG: 33, pesoUnidadMinG: 31, pesoUnidadMaxG: 35, pesoRellenoG: 12, pesoDeclaradoKg: 1 }),
  p({ codigo: 'PE011', nombre: 'Pastelitos de queso', linea: 'cq-l2-empanadas-trigo', presentacion: '30 unidades', pesoUnidadG: 32, pesoUnidadMinG: 30, pesoUnidadMaxG: 34, pesoRellenoG: 11, pesoDeclaradoKg: 1 }),
  p({ codigo: 'PE020', nombre: 'Empanaditas de queso', linea: 'cq-l3-empanadas-maiz', presentacion: '30 unidades', pesoUnidadG: 34, pesoUnidadMinG: 32, pesoUnidadMaxG: 36, pesoRellenoG: 9, pesoDeclaradoKg: 1 }),
  p({ codigo: 'PE021', nombre: 'Empanaditas de pollo', linea: 'cq-l3-empanadas-maiz', presentacion: '30 unidades', pesoUnidadG: 35, pesoUnidadMinG: 33, pesoUnidadMaxG: 37, pesoRellenoG: 9, pesoDeclaradoKg: 1 }),
  p({ codigo: 'PE022', nombre: 'Empanaditas de carne', linea: 'cq-l3-empanadas-maiz', presentacion: '30 unidades', pesoUnidadG: 36, pesoUnidadMinG: 34, pesoUnidadMaxG: 38, pesoRellenoG: 9, pesoDeclaradoKg: 1 }),
  p({ codigo: 'PK006', nombre: 'Almond Bites con queso', linea: 'cq-l4-almond', presentacion: '20 unidades', pesoUnidadG: 16, pesoUnidadMinG: 16, pesoUnidadMaxG: 17, pesoRellenoG: 5, pesoDeclaradoKg: 0.32 }),
  p({ codigo: 'PK005', nombre: 'Almond Bites con chocolate', linea: 'cq-l4-almond', presentacion: '20 unidades', pesoUnidadG: 16, pesoUnidadMinG: 16, pesoUnidadMaxG: 17, pesoRellenoG: 2.5, pesoDeclaradoKg: 0.32 }),
  p({ codigo: 'PY001', nombre: 'Yuca Bites de queso blanco', linea: 'cq-l5-yuca', presentacion: '16 unidades', pesoUnidadG: 27, pesoUnidadMinG: 26, pesoUnidadMaxG: 29, pesoRellenoG: 7, pesoDeclaradoKg: 0.44, esPrecocido: true }),
  p({ codigo: 'PY007', nombre: 'Yuky snack de queso blanco', linea: 'cq-l5-yuca', presentacion: '32 unidades', pesoUnidadG: 27, pesoUnidadMinG: 26, pesoUnidadMaxG: 29, pesoRellenoG: 7, pesoDeclaradoKg: 0.87, esPrecocido: true }),
  p({ codigo: 'PS001', nombre: 'Salsa tártara', linea: 'cq-salsa-tartara', presentacion: 'Envase de 600 g', pesoDeclaradoKg: 0.6, llevaRelleno: false }),
];

/** Nombres ficticios: los operarios reales viven solo en Supabase. */
export const OPERARIOS_DEMO: SinId<Operario>[] = [
  ...['María González', 'José Rodríguez', 'Luis Mendoza', 'Carmen Vega', 'Pedro Sánchez', 'Rosa Díaz', 'Iván Castro'].map((nombre) => ({ nombre, area: 'Tequeños', activo: true })),
  ...['Ana Castillo', 'Jorge Torres', 'Elena Ruiz', 'Raúl Pinto'].map((nombre) => ({ nombre, area: 'Gluten Free', activo: true })),
  ...['Sofía Morales', 'Daniel Herrera'].map((nombre) => ({ nombre, area: 'Tienda', activo: true })),
  ...['Andrés Navarro', 'Lucía Ortega'].map((nombre) => ({ nombre, area: 'Planta Alta', activo: true })),
];
