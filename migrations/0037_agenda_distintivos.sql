alter table agenda drop constraint if exists agenda_tipo_check;
alter table agenda add constraint agenda_tipo_check check (tipo in ('visita', 'llamada', 'escribir', 'otro', 'distintivos'));

alter table agenda add column if not exists placa text not null default '';
alter table agenda add column if not exists conductor text not null default '';
alter table agenda add column if not exists cedula text not null default '';
alter table agenda add column if not exists promotor text not null default '';
alter table agenda add column if not exists estado text not null default '';
