begin;

create table public.gw_signals (
  client_key text primary key,
  fingerprint text not null,
  fingerprint_changes integer not null default 0,
  activity_start timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.gw_honeypots (
  client_key text not null,
  fingerprint text not null,
  hit_times timestamptz[] not null default '{}',
  updated_at timestamptz not null default clock_timestamp(),
  primary key (client_key, fingerprint)
);
create index gw_signals_cleanup_idx on public.gw_signals (updated_at);
create index gw_honeypots_cleanup_idx on public.gw_honeypots (updated_at);
alter table public.gw_signals enable row level security;
alter table public.gw_honeypots enable row level security;
revoke all on public.gw_signals, public.gw_honeypots from public, anon, authenticated;
grant select, insert, update, delete on public.gw_signals, public.gw_honeypots to service_role;

create function public.gw_observe_security(p_client_key text, p_fingerprint text, p_honeypot boolean default false)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  previous public.gw_signals%rowtype;
  changes integer;
  observed_at timestamptz;
  hits timestamptz[];
begin
  if p_client_key is null or p_client_key !~ '^[a-f0-9]{64}$'
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid security-signal key';
  end if;
  insert into public.gw_signals (client_key, fingerprint) values (p_client_key, p_fingerprint)
    on conflict (client_key) do nothing;
  select * into previous from public.gw_signals where client_key = p_client_key for update;
  observed_at := clock_timestamp();
  if previous.activity_start < observed_at - interval '10 minutes' then
    changes := 0;
  else
    changes := least(1000000, previous.fingerprint_changes + case when previous.fingerprint <> p_fingerprint then 1 else 0 end);
  end if;
  update public.gw_signals set fingerprint = p_fingerprint, fingerprint_changes = changes,
    activity_start = case when previous.activity_start < observed_at - interval '10 minutes' then observed_at else previous.activity_start end,
    updated_at = observed_at where client_key = p_client_key;

  -- Scope traps to IP + passive fingerprint, avoiding penalty for other browsers
  -- behind a shared IP. Changing spoofable headers may evade this supporting signal.
  insert into public.gw_honeypots (client_key, fingerprint) values (p_client_key, p_fingerprint)
    on conflict (client_key, fingerprint) do nothing;
  select hit_times into hits from public.gw_honeypots
    where client_key = p_client_key and fingerprint = p_fingerprint for update;
  select coalesce(array_agg(t order by t), '{}'::timestamptz[]) into hits
    from unnest(hits) t where t > observed_at - interval '10 minutes';
  if coalesce(p_honeypot, false) then hits := array_append(hits, observed_at); end if;
  if cardinality(hits) > 20 then hits := hits[cardinality(hits)-19:cardinality(hits)]; end if;
  update public.gw_honeypots set hit_times = hits, updated_at = observed_at
    where client_key = p_client_key and fingerprint = p_fingerprint;
  return jsonb_build_object('fingerprintChanges', changes, 'honeypotHits', cardinality(hits));
end;
$$;
revoke all on function public.gw_observe_security(text, text, boolean) from public, anon, authenticated;
grant execute on function public.gw_observe_security(text, text, boolean) to service_role;

create or replace function public.gw_cleanup()
returns void language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  delete from public.gw_clients where updated_at < now() - interval '1 day';
  delete from public.gw_challenges where expires_at < now();
  delete from public.gw_decisions where created_at < now() - interval '7 days';
  delete from public.gw_analyses where created_at < now() - interval '7 days';
  delete from public.gw_signals where updated_at < now() - interval '1 day';
  delete from public.gw_honeypots where updated_at < now() - interval '1 day';
end;
$$;
revoke all on function public.gw_cleanup() from public, anon, authenticated;
grant execute on function public.gw_cleanup() to service_role;

commit;
