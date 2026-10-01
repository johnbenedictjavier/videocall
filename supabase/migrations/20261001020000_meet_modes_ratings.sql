alter table public.random_queue
  add column if not exists mode public.match_mode not null default 'buddy',
  add column if not exists max_members smallint not null default 2;

alter table public.random_encounters
  add column if not exists mode public.match_mode not null default 'buddy',
  add column if not exists max_members smallint not null default 2;

alter table public.random_encounters
  drop constraint if exists random_encounters_participant_ids_check;

alter table public.random_queue
  drop constraint if exists random_queue_mode_members_check;
alter table public.random_queue
  add constraint random_queue_mode_members_check check (
    (mode = 'buddy' and max_members = 2)
    or (mode = 'peer' and max_members between 3 and 5)
  );

alter table public.random_encounters
  drop constraint if exists random_encounters_mode_members_check;
alter table public.random_encounters
  add constraint random_encounters_mode_members_check check (
    cardinality(participant_ids) between 2 and 5
    and (
      (mode = 'buddy' and max_members = 2 and cardinality(participant_ids) = 2)
      or (mode = 'peer' and max_members between 3 and 5 and cardinality(participant_ids) between 3 and max_members)
    )
  );

create index if not exists random_queue_mode_idx on public.random_queue(mode, kind, joined_at);

create or replace function public.enforce_conversation_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.conversation_id::text, 0));
  if (select c.type from public.conversations c where c.id = new.conversation_id) = 'peer'
     and (select count(*) from public.conversation_members cm where cm.conversation_id = new.conversation_id) >= 5 then
    raise exception 'Peer conversations can have a maximum of five members.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_member_limit on public.conversation_members;
create trigger conversation_member_limit
before insert on public.conversation_members
for each row execute function public.enforce_conversation_member_limit();

create or replace function public.enforce_peer_group_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.group_id::text, 0));
  if (select count(*) from public.peer_group_members pgm where pgm.group_id = new.group_id) >= 5 then
    raise exception 'Peer groups can have a maximum of five members.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists peer_group_member_limit on public.peer_group_members;
create trigger peer_group_member_limit
before insert on public.peer_group_members
for each row execute function public.enforce_peer_group_member_limit();

create or replace function public.enforce_match_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.match_id::text, 0));
  if (select m.mode from public.matches m where m.id = new.match_id) = 'peer'
     and (select count(*) from public.match_members mm where mm.match_id = new.match_id) >= 5 then
    raise exception 'Peer matches can have a maximum of five members.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists match_member_limit on public.match_members;
create trigger match_member_limit
before insert on public.match_members
for each row execute function public.enforce_match_member_limit();

alter table public.calls
  drop constraint if exists calls_participant_limit_check;
alter table public.calls
  add constraint calls_participant_limit_check check (cardinality(recipient_ids) <= 4);

create table if not exists public.call_ratings (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references public.calls(id) on delete cascade,
  encounter_id uuid references public.random_encounters(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text check (feedback is null or char_length(feedback) <= 500),
  created_at timestamptz not null default now(),
  check ((call_id is null) <> (encounter_id is null)),
  check (rater_id <> ratee_id),
  unique (call_id, rater_id, ratee_id),
  unique (encounter_id, rater_id, ratee_id)
);

alter table public.call_ratings enable row level security;

drop policy if exists call_ratings_read_self on public.call_ratings;
create policy call_ratings_read_self on public.call_ratings
  for select to authenticated using (rater_id = auth.uid() or ratee_id = auth.uid());

create or replace function public.submit_call_rating(
  p_call_id uuid default null,
  p_encounter_id uuid default null,
  p_ratee_id uuid default null,
  p_rating smallint default null,
  p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  participant_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'You must be signed in to submit a rating.' using errcode = '42501';
  end if;
  if (p_call_id is null) = (p_encounter_id is null) then
    raise exception 'A rating must belong to one call or encounter.' using errcode = '22023';
  end if;
  if p_ratee_id is null or p_ratee_id = current_user_id or p_rating is null or p_rating not between 1 and 5 then
    raise exception 'The rating is invalid.' using errcode = '22023';
  end if;
  if p_feedback is not null and char_length(p_feedback) > 500 then
    raise exception 'Feedback must be 500 characters or fewer.' using errcode = '22023';
  end if;

  if p_encounter_id is not null then
    select re.participant_ids into participant_ids
    from public.random_encounters re
    where re.id = p_encounter_id;
  else
    select array_append(c.recipient_ids, c.caller_id) into participant_ids
    from public.calls c
    where c.id = p_call_id;
  end if;

  if participant_ids is null or not (current_user_id = any(participant_ids)) or not (p_ratee_id = any(participant_ids)) then
    raise exception 'You can only rate another participant in this call.' using errcode = '42501';
  end if;

  if p_encounter_id is not null then
    insert into public.call_ratings (call_id, encounter_id, rater_id, ratee_id, rating, feedback)
    values (null, p_encounter_id, current_user_id, p_ratee_id, p_rating, nullif(trim(p_feedback), ''))
    on conflict (encounter_id, rater_id, ratee_id) do update
      set rating = excluded.rating, feedback = excluded.feedback;
  else
    insert into public.call_ratings (call_id, encounter_id, rater_id, ratee_id, rating, feedback)
    values (p_call_id, null, current_user_id, p_ratee_id, p_rating, nullif(trim(p_feedback), ''))
    on conflict (call_id, rater_id, ratee_id) do update
      set rating = excluded.rating, feedback = excluded.feedback;
  end if;
end;
$$;

revoke all on function public.submit_call_rating(uuid, uuid, uuid, smallint, text) from public;
grant execute on function public.submit_call_rating(uuid, uuid, uuid, smallint, text) to authenticated;

create or replace function public.join_meet_queue(
  p_kind public.call_kind,
  p_mode public.match_mode,
  p_max_members smallint
)
returns table (
  encounter_id uuid,
  matched boolean,
  encounter_kind public.call_kind,
  encounter_mode public.match_mode,
  encounter_max_members smallint,
  conversation_id uuid,
  participant_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  existing_id uuid;
  existing_kind public.call_kind;
  existing_mode public.match_mode;
  existing_max_members smallint;
  existing_conversation_id uuid;
  existing_participants uuid[];
  candidate_ids uuid[] := '{}'::uuid[];
  selected_participants uuid[];
  new_conversation_id uuid;
  new_encounter_id uuid;
  candidate_limit integer;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to enter the Meet queue.' using errcode = '42501';
  end if;
  if p_mode = 'buddy' and p_max_members <> 2 then
    raise exception 'Study Buddy rooms must have exactly two members.' using errcode = '22023';
  end if;
  if p_mode = 'peer' and p_max_members not between 3 and 5 then
    raise exception 'Peer rooms must allow between three and five members.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rule_acceptances
    where user_id = current_user_id and version = 'random-meet-v1'
  ) then
    raise exception 'Accept the random Meet rules before joining.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(81726341);

  delete from public.random_queue
  where last_seen_at < now() - interval '30 seconds';

  select re.id, re.kind, re.mode, re.max_members, re.conversation_id, re.participant_ids
    into existing_id, existing_kind, existing_mode, existing_max_members, existing_conversation_id, existing_participants
  from public.random_encounters re
  where current_user_id = any(re.participant_ids)
    and re.status in ('matched', 'active')
  order by re.created_at desc
  limit 1;

  if existing_id is not null then
    delete from public.random_queue where user_id = current_user_id;
    return query select existing_id, true, existing_kind, existing_mode, existing_max_members, existing_conversation_id, existing_participants;
    return;
  end if;

  if p_mode = 'peer' then
    select re.id, re.kind, re.mode, re.max_members, re.conversation_id, re.participant_ids
      into existing_id, existing_kind, existing_mode, existing_max_members, existing_conversation_id, existing_participants
    from public.random_encounters re
    where re.mode = 'peer'
      and re.kind = p_kind
      and re.max_members = p_max_members
      and re.status in ('matched', 'active')
      and cardinality(re.participant_ids) < re.max_members
      and not exists (
        select 1 from unnest(re.participant_ids) participant_id
        join public.random_blocks block on
          (block.blocker_id = current_user_id and block.blocked_id = participant_id)
          or (block.blocker_id = participant_id and block.blocked_id = current_user_id)
      )
    order by re.created_at
    limit 1
    for update;

    if existing_id is not null then
      update public.random_encounters
      set participant_ids = existing_participants || current_user_id
      where id = existing_id;
      insert into public.conversation_members (conversation_id, user_id)
      values (existing_conversation_id, current_user_id)
      on conflict (conversation_id, user_id) do nothing;
      delete from public.random_queue where user_id = current_user_id;
      return query select existing_id, true, existing_kind, existing_mode, existing_max_members, existing_conversation_id, existing_participants || current_user_id;
      return;
    end if;
  end if;

  candidate_limit := case when p_mode = 'buddy' then 1 else p_max_members - 1 end;
  select coalesce(array_agg(candidate.user_id order by candidate.joined_at), '{}'::uuid[])
    into candidate_ids
  from (
    select q.user_id, q.joined_at
    from public.random_queue q
    where q.user_id <> current_user_id
      and q.kind = p_kind
      and q.mode = p_mode
      and q.max_members = p_max_members
      and q.last_seen_at > now() - interval '30 seconds'
      and not exists (
        select 1 from public.random_blocks block
        where (block.blocker_id = current_user_id and block.blocked_id = q.user_id)
           or (block.blocker_id = q.user_id and block.blocked_id = current_user_id)
      )
      and not exists (
        select 1 from public.random_encounters re
        where q.user_id = any(re.participant_ids)
          and re.status in ('matched', 'active')
      )
    order by q.joined_at
    limit candidate_limit
  ) candidate;

  if cardinality(candidate_ids) < (case when p_mode = 'buddy' then 1 else 2 end) then
    insert into public.random_queue (user_id, kind, mode, max_members, joined_at, last_seen_at)
    values (current_user_id, p_kind, p_mode, p_max_members, now(), now())
    on conflict (user_id) do update
      set kind = excluded.kind, mode = excluded.mode, max_members = excluded.max_members, last_seen_at = now();
    return query select null::uuid, false, p_kind, p_mode, p_max_members, null::uuid, null::uuid[];
    return;
  end if;

  selected_participants := array_append(candidate_ids, current_user_id);
  delete from public.random_queue where user_id = any(selected_participants);

  if p_mode = 'buddy' then
    new_conversation_id := public.get_or_create_direct_conversation(candidate_ids[1], 'Random meet');
  else
    insert into public.conversations (type, name, created_by)
    values ('peer', 'Peer Meet', current_user_id)
    returning id into new_conversation_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  select new_conversation_id, member_id
  from unnest(selected_participants) member_id
  on conflict (conversation_id, user_id) do nothing;

  insert into public.random_encounters (participant_ids, kind, mode, max_members, conversation_id, status)
  values (selected_participants, p_kind, p_mode, p_max_members, new_conversation_id, 'matched')
  returning id into new_encounter_id;

  return query select new_encounter_id, true, p_kind, p_mode, p_max_members, new_conversation_id, selected_participants;
end;
$$;

revoke all on function public.join_meet_queue(public.call_kind, public.match_mode, smallint) from public;
grant execute on function public.join_meet_queue(public.call_kind, public.match_mode, smallint) to authenticated;

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
begin
  return query
  select result.encounter_id, result.matched, result.encounter_kind, result.conversation_id, result.participant_ids
  from public.join_meet_queue(p_kind, 'buddy', 2::smallint) result;
end;
$$;

revoke all on function public.join_random_queue(public.call_kind) from public;
grant execute on function public.join_random_queue(public.call_kind) to authenticated;
