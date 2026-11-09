insert into control_tipos (ciudad_id, nombre, predeterminada, pide_contacto, pide_proceso, todos)
select c.id, 'Llamando', 1, 0, 0, 1
from ciudades c
where not exists (
  select 1 from control_tipos t where t.ciudad_id = c.id and t.activo = 1 and t.predeterminada = 1
)
and not exists (
  select 1 from control_tipos t where t.ciudad_id = c.id and t.nombre = 'Llamando'
);

insert into control_tipos (ciudad_id, nombre, predeterminada, pide_contacto, pide_proceso, todos)
select c.id, 'Atención por WhatsApp', 0, 1, 0, 1
from ciudades c
where not exists (
  select 1 from control_tipos t where t.ciudad_id = c.id and t.nombre = 'Atención por WhatsApp'
);

insert into control_tipos (ciudad_id, nombre, predeterminada, pide_contacto, pide_proceso, todos)
select c.id, 'Pegar distintivos', 0, 0, 1, 1
from ciudades c
where not exists (
  select 1 from control_tipos t where t.ciudad_id = c.id and t.nombre = 'Pegar distintivos'
);

insert into control_tipos (ciudad_id, nombre, predeterminada, pide_contacto, pide_proceso, todos)
select c.id, 'Compra de pólizas', 0, 0, 1, 1
from ciudades c
where not exists (
  select 1 from control_tipos t where t.ciudad_id = c.id and t.nombre = 'Compra de pólizas'
);
