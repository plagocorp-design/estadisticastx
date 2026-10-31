alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('asesor', 'lider', 'coordinadora', 'via_seguros', 'operativa', 'servicio'));

create table if not exists piloto (
  id integer primary key default 1,
  activo boolean not null default false,
  docs_operativa text not null default 'unificado,cedula,tarjeta_propiedad,tarjeta_operacion,soat,tecnomecanica,formulario,contrato,carta,poliza'
);

insert into piloto (id) values (1) on conflict (id) do nothing;

alter table casos add column if not exists mano text not null default '';
alter table casos add column if not exists via_estado text not null default '';
alter table casos add column if not exists via_enlace text not null default '';
alter table casos add column if not exists via_nota text not null default '';
alter table casos add column if not exists via_pide_carta boolean not null default false;
alter table casos add column if not exists via_pide_contrato boolean not null default false;
alter table casos add column if not exists op_polizas boolean not null default false;
alter table casos add column if not exists op_impreso boolean not null default false;
alter table casos add column if not exists op_pedido text not null default '';
alter table casos add column if not exists op_tarjeta text not null default '';
alter table casos add column if not exists docs_ocultos text not null default '';
alter table casos add column if not exists servicio_nota text not null default '';
alter table casos add column if not exists bonos text not null default '';
alter table casos add column if not exists beneficios text not null default '';

create table if not exists documentos (
  id serial primary key,
  caso_id integer not null references casos (id) on delete cascade,
  tipo text not null,
  nombre text not null,
  archivo text not null,
  subido_por text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists documentos_caso_idx on documentos (caso_id, id);
