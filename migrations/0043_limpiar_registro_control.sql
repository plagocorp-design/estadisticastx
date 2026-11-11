-- El registro no guarda entradas, salidas, marcas del día ni cambios de acceso.
delete from auditoria
where entidad = 'control'
  and (
    accion = 'marco'
    or detalle ilike 'Quitó la marca %'
    or detalle ilike 'Registró en %'
    or detalle ilike 'Anotó en %'
  );

delete from auditoria
where entidad = 'equipo'
  and detalle ilike 'Cambió el acceso de %';
