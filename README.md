# Calidad Chévere

App para que Calidad de Teque Chévere registre desde una tablet los formatos de monitoreo de planta,
con tablero de indicadores, historial y exportación a Excel.

**App:** https://hilanmatos.github.io/calidad-tequechevere/

## Cómo se usa

- **Hoy**: la rutina diaria (cuartos fríos, higiene, lavado de manos) y una tarjeta por formato.
  Tocar una tarjeta abre el formato paso a paso.
- **Historial**: todos los registros con filtros y exportación a Excel.
- **Tablero**: indicadores del período, desviaciones más frecuentes, tendencias con su banda de límite.
- **Admin** (solo administradores): productos con pesos y vida útil, operarios por área, usuarios.

En la tablet: abrir la URL en Chrome y elegir "Agregar a la pantalla principal". Queda como app de pantalla completa.

## Cambiar un formato

Cada formato está en `src/formatos/`. Ejemplo: cambiar el límite de la temperatura interna del freído de tequeños,
en `src/formatos/cq-l1-tequenos.ts`:

```ts
temp('tInternaFreido', 'Temperatura interna', { pcc: 'PCC1', limite: { min: 74 } }),
```

- `limite: { min, max }` pinta el campo en rojo fuera de rango y exige acción correctiva.
- `limite: { min, max, porConfirmar: true }` lo marca en índigo como aviso, sin bloquear.
- `POR_DEFINIR` deja el PCC registrado con la etiqueta "límite por definir".
- `opcional: true` permite guardar sin llenarlo.
- `aplica: (c) => c.producto?.esPrecocido` muestra el campo solo cuando corresponde.

Después: `git commit` y `git push`. GitHub publica la nueva versión en un par de minutos.

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:5173/calidad-tequechevere/
npm test         # pruebas del motor, formatos y agregaciones
```

Sin `.env.local` la app arranca en **modo demo**: datos de prueba en el navegador.

## Conexión con Supabase

1. Copiar `.env.example` a `.env.local` y completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. Aplicar el esquema: `npx supabase link --project-ref <ref>` y `npx supabase db push`.
3. En GitHub, *Settings > Secrets and variables > Actions > Variables*: crear `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` con los mismos valores. El siguiente push publica la app conectada.
4. Usuarios: en Supabase, *Authentication > Users > Add user*. Aparecen en Admin como capturistas;
   el primer administrador se marca con `update perfiles set rol = 'admin' where correo = '…';`.

La llave `anon` es pública por diseño; los datos los protegen las políticas RLS de
`supabase/migrations/`. La llave `service_role` **nunca** va al repositorio: solo en `.env.local`.

## Importar el histórico de Excel

Ver `tools/importar/README.md`. Los Excel y los reportes de importación no se suben al repositorio.

## Estructura

```
src/motor/       evaluación de límites, desviaciones y campos faltantes (sin interfaz)
src/formatos/    definición de los 12 formatos
src/datos/       repositorio Supabase y modo demo
src/paginas/     Hoy, Captura, Historial, Registro, Tablero, Admin
src/graficos/    agregaciones y gráficos del tablero
supabase/        esquema, RLS e historial de cambios
docs/superpowers diseño y plan de implementación
```
