create table if not exists public.rule_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table if not exists public.random_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  kind public.call_kind not null default 'video',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.random_encounters (
  id uuid primary key default gen_random_uuid(),
  participant_ids uuid[] not null,
  kind public.call_kind not null default 'video',
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'matched' check (status in ('matched', 'active', 'ended', 'skipped')),
  room_name text,
  room_url text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check (cardinality(participant_ids) = 2 and participant_ids[1] <> participant_ids[2])
);

create table if not exists public.random_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.random_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  encounter_id uuid references public.random_encounters(id) on delete set null,
  reason text not null default 'Other',
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists random_queue_waiting_idx on public.random_queue(kind, joined_at);
create index if not exists random_encounters_participants_idx on public.random_encounters using gin(participant_ids);
create index if not exists random_encounters_status_idx on public.random_encounters(status, created_at desc);

alter table public.rule_acceptances enable row level security;
alter table public.random_queue enable row level security;
alter table public.random_encounters enable row level security;
alter table public.random_blocks enable row level security;
alter table public.random_reports enable row level security;

drop policy if exists rule_acceptances_read_self on public.rule_acceptances;
create policy rule_acceptances_read_self on public.rule_acceptances for select to authenticated using (user_id = auth.uid());
drop policy if exists rule_acceptances_insert_self on public.rule_acceptances;
create policy rule_acceptances_insert_self on public.rule_acceptances for insert to authenticated with check (user_id = auth.uid());
drop policy if exists rule_acceptances_update_self on public.rule_acceptances;
create policy rule_acceptances_update_self on public.rule_acceptances for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists random_queue_read_self on public.random_queue;
create policy random_queue_read_self on public.random_queue for select to authenticated using (user_id = auth.uid());

drop policy if exists random_encounters_read_participant on public.random_encounters;
create policy random_encounters_read_participant on public.random_encounters for select to authenticated using (auth.uid() = any(participant_ids));

drop policy if exists random_blocks_read_self on public.random_blocks;
create policy random_blocks_read_self on public.random_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists random_blocks_insert_self on public.random_blocks;
create policy random_blocks_insert_self on public.random_blocks for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists random_reports_read_self on public.random_reports;
create policy random_reports_read_self on public.random_reports for select to authenticated using (reporter_id = auth.uid());
drop policy if exists random_reports_insert_self on public.random_reports;
create policy random_reports_insert_self on public.random_reports for insert to authenticated with check (
  reporter_id = auth.uid()
  and exists (
    select 1 from public.random_encounters re
    where re.id = encounter_id
      and auth.uid() = any(re.participant_ids)
      and reported_id = any(re.participant_ids)
  )
);

create or replace function public.join_random_queue(p_kind public.call_kind)
returns table (
  encounter_id uuid,
  matched boolean,
  encounter_kind public.call_kind,
  conversation_id uuid,
  participant_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  candidate_user_id uuid;
  existing_id uuid;
  existing_kind public.call_kind;
  existing_status text;
  existing_conversation_id uuid;
  existing_participants uuid[];
  new_conversation_id uuid;
  new_encounter_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to enter the random queue.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.rule_acceptances
    where user_id = current_user_id and version = 'random-meet-v1'
  ) then
    raise exception 'Accept the random meet rules before joining.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(81726341);

  delete from public.random_queue
  where last_seen_at < now() - interval '30 seconds';

  select re.id, re.kind, re.status, re.conversation_id, re.participant_ids
    into existing_id, existing_kind, existing_status, existing_conversation_id, existing_participants
  from public.random_encounters re
  where current_user_id = any(re.participant_ids)
    and re.status in ('matched', 'active')
  order by re.created_at desc
  limit 1;

  if existing_id is not null then
    delete from public.random_queue where user_id = current_user_id;
    return query select existing_id, true, existing_kind, existing_conversation_id, existing_participants;
    return;
  end if;

  select q.user_id into candidate_user_id
  from public.random_queue q
  where q.user_id <> current_user_id
    and q.kind = p_kind
    and q.last_seen_at > now() - interval '30 seconds'
    and not exists (
      select 1 from public.random_blocks b
      where (b.blocker_id = current_user_id and b.blocked_id = q.user_id)
         or (b.blocker_id = q.user_id and b.blocked_id = current_user_id)
    )
    and not exists (
      select 1 from public.random_encounters re
      where q.user_id = any(re.participant_ids)
        and re.status in ('matched', 'active')
    )
  order by q.joined_at
  limit 1;

  if candidate_user_id is null then
    insert into public.random_queue (user_id, kind, joined_at, last_seen_at)
    values (current_user_id, p_kind, now(), now())
    on conflict (user_id) do update
      set kind = excluded.kind, last_seen_at = now();
    return query select null::uuid, false, p_kind, null::uuid, null::uuid[];
    return;
  end if;

  delete from public.random_queue where user_id in (current_user_id, candidate_user_id);

  insert into public.conversations (type, name, created_by)
  values ('buddy', 'Random meet', current_user_id)
  returning id into new_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (new_conversation_id, current_user_id), (new_conversation_id, candidate_user_id);

  insert into public.random_encounters (participant_ids, kind, conversation_id, status)
  values (array[candidate_user_id, current_user_id], p_kind, new_conversation_id, 'matched')
  returning id into new_encounter_id;

  return query
    select new_encounter_id, true, p_kind, new_conversation_id, array[candidate_user_id, current_user_id]::uuid[];
end;
$$;

create or replace function public.leave_random_queue()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.random_queue where user_id = auth.uid();
end;
$$;

create or replace function public.finish_random_encounter(p_encounter_id uuid, p_status text default 'ended')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('ended', 'skipped') then
    raise exception 'Invalid encounter status.' using errcode = '22023';
  end if;

  update public.random_encounters
  set status = p_status, ended_at = now()
  where id = p_encounter_id
    and auth.uid() = any(participant_ids)
    and status in ('matched', 'active');

  delete from public.random_queue where user_id = auth.uid();
end;
$$;

revoke all on function public.join_random_queue(public.call_kind) from public;
grant execute on function public.join_random_queue(public.call_kind) to authenticated;
revoke all on function public.leave_random_queue() from public;
grant execute on function public.leave_random_queue() to authenticated;
revoke all on function public.finish_random_encounter(uuid, text) from public;
grant execute on function public.finish_random_encounter(uuid, text) to authenticated;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'random_encounters'
  ) then
    alter publication supabase_realtime add table public.random_encounters;
  end if;
end $$;
