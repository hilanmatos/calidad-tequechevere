-- Calidad Chévere: productos en caja transparente, catálogo nuevo y operarios desde la tablet
-- Decisión de Operaciones: en los productos que van en caja transparente no se toman temperaturas internas, solo una
-- temperatura superficial, al día siguiente, en el empaque (campo tSuperficial de L1 Tequeños y L4 Almond Bites).
-- Todo es idempotente: se puede volver a correr sin duplicar nada.

-- ───────────── Productos: caja transparente ─────────────
alter table public.productos
  add column if not exists caja_transparente boolean not null default false;

-- ───────────── Catálogo ─────────────
-- Presentaciones que cambian y productos que pasan a caja transparente
update public.productos set presentacion = 'Full 12'
  where linea = 'cq-l1-tequenos' and nombre = 'Tequeño Full Queso';
update public.productos set presentacion = 'x60 y x48 · caja transparente', caja_transparente = true
  where linea = 'cq-l1-tequenos' and nombre = 'Tequeño Boquita';
update public.productos set presentacion = 'x30 · caja transparente', caja_transparente = true
  where linea = 'cq-l1-tequenos' and nombre = 'Tequeño Premium';
update public.productos set presentacion = '10 × 3 · caja transparente', caja_transparente = true
  where linea = 'cq-l1-tequenos' and nombre = 'Tequeño Salchi Queso';
update public.productos set presentacion = 'x20'
  where linea = 'cq-l4-almond' and nombre = 'Almond Bite de Queso';
update public.productos set presentacion = 'x20'
  where linea = 'cq-l4-almond' and nombre = 'Almond Bite de Chocolate';

-- Productos nuevos, sin código. Los Premium de guayaba y de chocolate quedan sin límites de peso (por confirmar).
-- El Full de Mantequilla usa la masa SM011: solo cambia la grasa.
insert into public.productos (
  codigo, nombre, linea, presentacion, peso_unidad_g, peso_unidad_min_g, peso_unidad_max_g,
  peso_relleno_g, peso_relleno_min_g, peso_relleno_max_g, vida_util_meses, es_precocido, lleva_congelacion, caja_transparente
)
select
  v.codigo, v.nombre, v.linea, v.presentacion, v.peso_unidad_g::numeric, v.peso_unidad_min_g::numeric, v.peso_unidad_max_g::numeric,
  v.peso_relleno_g::numeric, v.peso_relleno_min_g::numeric, v.peso_relleno_max_g::numeric, v.vida_util_meses, v.es_precocido,
  v.lleva_congelacion, v.caja_transparente
from (values
  -- código, nombre, línea, presentación, peso por unidad (teórico, mín., máx.), relleno (teórico, mín., máx.),
  -- vida útil (meses), precocido, pasa por congelación, caja transparente
  ('', 'Tequeño Full Queso x50', 'cq-l1-tequenos', 'x50 · caja transparente', null, 36, 38, null, 16, 18, 6, false, true, true),
  ('', 'Tequeño Boquita x12', 'cq-l1-tequenos', 'x12', null, 26, 29, null, 10, 11, 6, false, false, false),
  ('', 'Tequeño Premium de Guayaba', 'cq-l1-tequenos', 'x30 · caja transparente', null, null, null, null, null, null, 6, false, true, true),
  ('', 'Tequeño Premium de Chocolate', 'cq-l1-tequenos', 'x30 · caja transparente', null, null, null, null, null, null, 6, false, true, true),
  ('', 'Tequeño Full de Mantequilla', 'cq-l1-tequenos', '', null, 36, 38, null, 16, 18, 6, false, true, false),
  ('', 'Almond Bite de Queso x50', 'cq-l4-almond', 'x50 · caja transparente', 16, 15, 18, 4, null, null, 6, false, true, true),
  ('', 'Almond Bite de Chocolate x50', 'cq-l4-almond', 'x50 · caja transparente', 16, 15, 18, 3, null, null, 6, false, true, true)
) as v (
  codigo, nombre, linea, presentacion, peso_unidad_g, peso_unidad_min_g, peso_unidad_max_g,
  peso_relleno_g, peso_relleno_min_g, peso_relleno_max_g, vida_util_meses, es_precocido, lleva_congelacion, caja_transparente
)
where not exists (select 1 from public.productos p where p.nombre = v.nombre and p.linea = v.linea);

-- Para revisar después de aplicar:
--   select nombre, presentacion, peso_unidad_min_g, peso_unidad_max_g, peso_relleno_min_g, peso_relleno_max_g,
--          lleva_congelacion, caja_transparente
--   from public.productos where linea in ('cq-l1-tequenos', 'cq-l4-almond') order by linea, nombre;

-- ───────────── Campo del día siguiente ─────────────
-- Temperatura superficial de los productos en caja transparente, en el empaque de L1 y L4.
-- Debe coincidir con los formatos de src/formatos: lo verifica src/datos/migracion.test.ts.
insert into public.campos_diferidos (formato, campo) values
  ('cq-l1-tequenos', 'tSuperficial'),
  ('cq-l4-almond', 'tSuperficial')
on conflict do nothing;

-- ───────────── Operarios: la capturista los agrega y los desactiva ─────────────
-- Cualquier perfil activo (administrador o capturista) agrega operarios y los activa o desactiva. Cambiar el nombre o
-- el área de uno existente sigue siendo del administrador (trigger de abajo). No se borran: no hay política de delete.
create or replace function public.perfil_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

drop policy if exists operarios_admin_ins on public.operarios;
drop policy if exists operarios_admin_upd on public.operarios;
drop policy if exists operarios_crear on public.operarios;
drop policy if exists operarios_editar on public.operarios;
create policy operarios_crear on public.operarios for insert to authenticated
  with check (public.perfil_activo());
create policy operarios_editar on public.operarios for update to authenticated
  using (public.perfil_activo())
  with check (public.perfil_activo());

-- Un capturista solo crea operarios y cambia `activo`. Sin usuario (SQL del panel, service_role del importador) no
-- aplica: esas vías ya pasan por encima de RLS.
create or replace function public.antes_de_actualizar_operario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.es_admin() then
    if new.nombre is distinct from old.nombre or new.area is distinct from old.area then
      raise exception 'Solo un administrador puede cambiar el nombre o el área de un operario.'
        using errcode = '42501';
    end if;
    new.id := old.id;
    new.creado_en := old.creado_en;
  end if;
  return new;
end;
$$;

drop trigger if exists operarios_antes_de_actualizar on public.operarios;
create trigger operarios_antes_de_actualizar
  before update on public.operarios
  for each row execute function public.antes_de_actualizar_operario();

notify pgrst, 'reload schema';
