alter table profiles add column if not exists ciudad_vista integer references ciudades (id);
