create table if not exists bitacoras (
  owner_id text not null references "user" ("id") on delete cascade,
  fecha text not null,
  modo text not null default '',
  zonas text not null default '',
  llamadas integer not null default 0,
  visitas integer not null default 0,
  dijo_si integer not null default 0,
  que_hizo text not null default '',
  detalle_call text not null default '',
  detalle_calle text not null default '',
  trabas text not null default '',
  manana text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner_id, fecha)
);
