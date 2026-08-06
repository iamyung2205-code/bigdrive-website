-- Big Drive: Supabase schema (v2 — single key-value table)
-- Run this in Supabase → SQL Editor.
-- If you already ran an earlier version of this file, it's safe to run again —
-- this one only touches kv_store and won't error on the old config/bookings tables.

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Keep updated_at fresh on every write
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kv_store_updated_at on kv_store;
create trigger kv_store_updated_at
  before update on kv_store
  for each row execute function set_updated_at();

-- Row Level Security: open read/write for now (no student login system yet).
-- This matches the current MVP's trust model — anyone with the site can create/read
-- bookings, same as the earlier localStorage version. Revisit once you add admin
-- authentication so only you can edit statuses and trip details.
alter table kv_store enable row level security;

drop policy if exists "public read kv" on kv_store;
drop policy if exists "public write kv" on kv_store;
drop policy if exists "public update kv" on kv_store;

create policy "public read kv" on kv_store for select using (true);
create policy "public write kv" on kv_store for insert with check (true);
create policy "public update kv" on kv_store for update using (true);
