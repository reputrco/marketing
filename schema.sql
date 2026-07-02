-- ============================================================================
-- Reputr Content Portal — full Supabase setup
-- Run this once in the Supabase SQL editor (Project → SQL editor → New query).
-- Safe to re-run: everything is idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type post_status as enum ('draft','scheduled','approved','posted','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type platform as enum ('fb','linkedin','x');
exception when duplicate_object then null; end $$;

-- ---------- posts table ----------
create table if not exists posts (
  id             uuid primary key default gen_random_uuid(),
  platform       platform      not null,
  content        text          not null,
  media_urls     text[]        not null default '{}',   -- public Storage URLs (+ any pasted URLs)
  sources        jsonb         not null default '[]',     -- [{url, title?}] research citations
  edit_count     integer       not null default 0,        -- denormalized count of post_edits rows
  status         post_status   not null default 'draft',

  scheduled_at   timestamptz,
  posted_at      timestamptz,

  -- DEDUP: caller supplies a stable key at generation time
  -- (e.g. 'linkedin-2026-07-01-<hash>'). Repeated pushes are ignored.
  idempotency_key text        not null,

  -- second guard: hash of content, auto-computed
  content_hash    text generated always as (encode(digest(content, 'sha256'), 'hex')) stored,

  source         text,          -- 'claude-daily' | 'codex-daily' | 'manual' | ...
  created_by     text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

-- Idempotent upgrade for installs created before the sources column existed:
alter table posts add column if not exists sources jsonb not null default '[]';

-- ---------- dedup guarantees ----------
create unique index if not exists posts_idempotency_key_uidx on posts (idempotency_key);
create unique index if not exists posts_platform_contenthash_uidx on posts (platform, content_hash);

create index if not exists posts_status_idx    on posts (status);
create index if not exists posts_scheduled_idx on posts (scheduled_at);

-- ---------- updated_at trigger ----------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists posts_touch on posts;
create trigger posts_touch before update on posts
for each row execute function touch_updated_at();

-- ---------- Row Level Security (posts) ----------
-- Dashboard uses the logged-in user's session (publishable key) → respects RLS.
-- The push API uses the secret key, which BYPASSES RLS by design.
alter table posts enable row level security;

drop policy if exists "authenticated can read"   on posts;
drop policy if exists "authenticated can insert" on posts;
drop policy if exists "authenticated can update" on posts;
drop policy if exists "authenticated can delete" on posts;

create policy "authenticated can read"   on posts for select to authenticated using (true);
create policy "authenticated can insert" on posts for insert to authenticated with check (true);
create policy "authenticated can update" on posts for update to authenticated using (true) with check (true);
create policy "authenticated can delete" on posts for delete to authenticated using (true);

-- ---------- post_edits (activity log) ----------
-- One row per activity on a post:
--   kind='edit'   → content/images changed; content+media_urls hold the PREVIOUS version
--   kind='status' → status changed; from_status/to_status hold the transition
-- edited_by / edited_at record who did it and when.
create table if not exists post_edits (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts(id) on delete cascade,
  kind         text not null default 'edit',
  content      text,
  media_urls   text[] not null default '{}',
  from_status  post_status,
  to_status    post_status,
  edited_by    text,
  edited_at    timestamptz not null default now()
);

-- Idempotent upgrades for installs created before the activity-log change:
alter table post_edits add column if not exists kind text not null default 'edit';
alter table post_edits add column if not exists from_status post_status;
alter table post_edits add column if not exists to_status post_status;
alter table post_edits alter column content drop not null;

create index if not exists post_edits_post_idx on post_edits (post_id, edited_at desc);

-- Keep posts.edit_count in sync automatically (works for dashboard AND push API).
create or replace function bump_edit_count() returns trigger as $$
begin
  update posts set edit_count = edit_count + 1 where id = new.post_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists post_edits_bump on post_edits;
create trigger post_edits_bump after insert on post_edits
for each row execute function bump_edit_count();

alter table post_edits enable row level security;

drop policy if exists "authenticated can read edits"   on post_edits;
drop policy if exists "authenticated can insert edits" on post_edits;

create policy "authenticated can read edits"   on post_edits for select to authenticated using (true);
create policy "authenticated can insert edits" on post_edits for insert to authenticated with check (true);

-- ============================================================================
-- Storage: bucket for uploaded post images
-- ============================================================================

-- Public bucket so the getPublicUrl() links work directly in <img> tags.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

-- Object-level policies on the bucket.
drop policy if exists "post-images public read"    on storage.objects;
drop policy if exists "post-images auth insert"     on storage.objects;
drop policy if exists "post-images auth update"     on storage.objects;
drop policy if exists "post-images auth delete"     on storage.objects;

-- Anyone can read (bucket is public; this also allows API listing).
create policy "post-images public read" on storage.objects
  for select using (bucket_id = 'post-images');

-- Logged-in users can upload / overwrite / delete objects in this bucket.
create policy "post-images auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'post-images');

create policy "post-images auth update" on storage.objects
  for update to authenticated using (bucket_id = 'post-images');

create policy "post-images auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'post-images');

-- Note: the push API deletes images with the secret key, which bypasses these
-- policies. These policies cover deletes triggered from the dashboard.

-- ============================================================================
-- Storage: private bucket for shared documents (PRODUCT.md, briefs, etc.)
-- ============================================================================

-- Private bucket: only authenticated users can list / download / manage.
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do update set public = false;

drop policy if exists "docs auth read"   on storage.objects;
drop policy if exists "docs auth insert" on storage.objects;
drop policy if exists "docs auth update" on storage.objects;
drop policy if exists "docs auth delete" on storage.objects;

-- Logged-in users can list, download, upload (upsert), and delete docs.
create policy "docs auth read" on storage.objects
  for select to authenticated using (bucket_id = 'docs');

create policy "docs auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'docs');

create policy "docs auth update" on storage.objects
  for update to authenticated using (bucket_id = 'docs');

create policy "docs auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'docs');
