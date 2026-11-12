-- H&T Vault · MVP schema (executar no Supabase SQL Editor)
-- Bucket Storage: crie manualmente bucket privado "vault" no painel.

create extension if not exists pgcrypto;

create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null,
  version integer not null default 1 check (version > 0),
  title text not null check (char_length(title) between 1 and 160),
  kind text not null check (kind in ('character','environment','animation','prop','vfx','ui','audio','3d','other')),
  artist text not null default '',
  project text not null default '',
  tags text[] not null default '{}',
  description text not null default '',
  rights_scope text not null default 'internal' check (rights_scope in ('internal','artist-approved','restricted')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0 check (file_size >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (asset_key,version)
);

create index if not exists assets_recent_idx on public.assets (created_at desc);
create index if not exists assets_key_idx on public.assets (asset_key,version desc);
create index if not exists assets_tags_idx on public.assets using gin (tags);

alter table public.memberships enable row level security;
alter table public.assets enable row level security;

-- Sem auto-cadastro em memberships: admissão por admin no SQL Editor.
create or replace function public.is_vault_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.can_vault_edit()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = (select auth.uid()) and role in ('admin','editor')
  );
$$;

revoke all on function public.is_vault_member() from public;
revoke all on function public.can_vault_edit() from public;
grant execute on function public.is_vault_member() to authenticated;
grant execute on function public.can_vault_edit() to authenticated;

create policy "members may see own membership"
on public.memberships for select to authenticated
using (user_id = (select auth.uid()));

create policy "vault members can read assets"
on public.assets for select to authenticated
using (public.is_vault_member());

create policy "vault editors can add assets"
on public.assets for insert to authenticated
with check (public.can_vault_edit() and created_by = (select auth.uid()));

-- Não habilitamos updates/deletes de assets neste MVP para preservar histórico.
-- Políticas de Storage são independentes das da tabela assets:
create policy "vault members can read private files"
on storage.objects for select to authenticated
using (bucket_id = 'vault' and public.is_vault_member());

create policy "vault editors can upload files"
on storage.objects for insert to authenticated
with check (bucket_id = 'vault' and public.can_vault_edit());

-- Permite compensação de upload que falhou ao gravar metadados.
create policy "vault editors can remove own uploads"
on storage.objects for delete to authenticated
using (bucket_id = 'vault' and public.can_vault_edit() and owner_id = (select auth.uid())::text);

-- OBS: se executar este script novamente, create policy pode falhar com
-- "policy already exists". Execute só uma vez por projeto ou ajuste manualmente.
