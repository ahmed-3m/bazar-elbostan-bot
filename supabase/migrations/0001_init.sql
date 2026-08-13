-- Customers = one row per Facebook Messenger user (keyed by their PSID,
-- the page-scoped id Meta sends in every webhook event).
create table public.customers (
  psid text primary key,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  psid text not null references public.customers(psid) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_psid_created_at_idx on public.messages (psid, created_at);
