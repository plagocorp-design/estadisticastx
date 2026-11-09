create index if not exists call_contactos_placa_idx on call_contactos (ciudad_id, empresa, placa);
create index if not exists call_gestiones_ciudad_idx on call_gestiones (ciudad_id, contacto_id, id desc);
