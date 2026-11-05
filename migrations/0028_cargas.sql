create table if not exists carga_trozos (
  carga_id text not null,
  orden integer not null,
  datos text not null,
  caso_id integer not null default 0,
  tipo text not null default '',
  nombre text not null default '',
  lectura text not null default '',
  reemplaza_id integer not null default 0,
  primary key (carga_id, orden)
);
