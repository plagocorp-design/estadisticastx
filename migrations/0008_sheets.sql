alter table casos add column if not exists updated_at timestamptz not null default now();
alter table agenda add column if not exists updated_at timestamptz not null default now();

create table if not exists sheets_config (
  id integer primary key default 1 check (id = 1),
  webapp_url text not null default '',
  secret text not null default '',
  spreadsheet_url text not null default '',
  callback_url text not null default '',
  last_error text not null default '',
  last_sync timestamptz
);
