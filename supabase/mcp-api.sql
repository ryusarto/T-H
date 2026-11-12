-- H&T Vault · scoped API tokens for external AI/agent access (2026-11-12).
-- No browser, anonymous or regular authenticated role can read token hashes.
-- The Supabase Edge Function creates and checks tokens server-side.

create table if not exists public.vault_api_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  allowed_projects text[] not null check (cardinality(allowed_projects) between 1 and 30),
  allow_download boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists vault_api_tokens_active_idx
  on public.vault_api_tokens(expires_at) where revoked_at is null;
create index if not exists vault_api_tokens_owner_idx
  on public.vault_api_tokens(created_by,created_at desc);

alter table public.vault_api_tokens enable row level security;
revoke all on table public.vault_api_tokens from public, anon, authenticated;
grant select, insert, update on public.vault_api_tokens to service_role;

-- Ensure the session owner must remain a Vault administrator:
-- service-role Edge Function verifies memberships(role=admin) on every request.
-- No public RPC, no security-definer token access and no anonymous policies.

comment on table public.vault_api_tokens is
  'Server-only H&T Vault scoped API credentials; SHA-256 hashes, never plaintext tokens.';
