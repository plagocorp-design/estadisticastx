alter table call_contactos add column if not exists turno_slug text not null default '';
create index if not exists call_contactos_turno_idx on call_contactos (ciudad_id, turno_slug);
