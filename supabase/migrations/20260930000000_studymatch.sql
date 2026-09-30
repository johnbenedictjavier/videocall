create extension if not exists pgcrypto;

do $$ begin
  create type public.skill_kind as enum ('strength', 'weakness');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_mode as enum ('buddy', 'peer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'accepted', 'declined', 'skipped');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_kind as enum ('text', 'image', 'file', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_kind as enum ('voice', 'video');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  email text,
  course text default 'Student',
  year_level text default 'New learner',
  school text default 'Add your school',
  bio text default '',
  avatar_path text,
  preferred_study_mode text default 'Video call',
  learning_interests jsonb not null default '[]'::jsonb,
  availability jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{"buddySessions":0,"peerSessions":0,"studentsHelped":0,"learningHours":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  kind public.skill_kind not null,
  proficiency integer not null default 0 check (proficiency between 0 and 100),
  level text not null default 'Beginner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, skill_id, kind)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  mode public.match_mode not null,
  score numeric(5,2) not null check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'suggested',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_members (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists public.match_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  mode public.match_mode not null,
  score numeric(5,2) not null check (score between 0 and 100),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create table if not exists public.peer_groups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete set null,
  name text not null default 'Study group',
  recommended_topic text,
  shared_learning_goals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.peer_group_members (
  group_id uuid not null references public.peer_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.match_mode not null,
  name text,
  avatar_path text,
  created_by uuid references public.profiles(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  message_type public.message_kind not null default 'text',
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  recipient_ids uuid[] not null default '{}',
  kind public.call_kind not null,
  status text not null default 'ringing',
  room_name text,
  room_url text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.call_participants (
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index if not exists user_skills_user_idx on public.user_skills(user_id);
create index if not exists user_skills_skill_idx on public.user_skills(skill_id);
create index if not exists requests_recipient_idx on public.match_requests(recipient_id, status);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists notifications_user_idx on public.notifications(user_id, read, created_at desc);
create index if not exists calls_recipient_idx on public.calls using gin(recipient_ids);

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists user_skills_updated_at on public.user_skills;
create trigger user_skills_updated_at before update on public.user_skills for each row execute function public.set_updated_at();
drop trigger if exists matches_updated_at on public.matches;
create trigger matches_updated_at before update on public.matches for each row execute function public.set_updated_at();
drop trigger if exists requests_updated_at on public.match_requests;
create trigger requests_updated_at before update on public.match_requests for each row execute function public.set_updated_at();
drop trigger if exists peer_groups_updated_at on public.peer_groups;
create trigger peer_groups_updated_at before update on public.peer_groups for each row execute function public.set_updated_at();
drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, username, course, year_level, school, bio, preferred_study_mode)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'student'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', 'student_' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data->>'course', 'Student'),
    coalesce(new.raw_user_meta_data->>'year_level', 'New learner'),
    coalesce(new.raw_user_meta_data->>'school', 'Add your school'),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    coalesce(new.raw_user_meta_data->>'preferred_study_mode', 'Video call')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.notify_match_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare sender_name text;
begin
  select full_name into sender_name from public.profiles where id = new.sender_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, title, body, action_id)
    values (new.recipient_id, 'request', 'New buddy request', coalesce(sender_name, 'A student') || ' wants to study with you.', new.id);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.notifications (user_id, type, title, body, action_id)
    values (new.sender_id, 'accepted', 'Buddy request accepted', coalesce((select full_name from public.profiles where id = new.recipient_id), 'Your peer') || ' accepted your study request.', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists match_request_notification on public.match_requests;
create trigger match_request_notification after insert or update of status on public.match_requests for each row execute function public.notify_match_request();

create or replace function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare sender_name text;
begin
  select full_name into sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications (user_id, type, title, body, action_id)
  select cm.user_id, 'message', coalesce(sender_name, 'A peer') || ' sent a message', case when new.message_type = 'image' then 'Shared an image in your study space.' else left(new.content, 120) end, new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  return new;
end;
$$;

drop trigger if exists message_notification on public.messages;
create trigger message_notification after insert on public.messages for each row execute function public.notify_new_message();

create or replace function public.notify_incoming_call() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, action_id)
  select recipient, 'call', 'Incoming ' || new.kind || ' call', coalesce((select full_name from public.profiles where id = new.caller_id), 'A peer') || ' is calling you.', new.id
  from unnest(new.recipient_ids) as recipient;
  return new;
end;
$$;

drop trigger if exists call_notification on public.calls;
create trigger call_notification after insert on public.calls for each row execute function public.notify_incoming_call();

create or replace function public.is_conversation_member(target_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = target_conversation and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peer_group_members
    where group_id = target_group and user_id = auth.uid()
  );
$$;

create or replace function public.is_match_member(target_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.match_members
    where match_id = target_match and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.matches enable row level security;
alter table public.match_members enable row level security;
alter table public.match_requests enable row level security;
alter table public.peer_groups enable row level security;
alter table public.peer_group_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.notifications enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists skills_read_authenticated on public.skills;
create policy skills_read_authenticated on public.skills for select to authenticated using (true);
drop policy if exists user_skills_read_authenticated on public.user_skills;
create policy user_skills_read_authenticated on public.user_skills for select to authenticated using (true);
drop policy if exists user_skills_manage_self on public.user_skills;
create policy user_skills_manage_self on public.user_skills for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists matches_read_participants on public.matches;
create policy matches_read_participants on public.matches for select to authenticated using (created_by = auth.uid() or is_match_member(id));
drop policy if exists matches_insert_owner on public.matches;
create policy matches_insert_owner on public.matches for insert to authenticated with check (created_by = auth.uid());
drop policy if exists match_members_read_self on public.match_members;
create policy match_members_read_self on public.match_members for select to authenticated using (user_id = auth.uid() or is_match_member(match_id));
drop policy if exists match_members_insert_owner on public.match_members;
create policy match_members_insert_owner on public.match_members for insert to authenticated with check (user_id = auth.uid() or exists (select 1 from public.matches m where m.id = match_id and m.created_by = auth.uid()));

drop policy if exists requests_read_sender_or_recipient on public.match_requests;
create policy requests_read_sender_or_recipient on public.match_requests for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists requests_insert_sender on public.match_requests;
create policy requests_insert_sender on public.match_requests for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists requests_update_recipient on public.match_requests;
create policy requests_update_recipient on public.match_requests for update to authenticated using (recipient_id = auth.uid() or sender_id = auth.uid()) with check (recipient_id = auth.uid() or sender_id = auth.uid());

drop policy if exists groups_read_members on public.peer_groups;
create policy groups_read_members on public.peer_groups for select to authenticated using (is_group_member(id));
drop policy if exists group_members_read_members on public.peer_group_members;
create policy group_members_read_members on public.peer_group_members for select to authenticated using (is_group_member(group_id) or user_id = auth.uid());
drop policy if exists group_members_join_self on public.peer_group_members;
create policy group_members_join_self on public.peer_group_members for insert to authenticated with check (user_id = auth.uid());

drop policy if exists conversations_read_members on public.conversations;
create policy conversations_read_members on public.conversations for select to authenticated using (is_conversation_member(id));
drop policy if exists conversations_create_authenticated on public.conversations;
create policy conversations_create_authenticated on public.conversations for insert to authenticated with check (true);
drop policy if exists conversation_members_read_members on public.conversation_members;
create policy conversation_members_read_members on public.conversation_members for select to authenticated using (is_conversation_member(conversation_id) or user_id = auth.uid());
drop policy if exists conversation_members_join_self on public.conversation_members;
create policy conversation_members_join_self on public.conversation_members for insert to authenticated with check (user_id = auth.uid() or is_conversation_member(conversation_id) or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid()));

drop policy if exists messages_read_members on public.messages;
create policy messages_read_members on public.messages for select to authenticated using (is_conversation_member(conversation_id));
drop policy if exists messages_insert_members on public.messages;
create policy messages_insert_members on public.messages for insert to authenticated with check (sender_id = auth.uid() and is_conversation_member(conversation_id));
drop policy if exists message_reads_read_members on public.message_reads;
create policy message_reads_read_members on public.message_reads for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.messages m where m.id = message_id and is_conversation_member(m.conversation_id)));
drop policy if exists message_reads_manage_self on public.message_reads;
create policy message_reads_manage_self on public.message_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_read_self on public.notifications;
create policy notifications_read_self on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists calls_read_participants on public.calls;
create policy calls_read_participants on public.calls for select to authenticated using (caller_id = auth.uid() or auth.uid() = any(recipient_ids) or is_conversation_member(conversation_id));
drop policy if exists calls_insert_member on public.calls;
create policy calls_insert_member on public.calls for insert to authenticated with check (caller_id = auth.uid() and is_conversation_member(conversation_id));
drop policy if exists calls_update_participants on public.calls;
create policy calls_update_participants on public.calls for update to authenticated using (caller_id = auth.uid() or auth.uid() = any(recipient_ids)) with check (caller_id = auth.uid() or auth.uid() = any(recipient_ids));
drop policy if exists call_participants_read_self on public.call_participants;
create policy call_participants_read_self on public.call_participants for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.calls c where c.id = call_id and (c.caller_id = auth.uid() or auth.uid() = any(c.recipient_ids))));
drop policy if exists call_participants_manage_self on public.call_participants;
create policy call_participants_manage_self on public.call_participants for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('chat-images', 'chat-images', false) on conflict (id) do nothing;

drop policy if exists avatar_read_authenticated on storage.objects;
create policy avatar_read_authenticated on storage.objects for select to authenticated using (bucket_id = 'avatars');
drop policy if exists avatar_upload_self on storage.objects;
create policy avatar_upload_self on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatar_update_self on storage.objects;
create policy avatar_update_self on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists chat_image_read_member on storage.objects;
create policy chat_image_read_member on storage.objects for select to authenticated using (bucket_id = 'chat-images' and public.is_conversation_member(((storage.foldername(name))[2])::uuid));
drop policy if exists chat_image_upload_member on storage.objects;
create policy chat_image_upload_member on storage.objects for insert to authenticated with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text and public.is_conversation_member(((storage.foldername(name))[2])::uuid));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_requests') then
    alter publication supabase_realtime add table public.match_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls') then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;

insert into public.skills (name, slug, category) values
  ('Database', 'database', 'Data'),
  ('SQL', 'sql', 'Data'),
  ('Java OOP', 'java-oop', 'Programming'),
  ('Inheritance', 'inheritance', 'Programming'),
  ('Polymorphism', 'polymorphism', 'Programming'),
  ('Algorithms', 'algorithms', 'Computer Science'),
  ('Data Structures', 'data-structures', 'Computer Science'),
  ('Graph Theory', 'graph-theory', 'Computer Science'),
  ('Python', 'python', 'Programming'),
  ('Pandas', 'pandas', 'Data'),
  ('React', 'react', 'Programming'),
  ('TypeScript', 'typescript', 'Programming'),
  ('UI/UX Design', 'ui-ux-design', 'Design'),
  ('Figma', 'figma', 'Design'),
  ('Statistics', 'statistics', 'Mathematics'),
  ('Probability', 'probability', 'Mathematics'),
  ('Networking', 'networking', 'Systems'),
  ('Linux', 'linux', 'Systems'),
  ('Presentation', 'presentation', 'Communication'),
  ('Data Visualization', 'data-visualization', 'Data'),
  ('Software Testing', 'software-testing', 'Engineering')
on conflict (slug) do nothing;
