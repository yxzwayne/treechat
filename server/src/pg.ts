import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

let _pool: Pool | null = null

export function getPool(): Pool {
  if (_pool) return _pool
  const url = process.env.DATABASE_URL || 'postgres://localhost:5432/treechat'
  _pool = new Pool({ connectionString: url })
  return _pool
}

export async function ensureSchema() {
  const pool = getPool()
  // Migration-safe bootstrap: add missing columns before creating dependent indexes
  const sql = `
  -- Required for gen_random_uuid()
  create extension if not exists pgcrypto;

  do $$ begin
    create type message_role as enum ('human','ai','system');
  exception when duplicate_object then null; end $$;

  create table if not exists chat_logs (
    id bigserial primary key,
    model text not null,
    messages jsonb not null,
    response text not null default '',
    started_at timestamptz not null default now(),
    finished_at timestamptz null,
    error text null
  );

  -- Conversations use UUID primary key and status/summary fields
  create table if not exists conversations (
    uuid uuid primary key default gen_random_uuid(),
    summary text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    status text not null default 'active'
  );

  -- Messages base table (without assuming columns exist yet)
  create table if not exists messages (
    uuid uuid primary key default gen_random_uuid()
  );

  -- Ensure conversation_id column exists (nullable at first for migration)
  do $$ begin
    alter table messages add column conversation_id uuid;
  exception when duplicate_column then null; end $$;

  -- If legacy column conversation_uuid exists, migrate its data into conversation_id
  do $$ begin
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'messages' and column_name = 'conversation_uuid'
    ) then
      execute 'update messages set conversation_id = conversation_uuid where conversation_id is null';
    end if;
  end $$;

  -- Ensure FK exists with ON DELETE CASCADE (drop and recreate to enforce policy)
  do $$ begin
    begin
      alter table messages drop constraint if exists messages_conversation_id_fkey;
    exception when undefined_object then null; end;
    alter table messages
      add constraint messages_conversation_id_fkey
      foreign key (conversation_id) references conversations(uuid) on delete cascade;
  end $$;

  -- Set NOT NULL on conversation_id only if no nulls remain
  do $$ begin
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'messages' and column_name = 'conversation_id'
    ) then
      if not exists (select 1 from messages where conversation_id is null) then
        alter table messages alter column conversation_id set not null;
      end if;
    end if;
  end $$;

  -- Add/align columns if they are missing
  alter table messages add column if not exists parent_id uuid;
  alter table messages add column if not exists external_id text;
  alter table messages add column if not exists parent_external_id text;
  alter table messages add column if not exists role text;
  alter table messages add column if not exists sender message_role;
  alter table messages add column if not exists text text;
  alter table messages add column if not exists content jsonb;
  alter table messages add column if not exists model text;
  alter table messages add column if not exists model_provider text;
  alter table messages add column if not exists created_ts bigint default 0;
  alter table messages add column if not exists created_at timestamptz not null default now();
  alter table messages add column if not exists updated_at timestamptz not null default now();

  -- Drop any legacy indexes on conversation_uuid and the legacy column itself
  do $$ begin
    perform 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_messages_conv';
    if found then execute 'drop index if exists idx_messages_conv'; end if;
    perform 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_messages_conv_external';
    if found then execute 'drop index if exists idx_messages_conv_external'; end if;
    perform 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_messages_conv_parent_external';
    if found then execute 'drop index if exists idx_messages_conv_parent_external'; end if;
    perform 1 from pg_indexes where schemaname = 'public' and indexname = 'uniq_messages_conv_external';
    if found then execute 'drop index if exists uniq_messages_conv_external'; end if;
  end $$;

  -- After migration, drop the legacy column
  alter table messages drop column if exists conversation_uuid;

  -- Indexes aligned to conversation_id usage (recreate on correct columns)
  create index if not exists idx_messages_conv on messages(conversation_id);
  create index if not exists idx_messages_conv_external on messages(conversation_id, external_id);
  create unique index if not exists uniq_messages_conv_external on messages(conversation_id, external_id);

  -- Backfill parent_id from parent_external_id within the same conversation
  with updated as (
    update messages m
       set parent_id = (p.uuid)::uuid
      from messages p
     where m.parent_id is null
       and m.parent_external_id is not null
       and m.conversation_id = p.conversation_id
       and m.parent_external_id = p.external_id
     returning 1
  ) select 1;

  -- Insert a real system root row when children reference a missing parent (idempotent)
  insert into messages (conversation_id, external_id, parent_id, role, sender, text, content, model, created_ts)
  select distinct m.conversation_id,
                  m.parent_external_id as external_id,
                  null::uuid as parent_id,
                  'system' as role,
                  'system'::message_role as sender,
                  'You are a helpful assistant.' as text,
                  to_jsonb('You are a helpful assistant.'::text) as content,
                  null as model,
                  0 as created_ts
    from messages m
    left join messages p
      on p.conversation_id = m.conversation_id and p.external_id = m.parent_external_id
   where m.parent_external_id is not null
     and p.uuid is null
  on conflict (conversation_id, external_id) do nothing;

  -- Backfill again now that roots may exist
  with updated2 as (
    update messages m
       set parent_id = (p.uuid)::uuid
      from messages p
     where m.parent_id is null
       and m.parent_external_id is not null
       and m.conversation_id = p.conversation_id
       and m.parent_external_id = p.external_id
     returning 1
  ) select 1;

  -- Drop legacy index and column for parent_external_id
  do $$ begin
    perform 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_messages_conv_parent_external';
    if found then execute 'drop index if exists idx_messages_conv_parent_external'; end if;
  end $$;
  alter table messages drop column if exists parent_external_id;

  -- FK for parent_id -> messages.uuid (nullable root). Use SET NULL to avoid cascading deletes.
  do $$ begin
    alter table messages
      add constraint messages_parent_id_fkey
      foreign key (parent_id) references messages(uuid) on delete set null;
  exception when duplicate_object then null; end $$;

  -- Helpful index on parent_id
  create index if not exists idx_messages_parent on messages(parent_id);

  -- Local model configuration (single-user app)
  create table if not exists model_config (
    id int primary key,
    enabled_ids text[] not null,
    default_id text not null,
    updated_at timestamptz not null default now()
  );

  -- Cached OpenRouter catalog used for server-side search
  create table if not exists openrouter_model_catalog (
    id text primary key,
    canonical_slug text not null,
    name text not null,
    created bigint not null default 0,
    description text not null default '',
    context_length integer not null default 0,
    provider text not null,
    updated_at timestamptz not null default now()
  );

  create index if not exists idx_openrouter_model_catalog_provider
    on openrouter_model_catalog(provider);

  create index if not exists idx_openrouter_model_catalog_name
    on openrouter_model_catalog(name);

  create table if not exists openrouter_model_catalog_state (
    id int primary key,
    fetched_at timestamptz not null
  );
  `
  await pool.query(sql)
}
