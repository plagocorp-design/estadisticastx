create table if not exists equipo_extra (
  owner_id text primary key references "user" ("id") on delete cascade,
  activo integer not null default 1,
  empieza text not null default '2026-10-07',
  entrada text not null default '08:00',
  salida text not null default '17:00'
);

create table if not exists control_marcas (
  id serial primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'salida', 'break', 'almuerzo', 'visita')),
  fecha text not null,
  hora text not null,
  hora_fin text not null default '',
  caso_id integer references casos (id) on delete set null,
  nota text not null default ''
);

create index if not exists control_marcas_fecha_idx on control_marcas (fecha, owner_id);
