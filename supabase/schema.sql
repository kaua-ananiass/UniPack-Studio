create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('project-audio', 'project-audio', false)
on conflict (id) do nothing;

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
  rating_avg numeric(4,2) not null default 0,
  download_count integer not null default 0,
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

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "users can read own projects" on public.projects;
create policy "users can read own projects"
on public.projects
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "users can create own projects" on public.projects;
create policy "users can create own projects"
on public.projects
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "users can update own projects" on public.projects;
create policy "users can update own projects"
on public.projects
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "users can delete own projects" on public.projects;
create policy "users can delete own projects"
on public.projects
for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "users can read own project audio" on storage.objects;
create policy "users can read own project audio"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users can upload own project audio" on storage.objects;
create policy "users can upload own project audio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users can update own project audio" on storage.objects;
create policy "users can update own project audio"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'project-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "users can delete own project audio" on storage.objects;
create policy "users can delete own project audio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);
