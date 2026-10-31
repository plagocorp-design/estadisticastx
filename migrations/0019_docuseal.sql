alter table casos add column if not exists docuseal_id text not null default '';
alter table casos add column if not exists docuseal_estado text not null default '';
alter table casos add column if not exists auditoria_pdf text not null default '';
alter table casos add column if not exists auditoria_nombre text not null default '';
