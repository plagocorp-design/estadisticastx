create table if not exists sobres (
  id bigserial primary key,
  caso_id integer not null references casos (id) on delete cascade,
  datos text not null default '{}',
  creado_por text not null default '',
  creado_at timestamptz not null default now()
);

create table if not exists firmantes (
  id bigserial primary key,
  sobre_id bigint not null references sobres (id) on delete cascade,
  token text not null unique,
  orden integer not null,
  nombre text not null,
  cc text not null default '',
  correo text not null,
  firma text not null default '',
  firmado_at timestamptz
);

create index if not exists firmantes_sobre_idx on firmantes (sobre_id);
