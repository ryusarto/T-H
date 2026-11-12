-- H&T Vault · knowledge intake for Torii & Hutukara / Salvadores Nacionais.
-- The index is metadata-only, original images stay private until imported to Storage.
create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  project text not null,
  artist text not null default '',
  character text not null default '',
  chapter text not null default '',
  scene text not null default '',
  kind text not null default 'other',
  production_state text not null default 'uncut_sprite_sheet',
  original_filename text not null,
  source_sha256 text not null,
  source_file_size bigint not null default 0,
  tags text[] not null default '{}',
  notes text not null default '',
  imported_asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ht_knowledge_project_idx on public.knowledge_entries(project,character);
create index if not exists ht_knowledge_sha_idx on public.knowledge_entries(source_sha256);
alter table public.knowledge_entries enable row level security;
grant select on public.knowledge_entries to authenticated;
drop policy if exists "h&t member knowledge read" on public.knowledge_entries;
create policy "h&t member knowledge read" on public.knowledge_entries
for select to authenticated using (public.is_vault_member());
alter table public.assets
  add column if not exists source_sha256 text,
  add column if not exists source_origin text not null default '';
create index if not exists ht_assets_source_sha_idx on public.assets(source_sha256);
-- No client-side edits to knowledge_entries: the index is only curated by trusted server-side migrations.
