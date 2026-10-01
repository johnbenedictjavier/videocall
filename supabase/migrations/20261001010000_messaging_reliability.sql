alter table public.conversations
  add column if not exists direct_key text;

alter table public.conversation_members
  add column if not exists history_cleared_at timestamptz;

create or replace function public.direct_conversation_key(p_first uuid, p_second uuid)
returns text
language sql
immutable
strict
as $$
  select least(p_first::text, p_second::text) || ':' || greatest(p_first::text, p_second::text);
$$;

with direct_conversations as (
  select
    c.id,
    array_agg(cm.user_id order by cm.user_id) as member_ids
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id
  where c.type = 'buddy'
  group by c.id
  having count(*) = 2
)
update public.conversations c
set direct_key = public.direct_conversation_key(direct_conversations.member_ids[1], direct_conversations.member_ids[2])
from direct_conversations
where c.id = direct_conversations.id;

do $$
declare
  duplicate_group record;
  duplicate_id uuid;
begin
  for duplicate_group in
    select direct_key, (array_agg(id order by created_at, id))[1] as canonical_id
    from public.conversations
    where direct_key is not null
    group by direct_key
    having count(*) > 1
  loop
    for duplicate_id in
      select id
      from public.conversations
      where direct_key = duplicate_group.direct_key
        and id <> duplicate_group.canonical_id
    loop
      update public.messages
      set conversation_id = duplicate_group.canonical_id
      where conversation_id = duplicate_id;

      update public.calls
      set conversation_id = duplicate_group.canonical_id
      where conversation_id = duplicate_id;

      update public.random_encounters
      set conversation_id = duplicate_group.canonical_id
      where conversation_id = duplicate_id;

      update public.notifications
      set action_id = duplicate_group.canonical_id
      where action_id = duplicate_id;

      delete from public.conversations where id = duplicate_id;
    end loop;
  end loop;
end;
$$;

create unique index if not exists conversations_direct_key_idx
  on public.conversations(direct_key)
  where type = 'buddy' and direct_key is not null;

create or replace function public.get_or_create_direct_conversation(
  p_other_user_id uuid,
  p_name text default 'Study buddy'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  pair_key text;
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if p_other_user_id is null or p_other_user_id = current_user_id then
    raise exception 'A direct conversation needs another participant.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'The other participant does not exist.' using errcode = '22023';
  end if;

  pair_key := public.direct_conversation_key(current_user_id, p_other_user_id);
  perform pg_advisory_xact_lock(hashtextextended(pair_key, 0));

  select id into conversation_id
  from public.conversations
  where type = 'buddy' and direct_key = pair_key
  limit 1;

  if conversation_id is not null then
    return conversation_id;
  end if;

  insert into public.conversations (type, name, created_by, direct_key)
  values ('buddy', coalesce(nullif(trim(p_name), ''), 'Study buddy'), current_user_id, pair_key)
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, current_user_id), (conversation_id, p_other_user_id);

  return conversation_id;
end;
$$;

create or replace function public.clear_conversation_history(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversation_members
  set history_cleared_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this conversation.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this conversation.' using errcode = '42501';
  end if;

  insert into public.message_reads (message_id, user_id)
  select m.id, auth.uid()
  from public.messages m
  where m.conversation_id = p_conversation_id
  on conflict (message_id, user_id) do update set read_at = now();
end;
$$;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists message_touch_conversation on public.messages;
create trigger message_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

drop policy if exists conversations_create_authenticated on public.conversations;
create policy conversations_create_authenticated
on public.conversations
for insert to authenticated
with check (created_by = auth.uid());

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

  new_conversation_id := public.get_or_create_direct_conversation(candidate_user_id, 'Random meet');

  insert into public.random_encounters (participant_ids, kind, conversation_id, status)
  values (array[candidate_user_id, current_user_id], p_kind, new_conversation_id, 'matched')
  returning id into new_encounter_id;

  return query
    select new_encounter_id, true, p_kind, new_conversation_id, array[candidate_user_id, current_user_id]::uuid[];
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid, text) from public;
grant execute on function public.get_or_create_direct_conversation(uuid, text) to authenticated;
revoke all on function public.clear_conversation_history(uuid) from public;
grant execute on function public.clear_conversation_history(uuid) to authenticated;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
