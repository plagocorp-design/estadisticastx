create table if not exists auditoria (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id text not null default '',
  actor_slug text not null default '',
  actor_name text not null default '',
  accion text not null,
  entidad text not null,
  entidad_id text not null default '',
  etiqueta text not null default '',
  detalle text not null default '',
  antes text not null default '',
  despues text not null default ''
);

create index if not exists auditoria_created_idx on auditoria (created_at desc);
create index if not exists auditoria_entidad_idx on auditoria (entidad, entidad_id, id desc);
