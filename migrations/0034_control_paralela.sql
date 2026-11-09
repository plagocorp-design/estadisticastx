alter table control_tipos add column if not exists paralela integer not null default 0;

update control_tipos
set paralela = 1
where activo = 1
  and predeterminada = 0
  and pide_contacto = 1
  and (
    lower(nombre) like '%whatsapp%'
    or lower(nombre) like '%wasap%'
    or lower(nombre) like '%wpp%'
  );

create table if not exists control_atenciones (
  id serial primary key,
  marca_id integer not null references control_marcas (id) on delete cascade,
  contacto text not null default '',
  telefono text not null default '',
  placa_libre text not null default '',
  nota text not null default '',
  hora text not null default ''
);

create index if not exists control_atenciones_marca_idx on control_atenciones (marca_id);
