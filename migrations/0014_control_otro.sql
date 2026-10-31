alter table control_marcas drop constraint if exists control_marcas_tipo_check;
alter table control_marcas add constraint control_marcas_tipo_check check (tipo in ('ingreso', 'salida', 'break', 'almuerzo', 'visita', 'otro'));
