-- One row per Meta message mid. Unique insert is the lock that stops
-- Facebook's parallel redelivery from generating two replies (one of which
-- was the GLM fallback).
create table public.processed_messages (
  mid text primary key,
  created_at timestamptz not null default now()
);

alter table public.processed_messages enable row level security;
