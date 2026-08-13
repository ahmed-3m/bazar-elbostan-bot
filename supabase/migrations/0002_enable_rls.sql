-- customers/messages are only ever touched by the edge function via the
-- service_role key (which bypasses RLS), so no policies are needed — this
-- just blocks accidental exposure through the public PostgREST API.
alter table public.customers enable row level security;
alter table public.messages enable row level security;
