create table if not exists profiles (
  user_id text primary key references "user" ("id") on delete cascade,
  slug text not null unique,
  name text not null,
  role text not null check (role in ('asesor', 'coordinadora'))
);

create table if not exists casos (
  id serial primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  placa text not null,
  cc text not null,
  nombre text not null,
  telefono text not null,
  empresa text not null default '',
  fecha_inicio text not null,
  dijo_si boolean not null default true,
  cedula boolean not null default false,
  tarjeta_propiedad boolean not null default false,
  tarjeta_operacion boolean not null default false,
  soat boolean not null default false,
  tecnomecanica boolean not null default false,
  formulario boolean not null default false,
  documentos boolean not null default false,
  firma_carta boolean not null default false,
  firma_contrato boolean not null default false,
  plata_poliza boolean not null default false,
  via_seguros boolean not null default false,
  polizas_subidas boolean not null default false,
  operativa boolean not null default false,
  estado_tarjeta text not null default '',
  tarjeta_entregada boolean not null default false,
  completado boolean not null default false,
  observacion text not null default '',
  proxima text not null default '',
  fecha_proxima text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists casos_owner_idx on casos (owner_id);
