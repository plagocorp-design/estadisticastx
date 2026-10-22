create table if not exists dias_meta (
  fecha text not null,
  owner_id text not null references "user" ("id") on delete cascade,
  cuenta integer not null,
  primary key (fecha, owner_id)
);
