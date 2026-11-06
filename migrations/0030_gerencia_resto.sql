alter table profiles add column if not exists activo boolean not null default true;
alter table casos add column if not exists pasos_extra text not null default '';
alter table ciudad_config add column if not exists contrato_campos text not null default '';
