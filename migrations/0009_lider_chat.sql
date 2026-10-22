alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('asesor', 'lider', 'coordinadora'));

create table if not exists mensajes (
  id serial primary key,
  caso_id integer not null references casos (id) on delete cascade,
  author_id text not null references "user" ("id"),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists mensajes_caso_idx on mensajes (caso_id, created_at);

create table if not exists chat_visto (
  caso_id integer not null references casos (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  visto_at timestamptz not null default now(),
  primary key (caso_id, user_id)
);
