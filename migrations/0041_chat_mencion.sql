alter table mensajes add column if not exists urgente integer not null default 0;
alter table mensajes add column if not exists privado integer not null default 0;
alter table mensajes add column if not exists para_id text not null default '';
create index if not exists mensajes_para_idx on mensajes (para_id, created_at);
