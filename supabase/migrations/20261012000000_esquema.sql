-- Calidad Chévere: esquema inicial
-- Zona horaria de negocio: America/Panama

create extension if not exists pgcrypto;

-- ───────────── Perfiles ─────────────
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  correo text not null,
  nombre text not null,
  rol text not null default 'capturista' check (rol in ('admin', 'capturista')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, correo, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- ───────────── Catálogos ─────────────
create table public.operarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  area text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null,
  linea text not null,
  presentacion text not null default '',
  peso_unidad_g numeric,
  peso_unidad_min_g numeric,
  peso_unidad_max_g numeric,
  peso_relleno_g numeric,
  peso_declarado_kg numeric,
  vida_util_meses integer,
  lleva_relleno boolean not null default true,
  es_precocido boolean not null default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ───────────── Registros ─────────────
create table public.registros (
  id uuid primary key default gen_random_uuid(),
  formato text not null,
  version_formato integer not null default 1,
  fecha date not null,
  hora text,
  area text,
  producto_id uuid references public.productos (id),
  lote text,
  datos jsonb not null default '{}'::jsonb,
  desviaciones jsonb not null default '[]'::jsonb,
  tiene_desviacion_pcc boolean not null default false,
  accion_correctiva text,
  observaciones text,
  fotos text[] not null default '{}',
  origen text not null default 'app' check (origen in ('app', 'importado')),
  realizado_por text not null default '',
  -- impide repetir: un registro por día, por día y área, o por lote (según el formato)
  clave_unica text,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id),
  actualizado_en timestamptz
);

create index registros_fecha_idx on public.registros (fecha desc);
create index registros_formato_fecha_idx on public.registros (formato, fecha desc);
create unique index registros_clave_unica_idx on public.registros (clave_unica) where clave_unica is not null;

-- ───────────── Cierre del día ─────────────
-- Un día cerrado ya no admite registros nuevos ni ediciones, salvo que un administrador lo reabra.
create table public.cierres_dia (
  fecha date primary key,
  cerrado_por uuid references public.perfiles (id),
  cerrado_por_nombre text not null default '',
  cerrado_en timestamptz not null default now(),
  resumen jsonb not null default '{}'::jsonb
);

create or replace function public.dia_cerrado(f date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.cierres_dia where fecha = f);
$$;

create or replace function public.antes_de_guardar_registro()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.actualizado_por := auth.uid();
    new.actualizado_en := now();
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  return new;
end;
$$;

create trigger registros_antes_de_guardar
  before update on public.registros
  for each row execute function public.antes_de_guardar_registro();

-- ───────────── Historial (integridad de registros SQF) ─────────────
create table public.registros_historial (
  id bigint generated always as identity primary key,
  registro_id uuid not null,
  accion text not null check (accion in ('UPDATE', 'DELETE')),
  antes jsonb not null,
  despues jsonb,
  usuario_id uuid,
  usuario_nombre text,
  en timestamptz not null default now()
);

create index registros_historial_registro_idx on public.registros_historial (registro_id, en desc);

create or replace function public.registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.registros_historial (registro_id, accion, antes, despues, usuario_id, usuario_nombre)
  values (
    old.id,
    tg_op,
    to_jsonb(old),
    case when tg_op = 'UPDATE' then to_jsonb(new) end,
    auth.uid(),
    (select nombre from public.perfiles where id = auth.uid())
  );
  return coalesce(new, old);
end;
$$;

create trigger registros_historial_trg
  after update or delete on public.registros
  for each row execute function public.registrar_historial();

-- ───────────── RLS ─────────────
alter table public.perfiles enable row level security;
alter table public.operarios enable row level security;
alter table public.productos enable row level security;
alter table public.registros enable row level security;
alter table public.registros_historial enable row level security;
alter table public.cierres_dia enable row level security;

create policy perfiles_leer on public.perfiles for select to authenticated using (true);
create policy perfiles_admin on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy operarios_leer on public.operarios for select to authenticated using (true);
create policy operarios_admin_ins on public.operarios for insert to authenticated with check (public.es_admin());
create policy operarios_admin_upd on public.operarios for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy productos_leer on public.productos for select to authenticated using (true);
create policy productos_admin_ins on public.productos for insert to authenticated with check (public.es_admin());
create policy productos_admin_upd on public.productos for update to authenticated using (public.es_admin()) with check (public.es_admin());

create policy registros_leer on public.registros for select to authenticated using (true);
create policy registros_crear on public.registros for insert to authenticated
  with check (creado_por = auth.uid() and origen = 'app' and (not public.dia_cerrado(fecha) or public.es_admin()));
create policy registros_editar on public.registros for update to authenticated
  using (
    public.es_admin()
    or (
      creado_por = auth.uid()
      and (creado_en at time zone 'America/Panama')::date = (now() at time zone 'America/Panama')::date
      and not public.dia_cerrado(fecha)
    )
  )
  with check (
    public.es_admin()
    or (
      creado_por = auth.uid()
      and (creado_en at time zone 'America/Panama')::date = (now() at time zone 'America/Panama')::date
      and not public.dia_cerrado(fecha)
    )
  );
create policy registros_borrar on public.registros for delete to authenticated using (public.es_admin());

create policy historial_leer on public.registros_historial for select to authenticated using (true);

create policy cierres_leer on public.cierres_dia for select to authenticated using (true);
create policy cierres_cerrar on public.cierres_dia for insert to authenticated with check (cerrado_por = auth.uid());
create policy cierres_reabrir on public.cierres_dia for delete to authenticated using (public.es_admin());

-- ───────────── Fotos ─────────────
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create policy fotos_leer on storage.objects for select to authenticated using (bucket_id = 'fotos');
create policy fotos_subir on storage.objects for insert to authenticated with check (bucket_id = 'fotos');
