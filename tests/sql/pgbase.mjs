import { fileURLToPath } from 'node:url';
// Postgres real (PGlite) con lo mínimo de Supabase, para ejecutar las migraciones
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
export const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
export const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role supabase_auth_admin nologin; create role supabase_storage_admin nologin;
create schema auth; create schema storage; create schema extensions; create schema cron;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, invited_at timestamptz, confirmation_token text default '', confirmation_sent_at timestamptz,
  recovery_token text default '', recovery_sent_at timestamptz, email_change_token_new text default '', email_change text default '', email_change_sent_at timestamptz,
  last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', is_super_admin boolean,
  created_at timestamptz default now(), updated_at timestamptz default now(), phone text, phone_confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean default false);
create table auth.identities (id uuid default gen_random_uuid() primary key, provider_id text, user_id uuid references auth.users on delete cascade, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, email text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp, user_agent text, ip inet, not_after timestamptz, aal text);
create table auth.refresh_tokens (id bigserial primary key, user_id text, session_id uuid, revoked boolean default false, token text);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete cascade, status text, factor_type text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create function auth.email() returns text language sql stable as $$ select email from auth.users where id = auth.uid() $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub', auth.uid(), 'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal1'), 'role', auth.role()) $$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid default auth.uid(), owner_id text, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated, anon, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
grant execute on all functions in schema storage to anon, authenticated, service_role;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (a, b, c) returning jobid $$;
create function cron.unschedule(a bigint) returns boolean language sql as $$ delete from cron.job where jobid = a returning true $$;
create publication supabase_realtime;
-- pgcrypto mínimo para las semillas
create function public.gen_salt(text) returns text language sql as $$ select 'sal' $$;
create function public.crypt(text, text) returns text language sql as $$ select md5($1 || $2) $$;
create function extensions.gen_salt(text) returns text language sql as $$ select 'sal' $$;
create function extensions.gen_salt(text, int) returns text language sql as $$ select 'sal' $$;
create function extensions.crypt(text, text) returns text language sql as $$ select md5($1 || $2) $$;
create function extensions.gen_random_bytes(int) returns bytea language sql as $$ select decode(md5(random()::text), 'hex') $$;
create function public.gen_random_bytes(int) returns bytea language sql as $$ select decode(md5(random()::text), 'hex') $$;
-- Supabase da todo por defecto en public a estos roles
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;
export const limpiar = sql => sql.replace(/create extension if not exists (pgcrypto|pg_cron|"?uuid-ossp"?|pg_net)[^;]*;/gi, 'select 1;');
export async function base({ hasta = null, solo = null } = {}) {
  const db = new PGlite();
  await db.exec(STUB);
  const errores = [];
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.sql') && x !== '20261029120000_panel_admin.sql').sort()) {
    if (hasta && f > hasta) break;
    if (solo && !solo(f)) continue;
    try { await db.exec('begin;' + limpiar(fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n')) + ';commit;'); }
    catch (e) { errores.push(`${f}: ${e.message}`); try { await db.exec('rollback'); } catch (x) { /* nada */ } }
  }
  return { db, errores };
}
