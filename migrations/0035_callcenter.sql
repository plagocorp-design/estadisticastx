create table if not exists call_bases (
  id serial primary key,
  ciudad_id integer not null default 1,
  nombre text not null default '',
  subido_por text not null default '',
  filas integer not null default 0,
  separados integer not null default 0,
  repetidos integer not null default 0,
  empresas integer not null default 0,
  creado timestamptz not null default now()
);

create table if not exists call_contactos (
  id serial primary key,
  base_id integer not null references call_bases (id) on delete cascade,
  ciudad_id integer not null default 1,
  empresa text not null default '',
  nombre text not null default '',
  estado text not null default '',
  telefono text not null default '',
  propietario text not null default '',
  tel_propietario text not null default '',
  vehiculo text not null default '',
  placa text not null default '',
  anio text not null default '',
  cc text not null default '',
  orden integer not null default 0,
  duplicado integer not null default 0,
  caso_id integer
);

create index if not exists call_contactos_ciudad_idx on call_contactos (ciudad_id, empresa, orden, id);
create index if not exists call_contactos_base_idx on call_contactos (base_id);

create table if not exists call_gestiones (
  id serial primary key,
  contacto_id integer not null references call_contactos (id) on delete cascade,
  ciudad_id integer not null default 1,
  asesor_id text not null default '',
  asesor_slug text not null default '',
  asesor_nombre text not null default '',
  fecha text not null default '',
  hora text not null default '',
  segundos integer not null default 0,
  tipo_persona text not null default '',
  nombre_prop text not null default '',
  cc text not null default '',
  tel_prop text not null default '',
  tiene_nuevo integer not null default 0,
  nuevo_nombre text not null default '',
  nuevo_tel text not null default '',
  solo_propietario integer not null default 0,
  clasificacion text not null default '',
  calificacion text not null default '',
  obs_sao text not null default '',
  obs_conductor text not null default '',
  obs_propietario text not null default '',
  intencion text not null default '',
  proxima text not null default '',
  fecha_proxima text not null default '',
  no_aplica_proxima integer not null default 0,
  resultado text not null default '',
  fecha_afiliacion text not null default '',
  no_aplica_afiliacion integer not null default 0,
  motivo text not null default '',
  observacion_final text not null default '',
  caso_id integer,
  agenda_id integer,
  creado timestamptz not null default now()
);

create index if not exists call_gestiones_contacto_idx on call_gestiones (contacto_id, id desc);
create index if not exists call_gestiones_fecha_idx on call_gestiones (ciudad_id, fecha, asesor_slug);

create table if not exists call_empresas (
  ciudad_id integer not null default 1,
  empresa text not null,
  activa integer not null default 0,
  primary key (ciudad_id, empresa)
);

create table if not exists call_asignaciones (
  ciudad_id integer not null default 1,
  empresa text not null,
  slug text not null,
  primary key (ciudad_id, empresa, slug)
);

create table if not exists call_briefing (
  ciudad_id integer not null default 1,
  seccion text not null,
  titulo text not null default '',
  cuerpo text not null default '',
  orden integer not null default 0,
  primary key (ciudad_id, seccion)
);

create table if not exists call_distintivos (
  id serial primary key,
  ciudad_id integer not null default 1,
  fecha text not null,
  hora text not null default '',
  nota text not null default '',
  placa text not null default '',
  cupo integer not null default 1,
  festivo integer not null default 0,
  agenda_id integer
);

create index if not exists call_distintivos_fecha_idx on call_distintivos (ciudad_id, fecha, hora);
