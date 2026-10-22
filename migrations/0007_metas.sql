create table if not exists metas_mes (
  mes text not null,
  owner_id text not null references "user" (id) on delete cascade,
  meta integer not null,
  primary key (mes, owner_id)
);
