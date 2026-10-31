create table if not exists claves_equipo (
  user_id text primary key references "user" (id) on delete cascade,
  clave text not null,
  updated_at timestamptz not null default now()
);
