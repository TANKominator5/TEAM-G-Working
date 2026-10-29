-- Apply once in the Supabase SQL Editor. All access is server-side, using the
-- service-role key. No anonymous/authenticated client can access these tables/RPCs.
begin;

create table public.gw_clients (
  client_key text primary key,
  request_times timestamptz[] not null default '{}',
  updated_at timestamptz not null default clock_timestamp()
);

create table public.gw_decisions (
  id uuid primary key,
  created_at timestamptz not null,
  client_id text not null,
  method text not null,
  path text not null,
  score integer not null check (score between 0 and 100),
  decision text not null check (decision in ('allow', 'challenge', 'block')),
  reasons jsonb not null,
  status integer not null,
  latency_ms integer not null,
  user_agent text not null,
  features jsonb not null
);
create index gw_decisions_time_idx on public.gw_decisions (created_at desc, id desc);
create index gw_decisions_filter_idx on public.gw_decisions (decision, created_at desc, id desc);

create table public.gw_challenges (
  nonce uuid primary key,
  expires_at timestamptz not null
);

alter table public.gw_clients enable row level security;
alter table public.gw_decisions enable row level security;
alter table public.gw_challenges enable row level security;
revoke all on public.gw_clients, public.gw_decisions, public.gw_challenges from anon, authenticated;
grant all on public.gw_clients, public.gw_decisions, public.gw_challenges to service_role;

create function public.gw_record_request(p_client_key text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  times timestamptz[];
  sample timestamptz[];
  recorded_at timestamptz;
  count10 integer;
  gap_count integer;
  cv double precision;
begin
  if p_client_key !~ '^[a-z0-9_:]{1,128}$' then
    raise exception 'Invalid client key';
  end if;
  insert into public.gw_clients (client_key) values (p_client_key)
    on conflict (client_key) do nothing;
  -- Serialize requests per key across concurrent serverless instances.
  select request_times into times from public.gw_clients
    where client_key = p_client_key for update;
  recorded_at := clock_timestamp();
  select coalesce(array_agg(t order by t), '{}'::timestamptz[]) into times
    from unnest(times) t where t > recorded_at - interval '60 seconds';
  times := array_append(times, recorded_at);
  -- Bounded per-client storage. Counts saturate above 256 (already a hard block).
  if cardinality(times) > 256 then
    times := times[cardinality(times)-255:cardinality(times)];
  end if;
  update public.gw_clients set request_times = times, updated_at = recorded_at
    where client_key = p_client_key;
  select count(*) into count10 from unnest(times) t
    where t > recorded_at - interval '10 seconds';
  sample := times[greatest(1, cardinality(times)-7):cardinality(times)];
  select count(gap), case when avg(gap) > 0 then stddev_pop(gap) / avg(gap) else null end
    into gap_count, cv
    from (
      select extract(epoch from (t - lag(t) over (order by t)))::double precision gap
      from unnest(sample) t
    ) intervals;
  return jsonb_build_object(
    'requests10s', count10, 'requests60s', cardinality(times),
    'intervalCount', gap_count, 'intervalCv', cv
  );
end;
$$;

create function public.gw_stats()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  with bounds as (
    select date_trunc('minute', now()) as finish
  ), recent as (
    select d.* from public.gw_decisions d, bounds b
    where d.created_at >= b.finish - interval '59 minutes'
      and d.created_at < b.finish + interval '1 minute'
  ), totals as (
    select count(*) as total,
      count(*) filter (where decision = 'allow') as allowed,
      count(*) filter (where decision = 'challenge') as challenged,
      count(*) filter (where decision = 'block') as blocked,
      coalesce(round(avg(score), 1), 0) as average_score,
      coalesce(round(avg(latency_ms), 1), 0) as average_latency
    from recent
  ), buckets as (
    select minute,
      count(r.id) filter (where r.decision = 'allow') as allowed,
      count(r.id) filter (where r.decision = 'challenge') as challenged,
      count(r.id) filter (where r.decision = 'block') as blocked
    from bounds b,
      generate_series(b.finish - interval '59 minutes', b.finish, interval '1 minute') minute
    left join recent r on date_trunc('minute', r.created_at) = minute
    group by minute
  )
  select jsonb_build_object(
    'windowMinutes', 60, 'total', t.total,
    'allowed', t.allowed, 'challenged', t.challenged, 'blocked', t.blocked,
    'averageScore', t.average_score, 'averageLatencyMs', t.average_latency,
    'series', (select jsonb_agg(jsonb_build_object(
      'timestamp', minute, 'allowed', allowed, 'challenged', challenged, 'blocked', blocked
    ) order by minute) from buckets)
  ) from totals t;
$$;

-- Run daily via Supabase Cron or manually in the SQL Editor. Not exposed to clients.
create function public.gw_cleanup()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.gw_clients where updated_at < now() - interval '1 day';
  delete from public.gw_challenges where expires_at < now();
  delete from public.gw_decisions where created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.gw_record_request(text), public.gw_stats(), public.gw_cleanup()
  from public, anon, authenticated;
grant execute on function public.gw_record_request(text), public.gw_stats(), public.gw_cleanup()
  to service_role;

commit;
