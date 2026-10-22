alter table casos add column if not exists fecha_compra text not null default '';
alter table casos add column if not exists poliza_fase text not null default '';
alter table casos add column if not exists poliza_entrega text not null default '';
