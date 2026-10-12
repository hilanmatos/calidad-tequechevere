# Calidad Chévere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA para que Calidad registre desde una tablet los 12 formatos de monitoreo de planta, con dashboard, historial y exportación, sobre Supabase y publicada en GitHub Pages.

**Architecture:** SPA React (HashRouter) que se genera a partir de definiciones de formato declarativas (`src/formatos/*.ts`) evaluadas por un motor puro (`src/motor/`). Los datos pasan por una interfaz `Repositorio` con dos implementaciones: Supabase (producción) y localStorage (modo demo cuando no hay llaves). Un script Python local importa el histórico de Excel.

**Tech Stack:** Vite 6, React 18, TypeScript 5, Tailwind CSS 4, ECharts 5, @tanstack/react-query 5, @supabase/supabase-js 2, vite-plugin-pwa, exceljs, lucide-react, Vitest; Python 3.13 + openpyxl + requests para el importador.

**Spec:** `docs/superpowers/specs/2026-10-12-calidad-chevere-design.md`

---

## File Structure

```
index.html                         entrada Vite, fuentes, theme-color
vite.config.ts                     base '/calidad-tequechevere/', PWA, vitest
.env.example                       VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
.github/workflows/deploy.yml       build + deploy a Pages
supabase/migrations/*.sql          esquema, RLS, trigger de historial, bucket
public/logo.png, public/icono-*.png
src/main.tsx                       providers (QueryClient, Auth, HashRouter)
src/App.tsx                        rutas
src/estilos.css                    Tailwind + tokens de marca
src/lib/fechas.ts                  hoy en America/Panama, formateos, sumar días
src/lib/supabase.ts                cliente o null si no hay llaves
src/motor/tipos.ts                 tipos de formato, campo, contexto, desviación
src/motor/evaluar.ts               límites, estados, visibilidad, desviaciones, faltantes
src/motor/evaluar.test.ts
src/formatos/comunes.ts            campos reutilizables (generales, empaque, sensorial)
src/formatos/*.ts                  un archivo por formato (12)
src/formatos/index.ts              registro y agrupación por familia
src/datos/repositorio.ts           interfaz Repositorio + tipos Registro/Producto/Operario
src/datos/repo-supabase.ts         implementación Supabase
src/datos/repo-local.ts            implementación demo (localStorage) con datos de ejemplo
src/datos/hooks.ts                 hooks react-query
src/auth/Sesion.tsx                contexto de sesión + pantalla de ingreso
src/componentes/ui.tsx             Boton, Tarjeta, Insignia, Vacio, Encabezado
src/componentes/Marco.tsx          layout: barra lateral (tablet horizontal) / barra inferior
src/componentes/campos/*.tsx       un control por tipo de campo
src/paginas/Hoy.tsx
src/paginas/Captura.tsx            asistente por etapas + resumen + guardar
src/paginas/Historial.tsx
src/paginas/Registro.tsx           detalle + historial de cambios + imprimir
src/paginas/Tablero.tsx            dashboard
src/paginas/Admin.tsx              catálogos, usuarios, exportación
src/graficos/Grafico.tsx           wrapper ECharts con tema de marca
src/graficos/series.ts             agregaciones puras para el tablero
src/graficos/series.test.ts
src/exportar/excel.ts              exportación por formato
tools/importar/normalizar.py       normalizadores puros
tools/importar/test_normalizar.py
tools/importar/mapeos.py           Excel → id de campo por formato
tools/importar/importar.py         CLI: lee, normaliza, sube, reporta
```

## Task 1: Andamiaje del proyecto

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/estilos.css`, `.env.example`

- [ ] Crear proyecto Vite React-TS e instalar dependencias:
  `npm i react react-dom react-router-dom @tanstack/react-query @supabase/supabase-js echarts lucide-react exceljs` y
  `npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vite-plugin-pwa vitest`
- [ ] `vite.config.ts` con `base: '/calidad-tequechevere/'`, plugins react, tailwind y PWA (manifest con nombre "Calidad Chévere", `display: 'standalone'`, `theme_color: '#7A1E1E'`), y `test: { environment: 'node' }`.
- [ ] `src/estilos.css`: `@import "tailwindcss";` + `@theme` con colores `vino #7A1E1E`, `rojo #E3262B`, `dorado #F5B21B`, `naranja #F08A1C`, `crema #FFF8EC`, `ok #16A34A`, `alerta #D97706`, `fuera #DC2626` y fuentes.
- [ ] Verificar: `npm run build` → sin errores.
- [ ] Commit `chore: andamiaje Vite + React + Tailwind + PWA`.

## Task 2: Motor de formatos (TDD)

**Files:** Create `src/motor/tipos.ts`, `src/motor/evaluar.ts`; Test `src/motor/evaluar.test.ts`

Tipos clave (`tipos.ts`):

```ts
export type Unidad = '°C' | '%' | 'g' | 'kg' | 'min' | 'mL/L' | 'pH' | 'L' | 'uds' | '';
export interface Limite { min?: number; max?: number; porConfirmar?: boolean }
export interface Producto {
  id: string; codigo: string; nombre: string; linea: string; presentacion: string;
  pesoUnidadG?: number; pesoUnidadMinG?: number; pesoUnidadMaxG?: number;
  pesoRellenoG?: number; pesoDeclaradoKg?: number; vidaUtilDias?: number;
  llevaRelleno: boolean; esPrecocido: boolean; activo: boolean;
}
export interface Operario { id: string; nombre: string; area: string; activo: boolean }
export type Valores = Record<string, unknown>;
export interface Contexto { valores: Valores; producto?: Producto; fecha: string; area?: string }
interface Base { id: string; etiqueta: string; ayuda?: string; pcc?: string; opcional?: boolean;
  aplica?: (ctx: Contexto) => boolean }
export interface CampoNumero extends Base { tipo: 'numero'; unidad: Unidad; decimales?: number;
  limite?: Limite | ((ctx: Contexto) => Limite | undefined); permiteAmbiente?: boolean }
export interface CampoConforme extends Base { tipo: 'conforme'; opciones?: [string, string] }
export interface CampoOpcion extends Base { tipo: 'opcion'; opciones: string[]; malas?: string[] }
export interface CampoTexto extends Base { tipo: 'texto'; multilinea?: boolean }
export interface CampoFecha extends Base { tipo: 'fecha'; sugerido?: (ctx: Contexto) => string | undefined }
export interface CampoHora extends Base { tipo: 'hora' }
export interface CampoDuracion extends Base { tipo: 'duracion'; limite?: Limite }   // valor en segundos
export interface CampoFoto extends Base { tipo: 'foto' }
export interface CampoCalculado extends Base { tipo: 'calculado'; unidad: Unidad; decimales?: number;
  formula: (ctx: Contexto) => number | undefined; limite?: Limite | ((ctx: Contexto) => Limite | undefined) }
export interface EstadoCelda { id: string; etiqueta: string; tono: 'ok' | 'fuera' | 'neutro' }
export interface CampoChecklist extends Base { tipo: 'checklist';
  columnas: { id: string; etiqueta: string; aplica?: (ctx: Contexto) => boolean }[];
  estados: EstadoCelda[]; porDefecto: string }
export interface CampoMuestras extends Base { tipo: 'muestras'; nMuestras: number;
  columnasExtra?: ('lote' | 'vencimiento' | 'observacion')[] }
export type Campo = CampoNumero | CampoConforme | CampoOpcion | CampoTexto | CampoFecha | CampoHora
  | CampoDuracion | CampoFoto | CampoCalculado | CampoChecklist | CampoMuestras;
export interface Etapa { id: string; titulo: string; descripcion?: string; campos: Campo[];
  aplica?: (ctx: Contexto) => boolean }
export type Familia = 'linea' | 'peso' | 'personal' | 'almacenamiento';
export interface DefinicionFormato { codigo: string; version: number; nombre: string; nombreCorto: string;
  familia: Familia; codigoSQF?: string; linea?: string; icono: string; acento: string;
  usaProducto: boolean; usaLote: boolean; usaHora: boolean; usaArea: boolean;
  frecuencia: 'diaria' | 'por-produccion'; etapas: Etapa[] }
export type Estado = 'vacio' | 'ok' | 'fuera' | 'alerta';
export interface Desviacion { campoId: string; etiqueta: string; etapa: string; valor: string;
  esperado: string; pcc?: string; severidad: 'pcc' | 'calidad' | 'por-confirmar' }
// Valores de checklist: { [operarioId]: { [columnaId]: estadoId, _obs?: string } }
// Valores de muestras: FilaMuestras[]
export interface FilaMuestras { operarioId?: string; productoId?: string; muestras: (number | null)[];
  apariencia?: 'C' | 'NC'; lote?: string; vencimiento?: string; observacion?: string }
```

Funciones (`evaluar.ts`): `limiteDe`, `textoLimite`, `estadoNumero`, `estadoCampo`, `campoVisible`, `etapasVisibles`, `valorCalculado`, `desviaciones`, `faltantes`, `resumenMuestras`, `sumarDias`.

- [ ] Escribir pruebas (`evaluar.test.ts`) que cubran:
  - `estadoNumero(5, {max: 4})` → `'fuera'`; `(3, {min: 1, max: 5})` → `'ok'`; `(-12, {max: -18, porConfirmar: true})` → `'alerta'`; `(undefined, …)` → `'vacio'`.
  - campo con `aplica: ctx => !!ctx.producto?.esPrecocido` es invisible sin producto precocido y no cuenta en `faltantes`.
  - `desviaciones` devuelve severidad `'pcc'` para un campo con `pcc: 'PCC1'` fuera de límite, `'calidad'` para `conforme` = "No conforme", y `'por-confirmar'` para límite por confirmar.
  - checklist con una celda `falla` → una desviación con etiqueta `"<operario> · <columna>"` (el nombre llega por `ctx.valores.__operarios`).
  - `resumenMuestras([16.2, 17.4, null], {min:16, max:17})` → `{ n: 2, promedio: 16.8, fuera: 1 }`.
  - `faltantes` lista campos requeridos visibles vacíos y omite `opcional`.
- [ ] Correr `npx vitest run` → FAIL (funciones no existen).
- [ ] Implementar `evaluar.ts` hasta que pasen.
- [ ] Correr `npx vitest run` → PASS.
- [ ] Commit `feat(motor): evaluación de límites, visibilidad y desviaciones`.

## Task 3: Definiciones de formatos

**Files:** Create `src/formatos/comunes.ts`, `src/formatos/{temp-cuartos,cq-l1-tequenos,cq-l2-empanadas-trigo,cq-l3-empanadas-maiz,cq-l4-almond,cq-l5-yuca,cq-salsa-tartara,fq32-tequenos,fq32-empanadas,fq32-gluten-free,higiene-uniforme,lavado-manos}.ts`, `src/formatos/index.ts`; Test `src/formatos/formatos.test.ts`

- [ ] Prueba: todos los formatos tienen códigos únicos, ids de campo únicos dentro del formato, y al menos una etapa; `temp-cuartos` marca "fuera" un display de congelación a −12 °C y "ok" a −19 °C; `cq-l1-tequenos` oculta la etapa de freído si el producto no es precocido.
- [ ] Implementar los 12 formatos según la tabla del spec (§4). Límites SQF: refrigeración `{min:1,max:5}`, congelación `{max:-18}`; límites de proceso no documentados con `porConfirmar: true`.
- [ ] `npx vitest run` → PASS. Commit `feat(formatos): 12 formatos de monitoreo`.

## Task 4: Capa de datos

**Files:** Create `src/lib/fechas.ts`, `src/lib/supabase.ts`, `src/datos/repositorio.ts`, `src/datos/repo-supabase.ts`, `src/datos/repo-local.ts`, `src/datos/hooks.ts`

```ts
export interface Registro { id: string; formato: string; versionFormato: number; fecha: string; hora?: string;
  linea?: string; area?: string; productoId?: string; lote?: string; datos: Valores;
  desviaciones: Desviacion[]; tieneDesviacionPcc: boolean; accionCorrectiva?: string; fotos: string[];
  origen: 'app' | 'importado'; creadoPor?: string; creadoPorNombre?: string; creadoEn: string; actualizadoEn?: string }
export interface Repositorio {
  modo: 'supabase' | 'demo';
  sesion(): Promise<Usuario | null>; ingresar(correo: string, clave: string): Promise<Usuario>; salir(): Promise<void>;
  productos(): Promise<Producto[]>; guardarProducto(p: Producto): Promise<void>;
  operarios(): Promise<Operario[]>; guardarOperario(o: Operario): Promise<void>;
  registros(f: { desde: string; hasta: string; formato?: string }): Promise<Registro[]>;
  registro(id: string): Promise<Registro | null>;
  guardarRegistro(r: Omit<Registro, 'id' | 'creadoEn'> & { id?: string }): Promise<Registro>;
  historial(id: string): Promise<CambioRegistro[]>;
  subirFoto(archivo: Blob): Promise<string>; urlFoto(ruta: string): Promise<string>;
}
```

- [ ] `fechas.ts`: `hoyPanama()` → `'YYYY-MM-DD'` usando `Intl.DateTimeFormat('en-CA', {timeZone:'America/Panama'})`; `horaPanama()`; `formatoLargo(fecha)` en español.
- [ ] `repo-local.ts` con datos demo (productos de ejemplo y operarios ficticios "Operario 1…") y 30 días de registros sintéticos para ver el tablero.
- [ ] `hooks.ts`: `useProductos`, `useOperarios`, `useRegistros(rango)`, `useGuardarRegistro` (invalida `registros`).
- [ ] `npm run build` → OK. Commit `feat(datos): repositorio Supabase + modo demo`.

## Task 5: Esquema Supabase

**Files:** Create `supabase/migrations/20261012000000_esquema.sql`

- [ ] Tablas `perfiles`, `operarios`, `productos`, `registros`, `registros_historial` según spec §3, con `check` de roles y `origen`.
- [ ] Función `es_admin()` (`security definer`), RLS por tabla según spec §3; edición del creador limitada a `(creado_en at time zone 'America/Panama')::date = (now() at time zone 'America/Panama')::date`.
- [ ] Trigger `registrar_historial` en UPDATE/DELETE; trigger `nuevo_usuario` que crea perfil `capturista` al registrarse un usuario.
- [ ] Bucket `fotos` privado + políticas de storage para `authenticated`.
- [ ] Cuando exista el proyecto: `npx supabase link --project-ref <ref>` y `npx supabase db push` → migración aplicada.
- [ ] Commit `feat(db): esquema, RLS, historial y storage`.

## Task 6: Sesión y marco

**Files:** Create `src/auth/Sesion.tsx`, `src/componentes/ui.tsx`, `src/componentes/Marco.tsx`, `src/App.tsx`

- [ ] Pantalla de ingreso con logo, fondo crema con forma vino; en modo demo un botón "Entrar en modo demo".
- [ ] Marco: barra lateral vino con Hoy / Registrar / Historial / Tablero / Admin (solo admin) en horizontal; barra inferior en vertical; cabecera con fecha larga y usuario.
- [ ] Verificar en navegador a 1280×800 y 800×1280. Commit `feat(ui): ingreso y marco de navegación`.

## Task 7: Controles de campo y Captura

**Files:** Create `src/componentes/campos/{CampoNumero,CampoConforme,CampoOpcion,CampoTexto,CampoFecha,CampoHora,CampoDuracion,CampoFoto,CampoCalculado,CampoChecklist,CampoMuestras,CampoGenerico}.tsx`, `src/paginas/Captura.tsx`

- [ ] `CampoNumero`: input `inputMode="decimal"` de 56 px, unidad a la derecha, botones −/+ por paso, chip de límite ("1 a 5 °C", "≤ −18 °C"), borde y punto de color por estado, chip "Ambiente" si `permiteAmbiente`.
- [ ] `CampoConforme` y `CampoOpcion`: botones segmentados grandes; malos en rojo al elegir.
- [ ] `CampoChecklist`: tabla operario × columna; toque cicla estados; fila con campo de observación; botón "Todo cumple".
- [ ] `CampoMuestras`: filas con operario, producto, M1…Mn en rejilla, promedio y fuera de tolerancia en vivo, C/NC, extras.
- [ ] `Captura.tsx`: encabezado (formato, fecha, hora, área/producto/lote según formato), asistente por etapas visibles con barra de progreso, navegación anterior/siguiente, panel lateral de desviaciones en vivo, pantalla Resumen con acción correctiva obligatoria si hay PCC, guardar → toast y volver a Hoy. Borrador en `localStorage` con clave `borrador:<formato>`.
- [ ] Verificar llenando `temp-cuartos` y `cq-l1-tequenos` completos en modo demo. Commit `feat(captura): asistente por etapas con semáforo`.

## Task 8: Hoy, Historial y detalle

**Files:** Create `src/paginas/Hoy.tsx`, `src/paginas/Historial.tsx`, `src/paginas/Registro.tsx`

- [ ] Hoy: saludo, KPIs del día (registros, desviaciones PCC, formatos pendientes), tarjetas por familia con estado y botón "Registrar".
- [ ] Historial: filtros (rango, formato, solo con desviaciones), tabla con chips de estado; clic → detalle.
- [ ] Registro: valores por etapa con semáforo, desviaciones, acción correctiva, fotos, historial de cambios, botones Editar (si permite) e Imprimir (`window.print()` con CSS de impresión).
- [ ] Commit `feat: Hoy, Historial y detalle de registro`.

## Task 9: Tablero (TDD en agregaciones)

**Files:** Create `src/graficos/series.ts`, `src/graficos/series.test.ts`, `src/graficos/Grafico.tsx`, `src/paginas/Tablero.tsx`

- [ ] Pruebas de `series.ts`: `porDia(registros)` cuenta por fecha y familia; `pareto(registros)` ordena etiquetas de desviación desc. con % acumulado; `serieCampo(registros, formato, campoId)` devuelve `[fecha, valor]` ordenado y omite vacíos; `higienePorCriterio` y `lavadoMapa` agregan fallas.
- [ ] `npx vitest run` → FAIL → implementar → PASS.
- [ ] Tablero: filtros (rango rápido 7/30/90 días o personalizado, línea), KPIs con variación vs período anterior, gráficos: actividad por día (barras apiladas), Pareto, explorador de variable (formato + campo numérico → línea con banda de límite), cuartos fríos (4 series + bandas), peso por producto (promedio con banda min/max), higiene por criterio y por operario, mapa de calor de lavado de manos.
- [ ] Commit `feat(tablero): dashboard con KPIs y gráficos`.

## Task 10: Administración y exportación

**Files:** Create `src/paginas/Admin.tsx`, `src/exportar/excel.ts`

- [ ] Pestañas Productos y Operarios (tabla editable, activar/desactivar), Exportar (formato + rango → .xlsx con encabezado de marca, una columna por campo, desviaciones y "Realizado por").
- [ ] Commit `feat(admin): catálogos y exportación a Excel`.

## Task 11: Publicación

**Files:** Create `.github/workflows/deploy.yml`, `README.md`

- [ ] Workflow: on push a `main` → `npm ci`, `npm test`, `npm run build` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` desde *repository variables*, `actions/upload-pages-artifact`, `actions/deploy-pages`.
- [ ] `gh repo create hilanmatos/calidad-tequechevere --public --source . --push`; `gh api -X POST repos/hilanmatos/calidad-tequechevere/pages -f build_type=workflow`; `gh variable set` de las dos variables.
- [ ] Verificar URL `https://hilanmatos.github.io/calidad-tequechevere/` carga y permite ingresar.
- [ ] Commit `ci: publicación en GitHub Pages`.

## Task 12: Importador del histórico (TDD en normalizadores)

**Files:** Create `tools/importar/{normalizar.py,test_normalizar.py,mapeos.py,importar.py,requirements.txt,README.md}`

- [ ] Pruebas (`python -m pytest tools/importar`): `numero("33.6°C") == 33.6`; `numero("-") is None`; `peso_kg("484g") == 0.484`; `peso_kg(881) == 0.881` (gramos sin unidad > 50 → kg); `fecha_texto("13/12/2025") == date(2025,12,13)`; `corregir_secuencia([date(2026,1,8), date(2026,3,8), "13/12/2025"…])` invierte día/mes cuando la secuencia lo exige; `conforme("Correcta") == "Conforme"`; higiene `falla(1, escala="1=cumple") is False`.
- [ ] FAIL → implementar → PASS.
- [ ] `importar.py --carpeta <ruta> --seco` imprime conteos y reporte sin subir; sin `--seco` sube vía REST con `SUPABASE_SERVICE_ROLE_KEY` de `.env.local` y escribe `tools/importar/salida/reporte.csv` (ignorado por git).
- [ ] Commit `feat(importar): importador del histórico con normalización`.
```
