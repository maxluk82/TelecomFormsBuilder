-- Run once in a dedicated Supabase project's SQL Editor.
create table public.tool_members (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(email)),
 phone text unique check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.tool_sessions (
 token_hash text primary key,
 member_id uuid not null references public.tool_members(id) on delete cascade,
 expires_at timestamptz not null
);
create table public.tool_audit (
 id bigint generated always as identity primary key,
 member_id uuid references public.tool_members(id) on delete set null,
 event text not null check(event in ('login_email','login_sms','logout','generate_request')),
 task text check(task in ('cover','date','senior','address','name','owner','broadband')),
 created_at timestamptz not null default now()
);
create table public.tool_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
alter table public.tool_members enable row level security;
alter table public.tool_sessions enable row level security;
alter table public.tool_audit enable row level security;
alter table public.tool_limits enable row level security;
revoke all on public.tool_members,public.tool_sessions,public.tool_audit,public.tool_limits from anon,authenticated;
grant all on public.tool_members,public.tool_sessions,public.tool_audit,public.tool_limits to service_role;
grant usage,select on sequence public.tool_audit_id_seq to service_role;
create or replace function public.tool_rate_limit(p_key text,p_max integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into public.tool_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when tool_limits.expires_at<=now() then 1 else tool_limits.hits+1 end,
 expires_at=case when tool_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else tool_limits.expires_at end
 returning hits into n;
 return n<=p_max;
end;$$;
revoke all on function public.tool_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.tool_rate_limit(text,integer,integer) to service_role;
-- Add approved people in Table Editor -> tool_members (phone optional unless using SMS).
-- Disable active to revoke access. Never enable public RLS policies on these tables.
-- Periodic cleanup (e.g. daily SQL job):
-- delete from public.tool_sessions where expires_at < now();
-- delete from public.tool_limits where expires_at < now();
-- delete from public.tool_audit where created_at < now()-interval '90 days';
