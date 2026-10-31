alter table casos add column if not exists motivo_cierre text not null default '';
alter table casos add column if not exists fecha_cierre text not null default '';
