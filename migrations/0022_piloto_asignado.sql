alter table casos add column if not exists mano_asignado text not null default '';
alter table casos add column if not exists devolucion text not null default '';
