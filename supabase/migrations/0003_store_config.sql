-- Store info (products, prices, hours, contact details, address, etc.) that
-- gets injected into every LLM call. Lives here instead of in source code so
-- real business contact info never has to be committed to a public repo —
-- only this schema is; the actual row is inserted directly against the
-- database. Single-row config table, service_role only (RLS, no policies).
create table public.store_config (
  id text primary key default 'default',
  content text not null,
  updated_at timestamptz not null default now()
);

alter table public.store_config enable row level security;
