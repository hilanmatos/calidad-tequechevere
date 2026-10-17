-- Calidad Chévere: datos del día siguiente, rangos de relleno y productos sin congelación
-- La asistente de Calidad mide la congelación y el empaque al día siguiente. Esos campos se guardan vacíos y se
-- completan hasta 2 días después de la fecha del registro, aunque el día esté cerrado. Esa vía solo llena campos
-- vacíos (nunca cambia un dato ya medido) y cada cambio queda en registros_historial.

-- ───────────── Productos ─────────────
alter table public.productos
  add column if not exists peso_relleno_min_g numeric,
  add column if not exists peso_relleno_max_g numeric,
  add column if not exists lleva_congelacion boolean not null default true;

-- Rango del relleno por pieza, SQF PR-TQ-003 v8.2. Guayaba, chocolate, Salchi Queso y Zaatar no tienen rango.
update public.productos set peso_relleno_min_g = 16, peso_relleno_max_g = 18
  where linea = 'cq-l1-tequenos'
    and lower(trim(nombre)) in ('tequeño full queso', 'tequeño full queso precocido', 'tequeño chela');
update public.productos set peso_relleno_min_g = 10, peso_relleno_max_g = 11
  where linea = 'cq-l1-tequenos' and lower(trim(nombre)) = 'tequeño boquita';
update public.productos set peso_relleno_min_g = 27, peso_relleno_max_g = 29
  where linea = 'cq-l1-tequenos' and lower(trim(nombre)) = 'tequeño premium';
update public.productos set peso_relleno_min_g = 44, peso_relleno_max_g = 47
  where linea = 'cq-l1-tequenos' and lower(trim(nombre)) = 'tequeñón';
-- Tequeños de salmón con queso crema
update public.productos set peso_relleno_min_g = 13, peso_relleno_max_g = 14
  where linea = 'cq-l1-tequenos' and codigo in ('PT035', 'PT036', 'PT039');

-- Las boquitas no pasan por congelación en la línea: el formato L1 oculta esa etapa.
update public.productos set lleva_congelacion = false
  where linea = 'cq-l1-tequenos' and lower(trim(nombre)) = 'tequeño boquita';

-- Para revisar después de aplicar:
--   select codigo, nombre, peso_relleno_min_g, peso_relleno_max_g, lleva_congelacion
--   from public.productos where linea = 'cq-l1-tequenos' order by nombre;

-- ───────────── Campos del día siguiente ─────────────
-- Qué claves de registros.datos puede llenar completar_registro, por formato. Incluye los calculados de esas etapas
-- (diferencia de peso, peso declarado): cambian al completar.
create table public.campos_diferidos (
  formato text not null,
  campo text not null,
  primary key (formato, campo)
);

alter table public.campos_diferidos enable row level security;
create policy campos_diferidos_leer on public.campos_diferidos for select to authenticated using (true);

-- Debe coincidir con las etapas `diferida` y los campos `diferido` de src/formatos: lo verifica src/datos/migracion.test.ts.
insert into public.campos_diferidos (formato, campo) values
  -- L1 Tequeños: última bandeja de congelación y empaque
  ('cq-l1-tequenos', 'tUltimaBandeja'),
  ('cq-l1-tequenos', 'horaUltimaBandeja'),
  ('cq-l1-tequenos', 'tiempoEntreBandejas'),
  ('cq-l1-tequenos', 'presentacion'),
  ('cq-l1-tequenos', 'vencimiento'),
  ('cq-l1-tequenos', 'tFinal'),
  ('cq-l1-tequenos', 'pesoEmpaque'),
  ('cq-l1-tequenos', 'pesoDeclarado'),
  ('cq-l1-tequenos', 'diferenciaPeso'),
  ('cq-l1-tequenos', 'metales'),
  ('cq-l1-tequenos', 'tSellado'),
  ('cq-l1-tequenos', 'sellado'),
  ('cq-l1-tequenos', 'impresionLote'),
  -- L2 Empanadas de trigo: congelación y empaque
  ('cq-l2-empanadas-trigo', 'tRelleno'),
  ('cq-l2-empanadas-trigo', 'tInternaCong'),
  ('cq-l2-empanadas-trigo', 'aparienciaCong'),
  ('cq-l2-empanadas-trigo', 'presentacion'),
  ('cq-l2-empanadas-trigo', 'vencimiento'),
  ('cq-l2-empanadas-trigo', 'tFinalEmpaque'),
  ('cq-l2-empanadas-trigo', 'pesoEmpaque'),
  ('cq-l2-empanadas-trigo', 'pesoDeclarado'),
  ('cq-l2-empanadas-trigo', 'diferenciaPeso'),
  ('cq-l2-empanadas-trigo', 'metales'),
  ('cq-l2-empanadas-trigo', 'sellado'),
  ('cq-l2-empanadas-trigo', 'impresionLote'),
  -- L3 Empanadas de maíz: congelación y empaque
  ('cq-l3-empanadas-maiz', 'tRelleno'),
  ('cq-l3-empanadas-maiz', 'tInternaCong'),
  ('cq-l3-empanadas-maiz', 'aparienciaCong'),
  ('cq-l3-empanadas-maiz', 'presentacion'),
  ('cq-l3-empanadas-maiz', 'vencimiento'),
  ('cq-l3-empanadas-maiz', 'tFinalEmpaque'),
  ('cq-l3-empanadas-maiz', 'pesoEmpaque'),
  ('cq-l3-empanadas-maiz', 'pesoDeclarado'),
  ('cq-l3-empanadas-maiz', 'diferenciaPeso'),
  ('cq-l3-empanadas-maiz', 'aparienciaEmpaque'),
  ('cq-l3-empanadas-maiz', 'metales'),
  ('cq-l3-empanadas-maiz', 'sellado'),
  ('cq-l3-empanadas-maiz', 'impresionLote'),
  -- L4 Almond Bites: empaque
  ('cq-l4-almond', 'presentacion'),
  ('cq-l4-almond', 'vencimiento'),
  ('cq-l4-almond', 'pesoEmpaque'),
  ('cq-l4-almond', 'pesoDeclarado'),
  ('cq-l4-almond', 'diferenciaPeso'),
  ('cq-l4-almond', 'tFinal'),
  ('cq-l4-almond', 'sellado'),
  ('cq-l4-almond', 'impresionLote'),
  ('cq-l4-almond', 'metales'),
  -- L5 Yuca Bites y carimañola: última bandeja de congelación y empaque
  ('cq-l5-yuca', 'tUltimaBandeja'),
  ('cq-l5-yuca', 'horaUltimaBandeja'),
  ('cq-l5-yuca', 'tiempoEntreBandejas'),
  ('cq-l5-yuca', 'presentacion'),
  ('cq-l5-yuca', 'vencimiento'),
  ('cq-l5-yuca', 'tFinal'),
  ('cq-l5-yuca', 'pesoEmpaque'),
  ('cq-l5-yuca', 'pesoDeclarado'),
  ('cq-l5-yuca', 'diferenciaPeso'),
  ('cq-l5-yuca', 'metales'),
  ('cq-l5-yuca', 'sellado'),
  ('cq-l5-yuca', 'impresionLote')
on conflict do nothing;

-- ───────────── Completar los datos del día siguiente ─────────────
-- Vía aparte de la edición normal (que exige el mismo día y el día abierto). En este orden:
--   1. el registro existe;
--   2. quien llama es su creador o un administrador;
--   3. la fecha del registro es de hace 2 días o menos (hora de Panamá);
--   4. toda clave de datos que cambie (nueva, quitada o con otro valor) está en campos_diferidos para ese formato
--      y estaba vacía (null o ausente);
--   5. las desviaciones ya registradas se conservan y la acción correctiva solo se amplía (no se reescribe).
-- No exige que el día esté abierto ni toca la clave única. El trigger de historial registra el cambio con auth.uid().
create or replace function public.completar_registro(
  p_id uuid,
  p_datos jsonb,
  p_desviaciones jsonb,
  p_pcc boolean,
  p_accion_correctiva text default null
)
returns public.registros
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.registros;
  no_diferidos text;
  ya_medidos text;
  n_cambios integer;
begin
  select * into r from public.registros where id = p_id for update;
  if not found then
    raise exception 'El registro no existe o fue eliminado.';
  end if;

  if auth.uid() is null or (r.creado_por is distinct from auth.uid() and not public.es_admin()) then
    raise exception 'Solo quien creó el registro o un administrador puede completar sus datos del día siguiente.';
  end if;

  if r.fecha < (now() at time zone 'America/Panama')::date - 2 then
    raise exception 'Pasaron más de 2 días desde el registro del %: los datos del día siguiente ya no se pueden completar. Pide la corrección a un administrador.',
      to_char(r.fecha, 'DD/MM/YYYY');
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos enviados no son válidos.';
  end if;
  if p_desviaciones is null or jsonb_typeof(p_desviaciones) <> 'array' then
    raise exception 'Las desviaciones enviadas no son válidas.';
  end if;

  -- Claves que cambian entre lo guardado y lo enviado
  with cambios as (
    select coalesce(v.key, n.key) as clave, v.value as antes
    from jsonb_each(r.datos) v
    full join jsonb_each(p_datos) n on n.key = v.key
    where v.value is distinct from n.value
  )
  select
    string_agg(c.clave, ', ' order by c.clave) filter (where d.campo is null),
    string_agg(c.clave, ', ' order by c.clave) filter (where c.antes is not null and c.antes <> 'null'::jsonb),
    count(*)
  into no_diferidos, ya_medidos, n_cambios
  from cambios c
  left join public.campos_diferidos d on d.formato = r.formato and d.campo = c.clave;

  if no_diferidos is not null then
    raise exception 'Por esta vía solo se completan los datos del día siguiente. No se puede cambiar: %.', no_diferidos;
  end if;
  if ya_medidos is not null then
    raise exception 'Estos datos ya estaban registrados y no se cambian por esta vía: %. Para corregirlos, pide el cambio a un administrador.', ya_medidos;
  end if;
  if n_cambios = 0 then
    raise exception 'No hay datos nuevos para guardar.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(r.desviaciones) as e(desv)
    where not p_desviaciones @> jsonb_build_array(e.desv)
  ) then
    raise exception 'Las desviaciones ya registradas no se pueden quitar por esta vía.';
  end if;

  if nullif(trim(p_accion_correctiva), '') is not null
    and coalesce(r.accion_correctiva, '') <> ''
    and left(p_accion_correctiva, length(r.accion_correctiva)) <> r.accion_correctiva then
    raise exception 'La acción correctiva ya registrada no se puede cambiar por esta vía, solo ampliar.';
  end if;

  update public.registros
  set datos = p_datos,
      desviaciones = p_desviaciones,
      tiene_desviacion_pcc = r.tiene_desviacion_pcc
        or coalesce(p_pcc, false)
        or exists (select 1 from jsonb_array_elements(p_desviaciones) as e(desv) where e.desv ->> 'severidad' = 'pcc'),
      accion_correctiva = coalesce(nullif(trim(p_accion_correctiva), ''), r.accion_correctiva)
  where id = p_id
  returning * into r;

  return r;
end;
$$;

revoke all on function public.completar_registro(uuid, jsonb, jsonb, boolean, text) from public, anon;
grant execute on function public.completar_registro(uuid, jsonb, jsonb, boolean, text) to authenticated;

notify pgrst, 'reload schema';
