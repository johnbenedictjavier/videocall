alter table public.random_reports
  add column category text not null default 'other',
  add column details text not null default '',
  add column status text not null default 'pending_review',
  add column context_message_ids uuid[] not null default '{}'::uuid[];

alter table public.random_reports
  add constraint random_reports_category_check
    check (char_length(trim(category)) between 1 and 50),
  add constraint random_reports_details_check
    check (char_length(details) <= 2000),
  add constraint random_reports_status_check
    check (status in ('pending_review', 'reviewing', 'resolved', 'dismissed')),
  add constraint random_reports_context_message_ids_check
    check (
      cardinality(context_message_ids) <= 20
      and array_position(context_message_ids, null) is null
    );

drop policy if exists random_reports_insert_self on public.random_reports;
create policy random_reports_insert_self
on public.random_reports
for insert to authenticated
with check (
  reporter_id = auth.uid()
  and status = 'pending_review'
  and exists (
    select 1
    from public.random_encounters re
    where re.id = random_reports.encounter_id
      and re.conversation_id is not null
      and auth.uid() = any(re.participant_ids)
      and random_reports.reported_id = any(re.participant_ids)
      and random_reports.reported_id <> auth.uid()
      and not exists (
        select 1
        from unnest(random_reports.context_message_ids) as context_message_id
        where not exists (
          select 1
          from public.messages m
          where m.id = context_message_id
            and m.conversation_id = re.conversation_id
        )
      )
  )
);

revoke update on table public.random_reports from anon, authenticated;

alter table public.calls
  add constraint calls_id_conversation_key unique (id, conversation_id);
alter table public.random_encounters
  add constraint random_encounters_id_conversation_key unique (id, conversation_id);

create table public.meeting_boards (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  call_id uuid unique,
  encounter_id uuid unique,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_by uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  constraint meeting_boards_call_conversation_fk
    foreign key (call_id, conversation_id)
    references public.calls(id, conversation_id) on delete cascade,
  constraint meeting_boards_encounter_conversation_fk
    foreign key (encounter_id, conversation_id)
    references public.random_encounters(id, conversation_id) on delete cascade,
  constraint meeting_boards_source_check check ((call_id is null) <> (encounter_id is null)),
  constraint meeting_boards_finalized_check check (
    (status = 'draft' and finalized_by is null and finalized_at is null)
    or (status = 'finalized' and finalized_by is not null and finalized_at is not null)
  )
);

create table public.meeting_board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.meeting_boards(id) on delete cascade,
  section text not null check (section in ('notes', 'goals', 'plans')),
  content text not null check (char_length(trim(content)) between 1 and 10000),
  position integer not null default 0 check (position >= 0),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meeting_boards_conversation_idx
  on public.meeting_boards(conversation_id, created_at desc);
create index meeting_board_items_board_order_idx
  on public.meeting_board_items(board_id, section, position, created_at);

create or replace function public.enforce_meeting_board_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.call_id is not null then
    if not exists (
      select 1
      from public.calls c
      where c.id = new.call_id
        and c.conversation_id = new.conversation_id
    ) then
      raise exception 'The call does not belong to the board conversation.' using errcode = '23514';
    end if;
  elsif new.encounter_id is not null then
    if not exists (
      select 1
      from public.random_encounters re
      where re.id = new.encounter_id
        and re.conversation_id = new.conversation_id
    ) then
      raise exception 'The encounter does not belong to the board conversation.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger meeting_board_source
before insert or update of conversation_id, call_id, encounter_id on public.meeting_boards
for each row execute function public.enforce_meeting_board_source();

create or replace function public.set_meeting_record_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger meeting_boards_updated_at
before update on public.meeting_boards
for each row execute function public.set_meeting_record_updated_at();

create trigger meeting_board_items_updated_at
before update on public.meeting_board_items
for each row execute function public.set_meeting_record_updated_at();

create or replace function public.require_draft_meeting_board()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_board_id uuid := case when tg_op = 'INSERT' then new.board_id else old.board_id end;
  target_board_status text;
begin
  select mb.status into target_board_status
  from public.meeting_boards mb
  where mb.id = target_board_id
  for update;

  if target_board_status is distinct from 'draft' then
    raise exception 'Finalized meeting boards cannot be changed.' using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and new.board_id <> old.board_id then
    select mb.status into target_board_status
    from public.meeting_boards mb
    where mb.id = new.board_id
    for update;

    if target_board_status is distinct from 'draft' then
      raise exception 'Meeting board items can only be moved to a draft board.' using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger meeting_board_items_require_draft
before insert or update or delete on public.meeting_board_items
for each row execute function public.require_draft_meeting_board();

alter table public.meeting_boards enable row level security;
alter table public.meeting_board_items enable row level security;

create or replace function public.is_meeting_board_participant(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.meeting_boards mb
    where mb.id = p_board_id
      and public.is_conversation_member(mb.conversation_id)
      and (
        exists (
          select 1 from public.calls c
          where c.id = mb.call_id
            and (c.caller_id = auth.uid() or auth.uid() = any(c.recipient_ids))
        )
        or exists (
          select 1 from public.random_encounters re
          where re.id = mb.encounter_id
            and auth.uid() = any(re.participant_ids)
        )
      )
  )
$$;

revoke all on function public.is_meeting_board_participant(uuid) from public;
grant execute on function public.is_meeting_board_participant(uuid) to authenticated;

create policy meeting_boards_read_members
on public.meeting_boards
for select to authenticated
using (public.is_meeting_board_participant(id));

create policy meeting_board_items_read_members
on public.meeting_board_items
for select to authenticated
using (
  public.is_meeting_board_participant(board_id)
);

create policy meeting_board_items_insert_members
on public.meeting_board_items
for insert to authenticated
with check (
  created_by = auth.uid()
  and updated_by = auth.uid()
  and public.is_meeting_board_participant(board_id)
  and exists (select 1 from public.meeting_boards mb where mb.id = board_id and mb.status = 'draft')
);

create policy meeting_board_items_update_members
on public.meeting_board_items
for update to authenticated
using (
  public.is_meeting_board_participant(board_id)
  and exists (select 1 from public.meeting_boards mb where mb.id = board_id and mb.status = 'draft')
)
with check (
  updated_by = auth.uid()
  and public.is_meeting_board_participant(board_id)
  and exists (select 1 from public.meeting_boards mb where mb.id = board_id and mb.status = 'draft')
);

create policy meeting_board_items_delete_members
on public.meeting_board_items
for delete to authenticated
using (
  public.is_meeting_board_participant(board_id)
  and exists (select 1 from public.meeting_boards mb where mb.id = board_id and mb.status = 'draft')
);

alter table public.messages
  add column meeting_board_id uuid unique references public.meeting_boards(id) on delete cascade;

alter table public.messages
  add constraint messages_meeting_board_type_check check (
    meeting_board_id is null or message_type = 'system'
  );

create or replace function public.enforce_meeting_notes_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.meeting_board_id is not null and not exists (
    select 1
    from public.meeting_boards mb
    where mb.id = new.meeting_board_id
      and mb.conversation_id = new.conversation_id
      and mb.status = 'finalized'
  ) then
    raise exception 'Meeting notes must reference a finalized board in the same conversation.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger meeting_notes_message_integrity
before insert or update of conversation_id, message_type, meeting_board_id on public.messages
for each row execute function public.enforce_meeting_notes_message();

drop policy if exists messages_insert_members on public.messages;
create policy messages_insert_members
on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(conversation_id)
  and meeting_board_id is null
);

create or replace function public.get_or_create_meeting_board(
  p_conversation_id uuid,
  p_call_id uuid default null,
  p_encounter_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  board_id uuid;
  lock_key text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_conversation_id is null or (p_call_id is null) = (p_encounter_id is null) then
    raise exception 'A board must belong to one call or encounter.' using errcode = '22023';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'You are not a member of this conversation.' using errcode = '42501';
  end if;

  if p_call_id is not null then
    if not exists (
      select 1
      from public.calls c
      where c.id = p_call_id
        and c.conversation_id = p_conversation_id
        and (c.caller_id = current_user_id or current_user_id = any(c.recipient_ids))
    ) then
      raise exception 'You are not a participant in this call.' using errcode = '42501';
    end if;
    lock_key := 'meeting-board-call:' || p_call_id::text;
  else
    if not exists (
      select 1
      from public.random_encounters re
      where re.id = p_encounter_id
        and re.conversation_id = p_conversation_id
        and current_user_id = any(re.participant_ids)
    ) then
      raise exception 'You are not a participant in this encounter.' using errcode = '42501';
    end if;
    lock_key := 'meeting-board-encounter:' || p_encounter_id::text;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select mb.id into board_id
  from public.meeting_boards mb
  where (p_call_id is not null and mb.call_id = p_call_id)
     or (p_encounter_id is not null and mb.encounter_id = p_encounter_id)
  limit 1;

  if board_id is null then
    insert into public.meeting_boards (
      conversation_id,
      call_id,
      encounter_id,
      created_by,
      updated_by
    ) values (
      p_conversation_id,
      p_call_id,
      p_encounter_id,
      current_user_id,
      current_user_id
    )
    returning id into board_id;
  end if;

  return board_id;
end;
$$;

create or replace function public.finalize_meeting_board(p_board_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  board_record public.meeting_boards%rowtype;
  message_id uuid;
  message_content text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select mb.* into board_record
  from public.meeting_boards mb
  where mb.id = p_board_id
  for update;

  if not found then
    raise exception 'Meeting board not found.' using errcode = 'P0002';
  end if;
  if not public.is_conversation_member(board_record.conversation_id) then
    raise exception 'You are not a member of this conversation.' using errcode = '42501';
  end if;
  if board_record.call_id is not null and not exists (
    select 1
    from public.calls c
    where c.id = board_record.call_id
      and (c.caller_id = current_user_id or current_user_id = any(c.recipient_ids))
  ) then
    raise exception 'You are not a participant in this call.' using errcode = '42501';
  end if;
  if board_record.encounter_id is not null and not exists (
    select 1
    from public.random_encounters re
    where re.id = board_record.encounter_id
      and current_user_id = any(re.participant_ids)
  ) then
    raise exception 'You are not a participant in this encounter.' using errcode = '42501';
  end if;

  if board_record.status = 'finalized' then
    select m.id into message_id
    from public.messages m
    where m.meeting_board_id = board_record.id;

    if message_id is null then
      raise exception 'The finalized board is missing its message.' using errcode = '23514';
    end if;
    return message_id;
  end if;

  select jsonb_build_object(
    'type', 'meeting_notes',
    'board_id', board_record.id,
    'sections', jsonb_build_object(
      'notes', coalesce(jsonb_agg(
        jsonb_build_object('id', mbi.id, 'content', mbi.content, 'position', mbi.position)
        order by mbi.position, mbi.created_at, mbi.id
      ) filter (where mbi.section = 'notes'), '[]'::jsonb),
      'goals', coalesce(jsonb_agg(
        jsonb_build_object('id', mbi.id, 'content', mbi.content, 'position', mbi.position)
        order by mbi.position, mbi.created_at, mbi.id
      ) filter (where mbi.section = 'goals'), '[]'::jsonb),
      'plans', coalesce(jsonb_agg(
        jsonb_build_object('id', mbi.id, 'content', mbi.content, 'position', mbi.position)
        order by mbi.position, mbi.created_at, mbi.id
      ) filter (where mbi.section = 'plans'), '[]'::jsonb)
    )
  )::text into message_content
  from public.meeting_board_items mbi
  where mbi.board_id = board_record.id;

  update public.meeting_boards
  set status = 'finalized',
      finalized_by = current_user_id,
      finalized_at = now(),
      updated_by = current_user_id
  where id = board_record.id;

  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    meeting_board_id
  ) values (
    board_record.conversation_id,
    current_user_id,
    message_content,
    'system',
    board_record.id
  )
  returning id into message_id;

  return message_id;
end;
$$;

revoke all on function public.get_or_create_meeting_board(uuid, uuid, uuid) from public;
grant execute on function public.get_or_create_meeting_board(uuid, uuid, uuid) to authenticated;
revoke all on function public.finalize_meeting_board(uuid) from public;
grant execute on function public.finalize_meeting_board(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_boards'
  ) then
    alter publication supabase_realtime add table public.meeting_boards;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_board_items'
  ) then
    alter publication supabase_realtime add table public.meeting_board_items;
  end if;
end;
$$;
