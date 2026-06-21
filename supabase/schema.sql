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

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.led_library
  add column if not exists preset_name text default 'custom',
  add column if not exists preview_color text default '#55D6C2',
  add column if not exists preset_speed integer default 90,
  add column if not exists loop integer default 1,
  add column if not exists suffix text default '',
  add column if not exists origin_x integer default 1,
  add column if not exists origin_y integer default 1,
  add column if not exists preview_rate_percent integer default 100,
  add column if not exists events jsonb default '[]'::jsonb,
  add column if not exists author_name text,
  add column if not exists rating_avg numeric(4,2) default 0,
  add column if not exists download_count integer default 0,
  add column if not exists is_public boolean default true,
  add column if not exists created_at timestamptz default now();

update public.led_library
set
  preset_name = coalesce(preset_name, 'custom'),
  preview_color = coalesce(preview_color, '#55D6C2'),
  preset_speed = coalesce(preset_speed, 90),
  loop = coalesce(loop, 1),
  suffix = coalesce(suffix, ''),
  origin_x = coalesce(origin_x, 1),
  origin_y = coalesce(origin_y, 1),
  preview_rate_percent = coalesce(preview_rate_percent, 100),
  events = coalesce(events, '[]'::jsonb),
  rating_avg = coalesce(rating_avg, 0),
  download_count = coalesce(download_count, 0),
  is_public = coalesce(is_public, true),
  created_at = coalesce(created_at, now());

alter table public.led_library
  alter column preset_name set default 'custom',
  alter column preset_name set not null,
  alter column preview_color set default '#55D6C2',
  alter column preview_color set not null,
  alter column preset_speed set default 90,
  alter column preset_speed set not null,
  alter column loop set default 1,
  alter column loop set not null,
  alter column suffix set default '',
  alter column suffix set not null,
  alter column origin_x set default 1,
  alter column origin_x set not null,
  alter column origin_y set default 1,
  alter column origin_y set not null,
  alter column preview_rate_percent set default 100,
  alter column preview_rate_percent set not null,
  alter column events set default '[]'::jsonb,
  alter column events set not null,
  alter column rating_avg set default 0,
  alter column rating_avg set not null,
  alter column download_count set default 0,
  alter column download_count set not null,
  alter column is_public set default true,
  alter column is_public set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.projects
  add column if not exists project_data jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.projects
set
  project_data = coalesce(project_data, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.projects
  alter column project_data set default '{}'::jsonb,
  alter column project_data set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists led_library_public_created_at_idx
  on public.led_library (is_public, created_at desc);

create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);

drop function if exists public.current_authenticated_display_name();
create function public.current_authenticated_display_name()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    nullif((select raw_user_meta_data ->> 'name' from auth.users where id = auth.uid()), ''),
    nullif((select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()), ''),
    nullif((select email from auth.users where id = auth.uid()), ''),
    'Usuario'
  );
$$;

drop function if exists public.fill_led_library_author_fields();
create function public.fill_led_library_author_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado para publicar animacoes.';
  end if;

  new.author_id := auth.uid();
  new.author_name := public.current_authenticated_display_name();
  return new;
end;
$$;

drop function if exists public.can_access_project_audio(text);
create function public.can_access_project_audio(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage, auth
as $$
  select
    auth.uid() is not null
    and coalesce(array_length(storage.foldername(object_name), 1), 0) >= 2
    and auth.uid()::text = (storage.foldername(object_name))[1]
    and exists (
      select 1
      from public.projects as project
      where project.id::text = (storage.foldername(object_name))[2]
        and project.owner_id = auth.uid()
    );
$$;

drop trigger if exists fill_led_library_author_fields on public.led_library;
create trigger fill_led_library_author_fields
before insert or update on public.led_library
for each row
execute function public.fill_led_library_author_fields();

alter table public.led_library
  drop constraint if exists led_library_name_length_check,
  drop constraint if exists led_library_preview_color_format_check,
  drop constraint if exists led_library_preset_speed_range_check,
  drop constraint if exists led_library_loop_range_check,
  drop constraint if exists led_library_origin_x_range_check,
  drop constraint if exists led_library_origin_y_range_check,
  drop constraint if exists led_library_preview_rate_range_check,
  drop constraint if exists led_library_events_shape_check,
  drop constraint if exists led_library_rating_avg_range_check,
  drop constraint if exists led_library_download_count_range_check;

alter table public.led_library
  add constraint led_library_name_length_check
    check (char_length(name) between 1 and 120),
  add constraint led_library_preview_color_format_check
    check (preview_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint led_library_preset_speed_range_check
    check (preset_speed between 10 and 1000),
  add constraint led_library_loop_range_check
    check (loop between 1 and 99),
  add constraint led_library_origin_x_range_check
    check (origin_x between 1 and 64),
  add constraint led_library_origin_y_range_check
    check (origin_y between 1 and 64),
  add constraint led_library_preview_rate_range_check
    check (preview_rate_percent between 10 and 500),
  add constraint led_library_events_shape_check
    check (
      jsonb_typeof(events) = 'array'
      and jsonb_array_length(events) <= 4096
      and pg_column_size(events) <= 262144
    ),
  add constraint led_library_rating_avg_range_check
    check (rating_avg between 0 and 5),
  add constraint led_library_download_count_range_check
    check (download_count >= 0);

alter table public.projects
  drop constraint if exists projects_name_length_check,
  drop constraint if exists projects_project_data_shape_check;

alter table public.projects
  add constraint projects_name_length_check
    check (char_length(name) between 1 and 120),
  add constraint projects_project_data_shape_check
    check (
      jsonb_typeof(project_data) = 'object'
      and pg_column_size(project_data) <= 1048576
    );

alter table public.led_library enable row level security;
alter table public.projects enable row level security;

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

drop policy if exists "users can update own animations" on public.led_library;
create policy "users can update own animations"
on public.led_library
for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "users can delete own animations" on public.led_library;
create policy "users can delete own animations"
on public.led_library
for delete
to authenticated
using (auth.uid() = author_id);

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
  and public.can_access_project_audio(name)
);

drop policy if exists "users can upload own project audio" on storage.objects;
create policy "users can upload own project audio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-audio'
  and public.can_access_project_audio(name)
);

drop policy if exists "users can update own project audio" on storage.objects;
create policy "users can update own project audio"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-audio'
  and public.can_access_project_audio(name)
)
with check (
  bucket_id = 'project-audio'
  and public.can_access_project_audio(name)
);

drop policy if exists "users can delete own project audio" on storage.objects;
create policy "users can delete own project audio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-audio'
  and public.can_access_project_audio(name)
);
