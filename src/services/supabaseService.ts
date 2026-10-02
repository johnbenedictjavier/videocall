import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { CallKind, CallRating, MatchBreakdown, MatchMode, MeetingBoard, MeetingBoardItem, MeetingBoardSection, Message, RandomEncounter, Skill, UserProfile } from '../types'
import { getMessagePreview } from '../utils/message'

export const signInWithPassword = async (email: string, password: string) => {
  if (!supabase) throw new Error('Supabase is not configured. Use Demo Login instead.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export const signUpWithPassword = async (payload: { email: string; password: string; fullName: string; username: string; course?: string; yearLevel?: string; school?: string; bio?: string; preferredStudyMode?: string }) => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: { data: { full_name: payload.fullName, username: payload.username, course: payload.course, year_level: payload.yearLevel, school: payload.school, bio: payload.bio, preferred_study_mode: payload.preferredStudyMode } },
  })
  if (error) throw error
  return data.user
}

export const signOutFromSupabase = async () => {
  if (supabase) await supabase.auth.signOut()
}

export const fetchRemoteProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!supabase) return null
  const [{ data: profile, error: profileError }, { data: skills }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_skills').select('kind, proficiency, level, skills(name, category)').eq('user_id', userId),
  ])
  if (profileError || !profile) return null
  const mappedSkills = (skills ?? []).map((row) => {
    const skill = Array.isArray(row.skills) ? row.skills[0] : row.skills
    return { kind: row.kind as 'strength' | 'weakness', skill: { name: String(skill?.name ?? 'New skill'), proficiency: Number(row.proficiency ?? 0), level: String(row.level ?? 'Beginner') as Skill['level'], category: skill?.category ? String(skill.category) : undefined } }
  })
  const row = profile as Record<string, unknown>
  return {
    id: userId,
    fullName: String(row.full_name ?? 'StudyMatch student'),
    username: String(row.username ?? 'student'),
    email: String(row.email ?? ''),
    course: String(row.course ?? 'Student'),
    yearLevel: String(row.year_level ?? 'New learner'),
    school: String(row.school ?? 'Add your school'),
    bio: String(row.bio ?? ''),
    avatar: String(row.avatar_path ?? `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(String(row.full_name ?? 'Student'))}`),
    preferredStudyMode: String(row.preferred_study_mode ?? 'Video call') as UserProfile['preferredStudyMode'],
    availability: Array.isArray(row.availability) ? row.availability as UserProfile['availability'] : [],
    learningInterests: Array.isArray(row.learning_interests) ? row.learning_interests.map(String) : [],
    strengths: mappedSkills.filter((item) => item.kind === 'strength').map((item) => item.skill),
    weaknesses: mappedSkills.filter((item) => item.kind === 'weakness').map((item) => item.skill),
    stats: (row.stats as UserProfile['stats']) ?? { buddySessions: 0, peerSessions: 0, studentsHelped: 0, learningHours: 0 },
    online: true,
  }
}

export const fetchRemoteProfiles = async (excludeId?: string) => {
  if (!supabase) return [] as UserProfile[]
  const { data, error } = await supabase.from('profiles').select('id').neq('id', excludeId ?? '')
  if (error) throw error
  const profiles = await Promise.all((data ?? []).map((row) => fetchRemoteProfile(String(row.id))))
  return profiles.filter((profile): profile is UserProfile => Boolean(profile))
}

export const fetchRemoteConversations = async (userId: string) => {
  if (!supabase) return { conversations: [], messages: [] as Message[] }
  const { data: rows, error } = await supabase.from('conversations').select('id, type, name, avatar_path, conversation_members(user_id, last_read_at, history_cleared_at)').order('updated_at', { ascending: false })
  if (error) throw error
  const baseConversations = (rows ?? []).map((row) => ({
    id: String(row.id),
    type: row.type as 'buddy' | 'peer',
    name: String(row.name ?? 'Study space'),
    memberIds: (row.conversation_members ?? []).map((member: { user_id: string }) => member.user_id),
    avatar: row.avatar_path ? String(row.avatar_path) : undefined,
    unreadCount: 0,
    online: true,
    members: row.conversation_members ?? [],
  })).filter((conversation) => conversation.memberIds.includes(userId))
  const ids = baseConversations.map((conversation) => conversation.id)
  if (!ids.length) return { conversations: [], messages: [] as Message[] }
  const { data: messageRows, error: messageError } = await supabase.from('messages').select('*, message_reads(user_id)').in('conversation_id', ids).order('created_at', { ascending: true })
  if (messageError) throw messageError
  const visibleRows = (messageRows ?? []).filter((row) => {
    const conversation = baseConversations.find((item) => item.id === String(row.conversation_id))
    const member = conversation?.members.find((item: { user_id: string }) => item.user_id === userId)
    return !member?.history_cleared_at || new Date(String(row.created_at)).getTime() > new Date(String(member.history_cleared_at)).getTime()
  })
  const messages: Message[] = await Promise.all(visibleRows.map(async (row) => {
    const attachmentPath = row.attachment_path ? String(row.attachment_path) : undefined
    let attachmentUrl: string | undefined
    if (attachmentPath && supabase) {
      const signed = await supabase.storage.from('chat-images').createSignedUrl(attachmentPath, 60 * 60)
      attachmentUrl = signed.data?.signedUrl
    }
    return { id: String(row.id), conversationId: String(row.conversation_id), senderId: String(row.sender_id), content: String(row.content ?? ''), kind: row.message_type as Message['kind'], attachmentPath, attachmentUrl, attachmentName: row.attachment_name ? String(row.attachment_name) : undefined, meetingBoardId: row.meeting_board_id ? String(row.meeting_board_id) : undefined, createdAt: String(row.created_at), readBy: Array.isArray(row.message_reads) ? row.message_reads.map((read: { user_id: string }) => String(read.user_id)) : [] }
  }))
  const conversations = baseConversations.map(({ members: _members, ...conversation }) => {
    const conversationMessages = messages.filter((message) => message.conversationId === conversation.id)
    const latest = conversationMessages[conversationMessages.length - 1]
    return {
      ...conversation,
      lastMessage: getMessagePreview(latest),
      lastMessageAt: latest?.createdAt,
      unreadCount: conversationMessages.filter((message) => message.senderId !== userId && !message.readBy.includes(userId)).length,
    }
  })
  return { conversations, messages }
}

export const fetchRemoteRequests = async (userId: string) => {
  if (!supabase) return [] as import('../types').MatchRequest[]
  const { data, error } = await supabase.from('match_requests').select('*').or(`sender_id.eq.${userId},recipient_id.eq.${userId}`).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({ id: String(row.id), remoteId: String(row.id), senderId: String(row.sender_id), recipientId: String(row.recipient_id), mode: row.mode as 'buddy' | 'peer', matchId: String(row.match_id), score: Number(row.score), status: row.status as import('../types').RequestStatus, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }))
}

export const fetchRemoteNotifications = async (userId: string) => {
  if (!supabase) return [] as import('../types').NotificationItem[]
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return (data ?? []).map((row) => ({ id: String(row.id), userId: String(row.user_id), type: row.type as import('../types').NotificationType, title: String(row.title), body: String(row.body), actionId: row.action_id ? String(row.action_id) : undefined, read: Boolean(row.read), createdAt: String(row.created_at) }))
}

export const sendPasswordReset = async (email: string) => {
  if (!supabase) throw new Error('Password reset is available after Supabase is configured.')
  const redirectUrl = new URL('./', window.location.href)
  redirectUrl.hash = ''
  redirectUrl.search = ''
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl.toString() })
  if (error) throw error
}

export const insertMessage = async (message: Omit<Message, 'id'>) => {
  if (!supabase) return null
  const { data, error } = await supabase.from('messages').insert({
    conversation_id: message.conversationId,
    sender_id: message.senderId,
    content: message.content,
    message_type: message.kind,
    attachment_path: message.attachmentPath ?? message.attachmentUrl ?? null,
    attachment_name: message.attachmentName ?? null,
    created_at: message.createdAt,
  }).select().single()
  if (error) throw error
  return data
}

export const insertMatchRequest = async (request: {
  senderId: string
  recipientId: string
  matchId: string
  mode: 'buddy' | 'peer'
  score: number
}) => {
  if (!supabase) return null
  const { data, error } = await supabase.from('match_requests').insert({
    sender_id: request.senderId,
    recipient_id: request.recipientId,
    match_id: request.matchId,
    mode: request.mode,
    score: request.score,
  }).select().single()
  if (error) throw error
  return data
}

export const insertCalculatedMatch = async (payload: { createdBy: string; memberIds: string[]; mode: 'buddy' | 'peer'; score: number; breakdown: MatchBreakdown }) => {
  if (!supabase) return null
  if (payload.mode === 'buddy' && payload.memberIds.length !== 2) throw new Error('A Study Buddy match needs exactly two members.')
  if (payload.mode === 'peer' && (payload.memberIds.length < 3 || payload.memberIds.length > 5)) throw new Error('A Peer match must have between three and five members.')
  const { data: match, error } = await supabase.from('matches').insert({ created_by: payload.createdBy, mode: payload.mode, score: payload.score, score_breakdown: payload.breakdown }).select('id').single()
  if (error) throw error
  const { error: membersError } = await supabase.from('match_members').insert(payload.memberIds.map((userId) => ({ match_id: match.id, user_id: userId })))
  if (membersError) throw membersError
  return match
}

export const updateMatchRequest = async (id: string, status: 'accepted' | 'declined' | 'skipped') => {
  if (!supabase) return null
  const { data, error } = await supabase.from('match_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export const createRemoteConversation = async (payload: { type: 'buddy' | 'peer'; name: string; memberIds: string[]; createdBy: string; matchId?: string }) => {
  if (!supabase) return null
  if (payload.type === 'buddy' && payload.memberIds.length !== 2) throw new Error('A Study Buddy conversation needs exactly two members.')
  if (payload.type === 'peer' && (payload.memberIds.length < 3 || payload.memberIds.length > 5)) throw new Error('A Peer conversation must have between three and five members.')
  if (payload.type === 'buddy' && payload.memberIds.length === 2) {
    const otherUserId = payload.memberIds.find((memberId) => memberId !== payload.createdBy)
    if (!otherUserId) throw new Error('A direct conversation needs another participant.')
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { p_other_user_id: otherUserId, p_name: payload.name })
    if (error) throw error
    return data ? { id: String(data) } : null
  }
  const { data: conversation, error } = await supabase.from('conversations').insert({ type: payload.type, name: payload.name, created_by: payload.createdBy, match_id: payload.matchId ?? null }).select('id').single()
  if (error) throw error
  const { error: membersError } = await supabase.from('conversation_members').insert(payload.memberIds.map((userId) => ({ conversation_id: conversation.id, user_id: userId })))
  if (membersError) throw membersError
  return conversation
}

export const uploadChatAttachment = async (file: File, userId: string, conversationId: string) => {
  if (!supabase) return null
  if (file.size > 12 * 1024 * 1024) throw new Error('Files must be smaller than 12MB.')
  const path = `${userId}/${conversationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '-')}`
  const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  const { data, error } = await supabase.storage.from('chat-images').createSignedUrl(path, 60 * 60 * 24)
  if (error) throw error
  return { path, url: data.signedUrl }
}

export const subscribeToConversation = (conversationId: string, callback: (message: Message) => void): RealtimeChannel | null => {
  if (!supabase) return null
  const client = supabase
  return client
    .channel(`conversation:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const row = payload.new as Record<string, unknown>
      void (async () => {
        const attachmentPath = row.attachment_path ? String(row.attachment_path) : undefined
        let attachmentUrl: string | undefined
        if (attachmentPath) {
          const signed = await client.storage.from('chat-images').createSignedUrl(attachmentPath, 60 * 60)
          attachmentUrl = signed.data?.signedUrl
        }
        callback({
          id: String(row.id),
          conversationId: String(row.conversation_id),
          senderId: String(row.sender_id),
          content: String(row.content ?? ''),
          kind: (row.message_type as Message['kind']) ?? 'text',
          attachmentPath,
          attachmentUrl,
          attachmentName: row.attachment_name ? String(row.attachment_name) : undefined,
          meetingBoardId: row.meeting_board_id ? String(row.meeting_board_id) : undefined,
          createdAt: String(row.created_at),
          readBy: [],
        })
      })()
    })
    .subscribe()
}

export const subscribeToUserEvents = (userId: string, onEvent: (payload: Record<string, unknown>, meta?: { table: string; event: string }) => void): RealtimeChannel | null => {
  if (!supabase) return null
  const emit = (payload: Record<string, unknown>, table: string, event: string) => onEvent(payload, { table, event })
  return supabase
    .channel(`user-events:${userId}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests', filter: `recipient_id=eq.${userId}` }, (payload) => emit((payload.new ?? payload.old) as Record<string, unknown>, 'match_requests', 'CHANGE'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests', filter: `sender_id=eq.${userId}` }, (payload) => emit((payload.new ?? payload.old) as Record<string, unknown>, 'match_requests', 'CHANGE'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => emit(payload.new as Record<string, unknown>, 'notifications', 'INSERT'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, (payload) => emit(payload.new as Record<string, unknown>, 'calls', 'INSERT'))
    .subscribe()
}

export const markRemoteNotificationRead = async (notificationId: string, userId: string) => {
  if (!supabase) return
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notificationId).eq('user_id', userId)
  if (error) throw error
}

export const markRemoteConversationRead = async (conversationId: string) => {
  if (!supabase) return
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
  if (error) throw error
}

export const clearRemoteConversationHistory = async (conversationId: string) => {
  if (!supabase) return
  const { error } = await supabase.rpc('clear_conversation_history', { p_conversation_id: conversationId })
  if (error) throw error
}

const getFunctionErrorMessage = async (error: unknown) => {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    const status = context.status ? ` (${context.status})` : ''
    try {
      const body = await context.clone().json() as { error?: string; message?: string }
      if (body.error || body.message) return `${body.error ?? body.message}${status}`
    } catch {
      // Keep the SDK message when the function did not return JSON.
    }
    return `The call service returned an error${status}.`
  }
  return error instanceof Error ? error.message : 'The call service could not be reached.'
}

export const fetchIncomingCall = async (userId: string) => {
  if (!supabase) return null
  const { data, error } = await supabase.from('calls').select('*').contains('recipient_ids', [userId]).eq('status', 'ringing').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as Record<string, unknown> | null
}

export const createDailyRoom = async (conversationId: string, kind: 'voice' | 'video', callId?: string) => {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('create-daily-room', { body: { conversationId, kind, callId } })
  if (error) throw new Error(await getFunctionErrorMessage(error))
  if (!data?.roomUrl || !data?.token) throw new Error(data?.error ?? 'The live call room could not be created.')
  return data as { roomUrl: string; roomName: string; token: string; startedAt: string; expiresAt: string }
}

export const createCallInvite = async (payload: { conversationId: string; callerId: string; recipientIds: string[]; kind: 'voice' | 'video' }) => {
  if (!supabase) return null
  if (!payload.recipientIds.length) throw new Error('This study space has no other participants to call.')
  if (payload.recipientIds.length + 1 > 5) throw new Error('Calls can have a maximum of five members.')
  const { data, error } = await supabase.from('calls').insert({
    conversation_id: payload.conversationId,
    caller_id: payload.callerId,
    recipient_ids: payload.recipientIds,
    kind: payload.kind,
    status: 'ringing',
  }).select().single()
  if (error) throw error
  return data
}

const mapRandomEncounter = (row: Record<string, unknown>): RandomEncounter => ({
  id: String(row.id),
  participantIds: Array.isArray(row.participant_ids) ? row.participant_ids.map(String) : [],
  kind: row.kind as CallKind,
  mode: row.mode === 'peer' ? 'peer' : 'buddy',
  maxMembers: Number(row.max_members ?? (row.mode === 'peer' ? 5 : 2)),
  conversationId: row.conversation_id ? String(row.conversation_id) : undefined,
  status: row.status as RandomEncounter['status'],
  roomName: row.room_name ? String(row.room_name) : undefined,
  roomUrl: row.room_url ? String(row.room_url) : undefined,
  createdAt: String(row.created_at),
  startedAt: row.started_at ? String(row.started_at) : undefined,
  endedAt: row.ended_at ? String(row.ended_at) : undefined,
})

export const hasAcceptedRandomRules = async (userId: string, version = 'random-meet-v1') => {
  if (!supabase) return false
  const { data, error } = await supabase.from('rule_acceptances').select('user_id').eq('user_id', userId).eq('version', version).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export const acceptRandomRules = async (userId: string, version = 'random-meet-v1') => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('rule_acceptances').upsert({ user_id: userId, version }, { onConflict: 'user_id,version' })
  if (error) throw error
}

export const joinRandomQueue = async (kind: CallKind, mode: MatchMode = 'buddy', maxMembers = mode === 'peer' ? 5 : 2) => {
  if (!supabase) throw new Error('Supabase is not configured. Use a real account for cross-phone matching.')
  const { data, error } = await supabase.rpc('join_meet_queue', { p_kind: kind, p_mode: mode, p_max_members: maxMembers })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.encounter_id) return null
  return mapRandomEncounter({
    id: row.encounter_id,
    participant_ids: row.participant_ids,
    kind: row.encounter_kind,
    mode: row.encounter_mode,
    max_members: row.encounter_max_members,
    conversation_id: row.conversation_id,
    status: 'matched',
    created_at: new Date().toISOString(),
  })
}

export const fetchRandomEncounter = async (userId: string) => {
  if (!supabase) return null
  const { data, error } = await supabase.from('random_encounters').select('*').contains('participant_ids', [userId]).in('status', ['matched', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data ? mapRandomEncounter(data as Record<string, unknown>) : null
}

export const leaveRandomQueue = async () => {
  if (!supabase) return
  const { error } = await supabase.rpc('leave_random_queue')
  if (error) throw error
}

export const finishRandomEncounter = async (encounterId: string, status: 'ended' | 'skipped' = 'ended') => {
  if (!supabase) return
  const { error } = await supabase.rpc('finish_random_encounter', { p_encounter_id: encounterId, p_status: status })
  if (error) throw error
}

export const blockRandomUser = async (userId: string, blockedUserId: string) => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('random_blocks').upsert({ blocker_id: userId, blocked_id: blockedUserId }, { onConflict: 'blocker_id,blocked_id' })
  if (error) throw error
}

export const reportRandomUser = async (userId: string, reportedUserId: string, encounterId: string, category: string, details: string, contextMessageIds: string[] = []) => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('random_reports').insert({ reporter_id: userId, reported_id: reportedUserId, encounter_id: encounterId, reason: category, category, details, status: 'pending_review', context_message_ids: contextMessageIds.slice(0, 20) })
  if (error) throw error
}

export const createDailyEncounterRoom = async (encounterId: string, kind: CallKind) => {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('create-daily-room', { body: { encounterId, kind } })
  if (error) throw new Error(await getFunctionErrorMessage(error))
  if (!data?.roomUrl || !data?.token) throw new Error(data?.error ?? 'The live encounter room could not be created.')
  return data as { roomUrl: string; roomName: string; token: string; startedAt: string; expiresAt: string }
}

export const updateCallStatus = async (callId: string, status: 'declined' | 'ended') => {
  if (!supabase || !callId) return
  const { error } = await supabase.from('calls').update({ status, ended_at: new Date().toISOString() }).eq('id', callId)
  if (error) throw error
}

export const submitCallRating = async (rating: CallRating) => {
  if (!supabase) return
  const { error } = await supabase.rpc('submit_call_rating', {
    p_call_id: rating.callId ?? null,
    p_encounter_id: rating.encounterId ?? null,
    p_ratee_id: rating.rateeId,
    p_rating: rating.rating,
    p_feedback: rating.feedback?.trim() || null,
  })
  if (error) throw error
}

const mapBoardItem = (row: Record<string, unknown>): MeetingBoardItem => ({
  id: String(row.id),
  boardId: String(row.board_id),
  section: row.section as MeetingBoardSection,
  content: String(row.content ?? ''),
  position: Number(row.position ?? 0),
  createdBy: String(row.created_by),
  updatedBy: String(row.updated_by),
  updatedAt: String(row.updated_at),
})

export const getOrCreateMeetingBoard = async (payload: { conversationId: string; callId?: string; encounterId?: string }) => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: boardId, error } = await supabase.rpc('get_or_create_meeting_board', { p_conversation_id: payload.conversationId, p_call_id: payload.callId ?? null, p_encounter_id: payload.encounterId ?? null })
  if (error) throw error
  const { data: board, error: boardError } = await supabase.from('meeting_boards').select('id, conversation_id, status').eq('id', boardId).single()
  if (boardError) throw boardError
  const { data: items, error: itemsError } = await supabase.from('meeting_board_items').select('*').eq('board_id', boardId).order('position').order('created_at')
  if (itemsError) throw itemsError
  return {
    board: { id: String(board.id), conversationId: String(board.conversation_id), status: board.status as MeetingBoard['status'] },
    items: (items ?? []).map((item) => mapBoardItem(item as Record<string, unknown>)),
  }
}

export const addMeetingBoardItem = async (boardId: string, section: MeetingBoardSection, content: string, position: number, userId: string) => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('meeting_board_items').insert({ board_id: boardId, section, content, position, created_by: userId, updated_by: userId }).select('*').single()
  if (error) throw error
  return mapBoardItem(data as Record<string, unknown>)
}

export const updateMeetingBoardItem = async (itemId: string, content: string, userId: string) => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('meeting_board_items').update({ content, updated_by: userId }).eq('id', itemId).select('*').single()
  if (error) throw error
  return mapBoardItem(data as Record<string, unknown>)
}

export const deleteMeetingBoardItem = async (itemId: string) => {
  if (!supabase) return
  const { error } = await supabase.from('meeting_board_items').delete().eq('id', itemId)
  if (error) throw error
}

export const subscribeToMeetingBoard = (boardId: string, onChange: () => void): RealtimeChannel | null => {
  if (!supabase) return null
  return supabase.channel(`meeting-board:${boardId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_board_items', filter: `board_id=eq.${boardId}` }, onChange).subscribe()
}

export const fetchMeetingBoardItems = async (boardId: string) => {
  if (!supabase) return [] as MeetingBoardItem[]
  const { data, error } = await supabase.from('meeting_board_items').select('*').eq('board_id', boardId).order('position').order('created_at')
  if (error) throw error
  return (data ?? []).map((item) => mapBoardItem(item as Record<string, unknown>))
}

export const finalizeMeetingBoard = async (boardId: string) => {
  if (!supabase) return
  const { error } = await supabase.rpc('finalize_meeting_board', { p_board_id: boardId })
  if (error) throw error
}
