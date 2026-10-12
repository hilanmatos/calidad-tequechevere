# Calidad Chévere — Diseño

**Fecha:** 2026-10-12 · **Autor:** Departamento de Operaciones (Hilan Matos) · **Estado:** aprobado

App web instalable (PWA) para que el equipo de Calidad de TEQUE CHÉVERE INTERNACIONAL registre
desde una tablet los formatos de monitoreo de planta que hoy se llenan a mano y luego se pasan a Excel,
con dashboard tipo Power BI, historial y exportación.

## 1. Decisiones

| Tema | Decisión |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind CSS, ECharts, PWA instalable |
| Datos | Supabase: Auth (correo + contraseña), Postgres con RLS, Storage para fotos |
| Hosting | Repo **público** en GitHub, publicado en GitHub Pages con GitHub Actions en cada push a `main` |
| Conectividad | WiFi estable en planta: la app es online; los borradores se guardan en el dispositivo para no perder datos |
| Histórico | Se importa desde los Excel actuales con un script local, normalizando datos |
| Estilo | Claro, colores de marca (vino, rojo, dorado, crema), legible bajo luz fuerte |

**Regla del repo público:** en el repositorio no hay datos reales. Los Excel, los nombres de
operarios y las llaves `service_role` viven solo en la computadora del administrador (`.env.local`,
ignorado por git) y en Supabase. La llave `anon` de Supabase es pública por diseño; la protección la
dan las políticas RLS.

## 2. Arquitectura

```
Tablet (PWA)  ──HTTPS──>  Supabase (Auth · Postgres+RLS · Storage)
     ^                              ^
GitHub Pages <── Actions <── git push (PC de Hilan)    tools/importar (PC de Hilan, service key)
```

- Ruteo con `HashRouter` (GitHub Pages no reescribe rutas).
- Datos con `@tanstack/react-query` sobre `@supabase/supabase-js`.
- Volumen esperado: decenas de registros por día → agregaciones del dashboard en el cliente.
- Zona horaria de negocio: `America/Panama`.

## 3. Modelo de datos

- `perfiles` (id = auth.users.id, nombre, rol `admin` | `capturista`, activo).
- `operarios` (nombre, área, activo). Áreas: Tequeños, Gluten Free, Tienda, Planta Alta.
- `productos` (código PT, nombre, línea, presentación, peso unitario teórico g con mínimo y máximo,
  peso de relleno teórico g, peso declarado del empaque kg, vida útil en días, lleva relleno,
  es precocido, activo).
- `registros`: uno por formato llenado.
  `formato`, `version_formato`, `fecha`, `hora`, `linea`, `area`, `producto_id`, `lote`,
  `datos jsonb`, `desviaciones jsonb`, `tiene_desviacion_pcc`, `accion_correctiva`, `fotos text[]`,
  `origen` (`app` | `importado`), `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`.
- `registros_historial`: trigger en UPDATE/DELETE de `registros` guarda antes/después, usuario y
  momento (integridad de registros SQF).
- Storage: bucket privado `fotos`.

**RLS:** todo requiere sesión. Catálogos: leen todos, escribe `admin`. Registros: leen todos; inserta
el usuario como `creado_por`; edita `admin` o el creador el mismo día (hora de Panamá); borra solo
`admin`.

## 4. Motor de formatos

Cada formato es un archivo TypeScript en `src/formatos/` que declara etapas y campos. La pantalla
de captura, las validaciones, el semáforo, el historial, la exportación y el dashboard se generan a
partir de esa definición. Cambiar un límite o agregar un campo = editar una línea y hacer push (queda
versionado en git).

Tipos de campo: `numero` (unidad, decimales, límites min/max, `pcc`), `conforme` (C/NC),
`opcion` (lista), `texto`, `fecha`, `hora`, `duracion`, `foto`, `calculado` (fórmula sobre otros
campos o el producto), `grilla` (filas × columnas: operarios × criterios, operarios × muestras).

Reglas: `aplica(producto)` oculta campos que no corresponden (ej. discos sin relleno, freído solo
en precocidos); fecha, "Realizado por", presentación, peso teórico y vencimiento se autocompletan.
Un campo con límite fuera de rango queda en rojo; si es PCC, la acción correctiva es obligatoria
para guardar.

Límites del sistema SQF ya definidos: refrigeración **1–5 °C**, congelación **−18 °C o menor**.
Los límites críticos de PCC de proceso que no estén documentados se cargan marcados
**"por confirmar"** (se muestran en ámbar, no bloquean) hasta que Calidad los valide.

### Catálogo de formatos (v1)

| Código app | Formato | Familia | Etapas / contenido |
|---|---|---|---|
| `cq-l1-tequenos` | Control de calidad L1 Tequeños | Línea | Generales · Masa (T agua/Ambiente, T masa, %H masa, proveedor y %H queso, apariencia) · Enrollado (vueltas, peso prom. vs teórico, relleno) · Enfriamiento turbo (T interna) · Freído solo precocidos (T aceite, tiempo, T interna PCC1, aspecto, defectos) · Congelación (T inicial PCC2) · Empaque (lote, vencimiento, T final PCC3, peso medido vs declarado, metales PCC4, T y calidad de sellado, impresión de lote) · Sensorial (sabor, color, textura, apariencia, foto) |
| `cq-l2-empanadas-trigo` | Control de calidad L2 Empanadas de trigo, discos y pastelitos | Línea | Generales · Masa · Producto (peso relleno y producto vs teórico) · Congelación (T relleno, T interna PCC1) · Empaque (peso vs teórico, metales PCC2, sellado, impresión) |
| `cq-l3-empanadas-maiz` | Control de calidad L3 Empanadas de maíz | Línea | Igual a L2 + peso de masa + apariencia PCC2, metales PCC3 |
| `cq-l4-almond` | Control de calidad L4 Almond Bites | Línea | Masa · Formado (T relleno inicial/final, espera, tiempo, peso unidad 16–17 g, relleno, % NC) · Congelación (PCC1) · Empaque (peso caja 320 g, T final PCC2, metales PCC3, sellado, impresión) · Sensorial |
| `cq-l5-yuca` | Control de calidad L5 Yuca Bites y carimañola | Línea | Masa (%H yuca fresca, cocción tiempo/T, agua, T y %H masa) · Formado · Pre-congelación · Fritura/horneado (T aceite/horno, tiempo, T interna PCC1, % NC) · Congelación · Empaque (T final PCC2, peso, metales PCC3, sellado, impresión) · Sensorial |
| `cq-salsa-tartara` | Control de calidad Salsa tártara | Línea | Generales · Higienización (lavado, Sanitec mL/L y tiempo PCC1, enjuague, escurrido, corte, picado) · Formulación (pesos conforme a fórmula, tiempo de mezclado, apariencia) · Producto (pH PCC2, color, olor, consistencia) · Envasado (T producto y tiempo expuesto PCC3, peso neto vs 600 g, etiqueta alérgeno huevo, lote, vencimiento, cierre) · Inocuidad (metales PCC4, inspección visual) · Almacenamiento (T PCC5) |
| `fq32-tequenos` | F-Q-32 Control de peso Tequeños | Peso | Hora · Condiciones (T/%H ambiente, T/%H masa, lote y %H queso, lote producto, bandejas/ciclo, T congelación inicial/final, T fritura, T aceite, T congelación empaque) · Grilla operador × producto × M1–M10 + C/NC + observación, con promedio y % fuera de tolerancia en vivo |
| `fq32-empanadas` | F-Q-32 Control de peso Empanaditas, pastelitos y discos | Peso | Hora · Condiciones (%H masa, T masa, T relleno, peso de empaque) · Grilla con lote y vencimiento por fila |
| `fq32-gluten-free` | F-Q-32 Control de peso Gluten Free (Yuca/Almond Bites) | Peso | Igual a Tequeños, con especificación por producto (Almond: unidad 16–17 g) |
| `higiene-uniforme` | Revisión de higiene y uniforme | Personal | Área → lista de operarios activos del área × 10 criterios (estado de salud, manos y uñas, cabello cubierto, barba cubierta, mascarilla, uniforme limpio, zapatos limpios y cerrados, delantal y cubre mangas, sin maquillaje ni pestañas, sin accesorios). Todo arranca en "cumple"; se toca solo la falla (o N/A) y se anota observación |
| `lavado-manos` | Control de lavado de manos | Personal | Día → operarios × horarios 06:30, 09:30, 12:30, 14:30 (sábado sin 14:30): lavó / no lavó / ausente |
| `temp-cuartos` | Temperatura de cuartos de almacenamiento | Almacenamiento | Hora · Cuarto frío PB, Congelación PB, Cuarto frío PA, Congelación PA: lectura del display (con límite) y de la pistola; diferencia calculada |

Fuera de v1 (estudios puntuales, no formatos diarios): hoja "Control de masa" de Tequeños y
"Tiempos de espera Yuca Bites".

## 5. Pantallas

1. **Ingreso**: correo y contraseña, sesión recordada en la tablet.
2. **Hoy (inicio)**: saludo, fecha, tarjetas por familia con estado del día (pendiente / completado /
   con alertas), contador de alertas PCC abiertas.
3. **Captura**: asistente por etapas con barra de progreso; campos grandes (mín. 48 px de alto),
   teclado numérico, botones Conforme/No conforme a todo el ancho, semáforo por campo; pantalla final
   de resumen con desviaciones y acción correctiva; borrador automático.
4. **Historial**: tabla filtrable (fecha, formato, línea, producto, solo con desviaciones); detalle
   de registro con historial de cambios; editar según permisos.
5. **Dashboard**: filtros de rango de fechas, línea y producto. KPIs: registros del período,
   % conformidad, desviaciones PCC, peso real vs teórico. Gráficos: tendencias PCC con banda de límite,
   gráfico de control de peso por producto, Pareto de no conformidades, higiene por criterio, área y
   operario, mapa de calor de lavado de manos, cuartos fríos con banda de rango y diferencia
   pistola vs display.
6. **Administración** (solo admin): operarios, productos, usuarios; exportación a Excel por formato y
   período; vista imprimible (PDF desde el navegador).

## 6. Identidad visual

Paleta tomada del logo: vino `#7A1E1E`, rojo `#E3262B`, dorado `#F5B21B`, naranja `#F08A1C`, crema
`#FFF8EC`. Fondo claro, tarjetas blancas con sombras suaves, tipografía display para títulos y cifras
grandes en KPIs. Verde/ámbar/rojo reservados para el semáforo de calidad.

## 7. Importación del histórico

`tools/importar/` (Python, local): lee los Excel de la carpeta de Dropbox, normaliza y sube con la
llave `service_role` desde `.env.local`.

Normalizaciones: fechas tipo texto `dd/mm/aaaa`; fechas tipo fecha con día y mes invertidos se
corrigen cuando la fecha cae en el futuro o choca con el orden del lote/vencimiento; se quitan unidades
del valor (`"33.6°C"` → 33.6, `"484g"` → 0.484 kg); `-`, `NA`, vacío → sin dato; higiene se guarda
siempre como **falla sí/no** (la hoja original con 1 = cumple se invierte); lavado de manos: 0 =
lavó, 1 = no lavó, `-` o texto = ausente. Salida: reporte de filas importadas y rechazadas para
revisión manual. Los registros importados quedan con `origen = importado`.

## 8. Entregas

1. **Base**: repo, Supabase (esquema, RLS, storage), login, publicación en Pages, motor de formatos,
   Hoy, captura de `temp-cuartos` y `cq-l1-tequenos`, historial y dashboard básico.
2. **Formatos**: resto de líneas, los tres F-Q-32, higiene y lavado de manos.
3. **Cierre**: importación del histórico, dashboard completo, exportación Excel y vista imprimible.

## 9. Pruebas

- Unitarias (Vitest) para el motor: evaluación de límites, `aplica`, campos calculados,
  vencimiento, normalizadores del importador.
- Verificación manual en navegador a tamaño tablet (1280×800 y 800×1280) antes de cada entrega.
- Prueba de RLS: un capturista no puede editar registros de días anteriores ni catálogos.
