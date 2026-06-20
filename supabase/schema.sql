create extension if not exists pgcrypto;

create table if not exists public.led_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preset_name text not null default 'custom',
  preview_color text not null default '#55D6C2',
  preset_speed integer not null default 90,
  loop integer not null default 1,
  suffix text not null default '',
  origin_x integer not null default 1,
  origin_y integer not null default 1,
  preview_rate_percent integer not null default 100,
  events jsonb not null default '[]'::jsonb,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists led_library_public_created_at_idx
  on public.led_library (is_public, created_at desc);

alter table public.led_library enable row level security;

drop policy if exists "public can read public animations" on public.led_library;
create policy "public can read public animations"
on public.led_library
for select
using (is_public = true);

drop policy if exists "authenticated users can insert own animations" on public.led_library;
create policy "authenticated users can insert own animations"
on public.led_library
for insert
to authenticated
with check (auth.uid() = author_id);

drop policy if exists "users can delete own animations" on public.led_library;
create policy "users can delete own animations"
on public.led_library
for delete
to authenticated
using (auth.uid() = author_id);
