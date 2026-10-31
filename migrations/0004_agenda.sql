create table if not exists agenda (
  id serial primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  caso_id integer references casos (id) on delete set null,
  tipo text not null check (tipo in ('visita', 'llamada', 'escribir', 'otro')),
  titulo text not null,
  fecha text not null,
  hora text not null default '',
  nota text not null default '',
  hecho boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists agenda_owner_fecha_idx on agenda (owner_id, fecha);
create index if not exists agenda_fecha_idx on agenda (fecha);
