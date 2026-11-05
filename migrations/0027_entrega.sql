alter table casos add column if not exists cita_fecha text not null default '';
alter table casos add column if not exists cita_hora text not null default '';
alter table casos add column if not exists entrega text not null default '';
