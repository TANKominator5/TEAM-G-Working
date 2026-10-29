-- Applied to BotStop via MCP as migration 20261029084105.
-- Advisory-only model findings. Server credential only; no browser access.
begin;

create table public.gw_analyses (
  id uuid primary key,
  created_at timestamptz not null,
  model text not null check (char_length(model) between 1 and 100),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  sample_size integer not null check (sample_size between 1 and 100),
  window_total integer not null check (window_total >= 0),
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  finding jsonb not null check (jsonb_typeof(finding) = 'object')
);
create index gw_analyses_time_idx on public.gw_analyses (created_at desc, id desc);
create index gw_analyses_cache_idx on public.gw_analyses (input_hash, created_at desc);

alter table public.gw_analyses enable row level security;
revoke all on public.gw_analyses from public, anon, authenticated;
grant select, insert, delete on public.gw_analyses to service_role;

create or replace function public.gw_cleanup()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.gw_clients where updated_at < now() - interval '1 day';
  delete from public.gw_challenges where expires_at < now();
  delete from public.gw_decisions where created_at < now() - interval '7 days';
  delete from public.gw_analyses where created_at < now() - interval '7 days';
end;
$$;
revoke all on function public.gw_cleanup() from public, anon, authenticated;
grant execute on function public.gw_cleanup() to service_role;

commit;
