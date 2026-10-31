alter table casos add column if not exists direccion text not null default '';
alter table casos add column if not exists correo text not null default '';
alter table casos add column if not exists marca text not null default '';
alter table casos add column if not exists linea text not null default '';
alter table casos add column if not exists modelo text not null default '';
alter table casos add column if not exists fecha_firma text not null default '';
alter table casos add column if not exists contrato_nombre text not null default '';
alter table casos add column if not exists contrato_pdf text not null default '';
