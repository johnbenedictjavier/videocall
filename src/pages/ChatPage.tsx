import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Camera, Download, FileImage, FileText, Info, Loader2, MoreHorizontal, Paperclip, Phone, Send, Trash2, UsersRound, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { demoProfiles } from '../data/demoData'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useCalls } from '../context/CallContext'
import { useTyping } from '../hooks/useTyping'
import { fetchRemoteProfile } from '../services/supabaseService'
import { cn } from '../utils/cn'
import { formatFullDate, formatTime } from '../utils/format'
import { Avatar, Button, IconButton, Pill, ReadState } from '../components/ui'
import type { Message, UserProfile } from '../types'

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

function RichMessage({ content, mine }: { content: string; mine: boolean }) {
  return <>{content.split(URL_PATTERN).map((part, index) => part.match(URL_PATTERN) ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer noopener" className={cn('break-all font-bold underline decoration-moss/30 underline-offset-2 hover:decoration-moss', mine ? 'text-white' : 'text-moss')}>{part}</a> : <span key={`${part}-${index}`}>{part}</span>)}</>
}

function MessageAttachment({ message, mine, onImage }: { message: Message; mine: boolean; onImage: (url: string) => void }) {
  if (message.kind === 'system' && message.meetingBoardId) {
    let sections: Record<string, { content: string }[]> = {}
    try { sections = (JSON.parse(message.content) as { sections?: Record<string, { content: string }[]> }).sections ?? {} } catch { /* Keep an empty card if old data is malformed. */ }
    return <div className="min-w-[220px]"><div className="flex items-center gap-2 font-extrabold"><FileText size={17} />Meeting notes</div>{['notes', 'goals', 'plans'].map((section) => sections[section]?.length ? <div key={section} className="mt-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-60">{section}</p><ul className="mt-1 space-y-1">{sections[section].map((item, index) => <li key={index} className="text-xs">• {item.content}</li>)}</ul></div> : null)}</div>
  }
  if (message.kind === 'image') {
    if (!message.attachmentUrl) return <div className="flex items-center gap-2"><FileImage size={18} /><span>{message.attachmentName ?? 'Shared image'}</span></div>
    return <button type="button" onClick={() => onImage(message.attachmentUrl!)} className="group relative block overflow-hidden rounded-xl"><img src={message.attachmentUrl} alt={message.attachmentName ?? 'Shared study image'} className="max-h-64 w-full object-cover transition group-hover:scale-[1.02]" /><span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/45 px-2 py-1 text-left text-[10px] text-white opacity-0 transition group-hover:opacity-100">Open image</span></button>
  }
  if (message.kind === 'file') {
    if (!message.attachmentUrl) return <div className="flex items-center gap-2"><FileText size={18} /><span className="break-all">{message.attachmentName ?? 'Shared file'}</span></div>
    return <a href={message.attachmentUrl} download={message.attachmentName} target="_blank" rel="noreferrer noopener" className={cn('flex min-w-44 items-center gap-3 rounded-xl px-1 py-1 font-bold underline-offset-2 hover:underline', mine ? 'text-white' : 'text-moss')}><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', mine ? 'bg-white/15' : 'bg-mint')}><FileText size={17} /></span><span className="min-w-0 flex-1 break-all text-left text-xs">{message.attachmentName ?? 'Shared file'}</span><Download size={15} className="shrink-0" /></a>
  }
  return <RichMessage content={message.content} mine={mine} />
}

function MessageBubble({ message, mine, grouped, peer, sender, onImage }: { message: Message; mine: boolean; grouped: boolean; peer: boolean; sender?: UserProfile; onImage: (url: string) => void }) {
  const showIdentity = peer && !mine && !grouped
  return <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
    {peer && !mine && <div className="flex w-8 shrink-0 items-end">{!grouped && <Avatar src={sender?.avatar} name={sender?.fullName ?? 'Peer'} size="xs" online={sender?.online} />}</div>}
    <div className={cn('max-w-[82%] sm:max-w-[70%]', mine ? 'items-end' : 'items-start', grouped ? 'mt-1' : 'mt-4')}>
      {showIdentity && <p className="mb-1 px-1 text-[10px] font-extrabold text-[#718077]">{sender?.fullName ?? 'Peer'}</p>}
      <div className={cn('overflow-hidden px-4 py-3 text-sm leading-6 shadow-sm', mine ? 'rounded-[20px] rounded-br-md bg-moss text-white' : 'rounded-[20px] rounded-bl-md border border-[#e4ece4] bg-white text-[#4f5d54]')}><MessageAttachment message={message} mine={mine} onImage={onImage} /></div>
      <div className={cn('mt-1 flex items-center gap-1.5 px-1 text-[10px] text-[#9aa59d]', mine && 'justify-end')}><span>{formatTime(message.createdAt)}</span>{mine && <ReadState read={message.readBy.length > 1} />}</div>
    </div>
  </div>
}

export function ChatPage() {
  const { conversationId } = useParams()
  const { currentUser, isDemo } = useAuth()
  const { getConversation, getConversationMessages, sendMessage, sendAttachmentMessage, markConversationRead, clearConversationHistory } = useAppData()
  const { startCall } = useCalls()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<string | null>(null)
  const [remoteMembers, setRemoteMembers] = useState<UserProfile[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const conversation = conversationId ? getConversation(conversationId) : undefined
  const messages = conversationId ? getConversationMessages(conversationId) : []
  const { typingName, notifyTyping } = useTyping(conversationId, currentUser?.id, currentUser?.fullName)

  useEffect(() => {
    if (!conversation || isDemo) {
      setRemoteMembers([])
      return
    }
    let active = true
    void Promise.all(conversation.memberIds.map((memberId) => fetchRemoteProfile(memberId))).then((profiles) => {
      if (active) setRemoteMembers(profiles.filter((profile): profile is UserProfile => Boolean(profile)))
    }).catch(() => {
      if (active) setRemoteMembers([])
    })
    return () => {
      active = false
    }
  }, [conversation?.id, conversation?.memberIds, isDemo])

  const memberDirectory = useMemo(() => [...demoProfiles, ...remoteMembers], [remoteMembers])
  const otherMember = conversation ? memberDirectory.find((profile) => profile.id === conversation.memberIds.find((id) => id !== currentUser?.id)) : undefined
  const displayName = conversation?.type === 'buddy' && otherMember ? otherMember.fullName : conversation?.name
  const memberProfiles = useMemo(() => conversation?.memberIds.map((id) => memberDirectory.find((profile) => profile.id === id)).filter((profile): profile is UserProfile => Boolean(profile)) ?? [], [conversation?.memberIds, memberDirectory])

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId)
  }, [conversationId, markConversationRead])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, typingName])

  if (!currentUser || !conversation) return <div className="py-20 text-center"><Loader2 className="mx-auto animate-spin text-moss" /><p className="mt-3 text-sm text-[#7b887f]">Opening study space...</p></div>

  const submitMessage = async () => {
    const value = draft.trim()
    if (!value || sending) return
    setSending(true)
    setError('')
    try {
      await sendMessage(conversation.id, value)
      setDraft('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  const chooseAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSending(true)
    setError('')
    try {
      await sendAttachmentMessage(conversation.id, file)
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'The attachment could not be sent.')
    } finally {
      setSending(false)
    }
  }

  const clearHistory = async () => {
    if (!window.confirm('Clear this conversation history for you?')) return
    setClearing(true)
    setError('')
    try {
      await clearConversationHistory(conversation.id)
      setMenuOpen(false)
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'History could not be cleared.')
    } finally {
      setClearing(false)
    }
  }

  return <div className="-mx-4 -mt-6 flex h-[calc(100dvh-100px)] min-h-[480px] flex-col overflow-hidden bg-cream sm:-mx-8 sm:-mt-8 lg:-mx-10 lg:h-[calc(100dvh-112px)]">
    <header className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-[#e4ece4] bg-white px-4 py-3 sm:px-6">
      <Link to="/messages" className="lg:hidden"><IconButton label="Back to messages"><ArrowLeft size={19} /></IconButton></Link>
      {conversation.type === 'peer' ? <div className="flex -space-x-2">{memberProfiles.slice(0, 3).map((member) => <Avatar key={member.id} src={member.avatar} name={member.fullName} size="sm" online={member.online} className="border-2 border-white" />)}</div> : <Avatar src={otherMember?.avatar} name={displayName ?? conversation.name} size="md" online={otherMember?.online} />}
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate font-display text-base font-semibold tracking-[-0.03em]">{displayName}</h1><Pill tone={conversation.type === 'peer' ? 'orange' : 'green'} className="hidden !px-2 !py-0.5 !text-[8px] sm:inline-flex">{conversation.type === 'peer' ? 'Peer group' : 'Buddy'}</Pill></div><p className="mt-0.5 truncate text-[11px] text-[#87938b]">{conversation.type === 'peer' ? `${conversation.memberIds.length} members · realtime` : otherMember?.online ? 'Online now' : otherMember?.lastSeen ?? 'Study buddy'}</p></div>
      <div className="flex items-center gap-1"><IconButton label="Start voice call" onClick={() => void startCall(conversation, 'voice')}><Phone size={17} /></IconButton><IconButton label="Start video call" onClick={() => void startCall(conversation, 'video')}><Camera size={17} /><span className="sr-only">Video</span></IconButton><IconButton label="Conversation info" className="hidden sm:inline-flex"><Info size={17} /></IconButton><div className="relative"><IconButton label="More options" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></IconButton>{menuOpen && <div className="absolute right-0 top-11 z-20 w-52 rounded-2xl border border-[#e1eae1] bg-white p-2 shadow-soft"><p className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#99a49c]">Conversation</p>{conversation.type === 'peer' && <button onClick={() => { setMembersOpen(true); setMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-mist"><UsersRound size={15} />View members</button>}<button onClick={() => void clearHistory()} disabled={clearing} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#a8523e] hover:bg-[#fff0ec]"><Trash2 size={15} />{clearing ? 'Clearing...' : 'Clear my history'}</button></div>}</div></div>
    </header>

    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"><div className="mx-auto max-w-3xl"><div className="mb-6 text-center"><Pill tone={conversation.type === 'peer' ? 'orange' : 'green'}>{conversation.type === 'peer' ? 'Peer learning room' : 'Private study space'}</Pill><p className="mt-3 text-xs leading-5 text-[#89958d]">Messages are visible to members of this study space.</p></div>{messages.length === 0 && <div className="rounded-2xl border border-dashed border-[#dce6dc] bg-white/70 p-8 text-center text-sm text-[#7b887f]">Say hello to your match and start the study loop.</div>}{messages.map((message, index) => { const previous = messages[index - 1]; const showDate = !previous || formatFullDate(previous.createdAt) !== formatFullDate(message.createdAt); const grouped = Boolean(previous && previous.senderId === message.senderId && !showDate); const mine = message.senderId === currentUser.id; const sender = memberDirectory.find((profile) => profile.id === message.senderId); return <div key={message.id}>{showDate && <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-[#e1e9e1]" /><span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a1aca4]">{formatFullDate(message.createdAt)}</span><div className="h-px flex-1 bg-[#e1e9e1]" /></div>}<MessageBubble message={message} mine={mine} grouped={grouped} peer={conversation.type === 'peer'} sender={sender} onImage={setViewer} /></div> })}{typingName && <p className="mt-4 text-[10px] font-semibold text-[#89958d]">{typingName} is typing...</p>}</div></div>

    {error && <p className="shrink-0 border-t border-[#f2d0c8] bg-[#fff5f1] px-4 py-2 text-xs font-semibold text-[#a8523e] sm:px-6">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void submitMessage() }} className="flex shrink-0 items-end gap-2 border-t border-[#e4ece4] bg-white p-3 sm:p-4"><input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={(event) => void chooseAttachment(event)} className="hidden" /><IconButton type="button" label="Share a photo or file" onClick={() => fileRef.current?.click()} disabled={sending}><Paperclip size={18} /></IconButton><textarea value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping() }} placeholder="Write a message..." rows={1} className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-[#e0e9e0] bg-cream px-4 py-3 text-sm outline-none transition placeholder:text-[#9aa59d] focus:border-moss/50" /><Button type="submit" disabled={sending || !draft.trim()} className="h-11 shrink-0 rounded-2xl px-4"><Send size={16} /><span className="hidden sm:inline">Send</span></Button></form>

    {viewer && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => setViewer(null)}><div className="relative max-h-full max-w-4xl" onClick={(event) => event.stopPropagation()}><img src={viewer} alt="Shared study image" className="max-h-[85dvh] max-w-full rounded-2xl object-contain" /><IconButton label="Close image" onClick={() => setViewer(null)} className="absolute -right-2 -top-2 bg-white text-ink shadow-lg hover:bg-white"><X size={16} /></IconButton></div></div>}

    {membersOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#172d20]/45 p-3 backdrop-blur-sm sm:items-center" onClick={() => setMembersOpen(false)}><section className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-soft sm:p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><Pill tone="orange">Peer room</Pill><h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em]">Room members</h2><p className="mt-1 text-xs text-[#89958d]">Everyone currently in this study space.</p></div><IconButton label="Close members" onClick={() => setMembersOpen(false)}><X size={17} /></IconButton></div><div className="mt-5 max-h-[55dvh] space-y-2 overflow-y-auto">{memberProfiles.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-cream p-3"><Avatar src={member.avatar} name={member.fullName} size="sm" online={member.online} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{member.fullName}{member.id === currentUser.id && <span className="ml-2 text-[10px] font-bold text-moss">You</span>}</p><p className="truncate text-[11px] text-[#89958d]">{member.course} · {member.yearLevel}</p></div></div>)}</div></section></div>}
  </div>
}
