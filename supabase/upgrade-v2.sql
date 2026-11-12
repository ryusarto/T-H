-- H&T Vault v2 · Execute AFTER supabase/setup.sql in a dedicated Supabase project.
-- Private bucket "vault" remains the storage source. The public GitHub repo holds code only.

alter table public.assets
  add column if not exists artist_id uuid,
  add column if not exists project_id uuid,
  add column if not exists character_id uuid,
  add column if not exists character text not null default '',
  add column if not exists chapter text not null default '',
  add column if not exists scene text not null default '',
  add column if not exists animation_name text not null default '',
  add column if not exists direction text not null default '',
  add column if not exists status text not null default 'draft',
  add column if not exists owner_name text not null default '',
  add column if not exists credits text not null default '',
  add column if not exists compatibility text[] not null default '{}',
  add column if not exists reference_urls text[] not null default '{}',
  add column if not exists github_path text not null default '',
  add column if not exists frame_count integer not null default 1,
  add column if not exists fps integer not null default 12;

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id),
  name text not null check(length(name) between 1 and 150),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(artist_id, name)
);
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  name text not null check(length(name) between 1 and 150),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id, name)
);
create table if not exists public.animation_clips (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  name text not null,
  direction text not null default 'all',
  frames integer not null default 1 check(frames between 1 and 10000),
  fps integer not null default 12 check(fps between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.asset_files (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  role text not null default 'source' check(role in ('source','spritesheet','reference','metadata','other')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check(file_size >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 1 and 160),
  description text not null default '',
  project text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.collection_assets (
  collection_id uuid not null references public.collections(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(collection_id, asset_id)
);
create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 1 and 160),
  project text not null default '',
  engine text not null default 'HTML / JavaScript',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.pack_assets (
  pack_id uuid not null references public.packs(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  position integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(pack_id, asset_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='ht_assets_artist_fk') then
    alter table public.assets add constraint ht_assets_artist_fk foreign key(artist_id) references public.artists(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='ht_assets_project_fk') then
    alter table public.assets add constraint ht_assets_project_fk foreign key(project_id) references public.projects(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='ht_assets_character_fk') then
    alter table public.assets add constraint ht_assets_character_fk foreign key(character_id) references public.characters(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='ht_assets_status_chk') then
    alter table public.assets add constraint ht_assets_status_chk check(status in ('draft','review','approved','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname='ht_assets_frames_chk') then
    alter table public.assets add constraint ht_assets_frames_chk check(frame_count between 1 and 10000 and fps between 1 and 120);
  end if;
end $$;

create index if not exists ht_assets_facet_idx on public.assets(artist, project, character, status);
create index if not exists ht_assets_character_idx on public.assets(character_id);
create index if not exists ht_assets_chapter_idx on public.assets(chapter);
create index if not exists ht_assets_animation_idx on public.assets(animation_name);
create index if not exists ht_packs_recent_idx on public.packs(created_at desc);

-- Grant API access separately from row access. No anonymous access.
grant select on public.artists, public.projects, public.characters,
  public.animation_clips, public.asset_files, public.collections,
  public.collection_assets, public.packs, public.pack_assets to authenticated;
grant insert on public.artists, public.projects, public.characters,
  public.animation_clips, public.asset_files, public.collections,
  public.collection_assets, public.packs, public.pack_assets to authenticated;
grant select, insert on public.assets to authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array['artists','projects','characters','animation_clips',
    'asset_files','collections','collection_assets','packs','pack_assets'] loop
    execute format('alter table public.%I enable row level security', tbl);
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname='h&t member read') then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_vault_member())', 'h&t member read', tbl);
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname='h&t editor insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (public.can_vault_edit() and created_by = (select auth.uid()))', 'h&t editor insert', tbl);
    end if;
  end loop;
end $$;

-- Prevent deleting attached secondary files by claiming they are orphaned.
drop policy if exists "vault editors can remove own uploads" on storage.objects;
create policy "vault editors can remove own uploads" on storage.objects for delete to authenticated
using (
  bucket_id='vault'
  and public.can_vault_edit()
  and owner_id=(select auth.uid())::text
  and not exists(select 1 from public.assets where storage_path=name)
  and not exists(select 1 from public.asset_files where storage_path=name)
);

-- All shareable H&T pack URLs point to metadata requiring membership.
-- They do NOT expose permanent or public Storage links.
