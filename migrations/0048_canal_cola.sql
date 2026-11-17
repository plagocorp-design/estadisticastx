alter table call_gestiones add column if not exists canal text not null default 'llamada';
alter table call_contactos add column if not exists cola integer not null default 0;
create index if not exists call_contactos_placa_sola_idx on call_contactos (ciudad_id, placa);
create index if not exists call_gestiones_canal_idx on call_gestiones (ciudad_id, canal, fecha);
