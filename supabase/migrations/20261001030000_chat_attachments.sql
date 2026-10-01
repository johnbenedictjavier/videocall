create or replace function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sender_name text;
  message_preview text;
begin
  select full_name into sender_name from public.profiles where id = new.sender_id;
  message_preview := case
    when new.message_type = 'image' then 'Shared an image in your study space.'
    when new.message_type = 'file' then 'Shared a file in your study space.'
    else left(new.content, 120)
  end;
  insert into public.notifications (user_id, type, title, body, action_id)
  select cm.user_id, 'message', coalesce(sender_name, 'A peer') || ' sent a message', message_preview, new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  return new;
end;
$$;
