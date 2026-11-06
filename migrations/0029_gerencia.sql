alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('asesor', 'lider', 'coordinadora', 'via_seguros', 'operativa', 'servicio', 'gerencia'));

create table if not exists ciudades (
  id serial primary key,
  slug text not null unique,
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

insert into ciudades (slug, nombre)
values ('bogota', 'Bogotá')
on conflict (slug) do nothing;

alter table profiles add column if not exists ciudad_id integer references ciudades (id);
alter table casos add column if not exists ciudad_id integer references ciudades (id);

update profiles set ciudad_id = (select id from ciudades where slug = 'bogota')
where ciudad_id is null and role <> 'gerencia';

update casos set ciudad_id = (select id from ciudades where slug = 'bogota')
where ciudad_id is null;

create table if not exists ciudad_config (
  ciudad_id integer primary key references ciudades (id) on delete cascade,
  documentos text not null default '',
  pasos text not null default '',
  textos text not null default '',
  flujo text not null default '{"operativaAntesDePago":true}',
  contrato_nombre text not null default '',
  contrato_nota text not null default '',
  contrato_pdf text not null default ''
);
