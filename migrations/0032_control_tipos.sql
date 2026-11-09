alter table control_marcas drop constraint if exists control_marcas_tipo_check;
alter table control_marcas add constraint control_marcas_tipo_check
  check (tipo in ('ingreso', 'salida', 'break', 'almuerzo', 'visita', 'otro', 'actividad'));

alter table control_marcas add column if not exists tipo_id integer;
alter table control_marcas add column if not exists contacto text not null default '';
alter table control_marcas add column if not exists telefono text not null default '';
alter table control_marcas add column if not exists placa_libre text not null default '';
alter table control_marcas add column if not exists sin_proceso integer not null default 0;

create table if not exists control_tipos (
  id serial primary key,
  ciudad_id integer not null default 1,
  nombre text not null,
  pide_contacto integer not null default 0,
  pide_proceso integer not null default 0,
  una_vez integer not null default 0,
  minutos integer not null default 0,
  predeterminada integer not null default 0,
  todos integer not null default 1,
  activo integer not null default 1
);

create table if not exists control_tipo_gente (
  tipo_id integer not null references control_tipos (id) on delete cascade,
  slug text not null,
  primary key (tipo_id, slug)
);
