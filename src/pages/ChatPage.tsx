import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, FileImage, Info, Loader2, MoreHorizontal, Phone, Send, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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

function RichMessage({ content }: { content: string }) {
  return <>{content.split(URL_PATTERN).map((part, index) => part.match(URL_PATTERN) ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer noopener" className="break-all font-bold text-moss underline decoration-moss/30 underline-offset-2 hover:decoration-moss">{part}</a> : <span key={`${part}-${index}`}>{part}</span>)}</>
}

function MessageBubble({ message, mine, grouped, onImage }: { message: Message; mine: boolean; grouped: boolean; onImage: (url: string) => void }) {
  return <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[82%] sm:max-w-[70%]', mine ? 'items-end' : 'items-start', grouped ? 'mt-1' : 'mt-4')}><div className={cn('overflow-hidden px-4 py-3 text-sm leading-6 shadow-sm', mine ? 'rounded-[20px] rounded-br-md bg-moss text-white' : 'rounded-[20px] rounded-bl-md border border-[#e4ece4] bg-white text-[#4f5d54]')}>{message.kind === 'image' && message.attachmentUrl ? <button onClick={() => onImage(message.attachmentUrl!)} className="group relative block overflow-hidden rounded-xl"><img src={message.attachmentUrl} alt={message.attachmentName ?? 'Shared study image'} className="max-h-64 w-full object-cover transition group-hover:scale-[1.02]" /><span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/45 px-2 py-1 text-left text-[10px] text-white opacity-0 transition group-hover:opacity-100">Open image</span></button> : <RichMessage content={message.content} />}</div><div className={cn('mt-1 flex items-center gap-1.5 px-1 text-[10px] text-[#9aa59d]', mine && 'justify-end')}><span>{formatTime(message.createdAt)}</span>{mine && <ReadState read={message.readBy.length > 1} />}</div></div></div>
}

export function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { currentUser, isDemo } = useAuth()
  const { getConversation, getConversationMessages, sendMessage, sendImageMessage, markConversationRead, clearConversationHistory } = useAppData()
  const { startCall } = useCalls()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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
  const memberProfiles = useMemo(() => conversation?.memberIds.map((id) => memberDirectory.find((profile) => profile.id === id)).filter(Boolean) ?? [], [conversation, memberDirectory])

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

  const chooseImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSending(true)
    setError('')
    try {
      await sendImageMessage(conversation.id, file)
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Image could not be sent.')
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

  return <div className="-mx-4 -mt-6 flex h-[calc(100dvh-100px)] min-h-[480px] flex-col overflow-hidden bg-cream sm:-mx-8 sm:-mt-8 lg:-mx-10 lg:h-[calc(100dvh-112px)]"><header className="flex items-center gap-3 border-b border-[#e4ece4] bg-white px-4 py-3 sm:px-6"><Link to="/messages" className="lg:hidden"><IconButton label="Back to messages"><ArrowLeft size={19} /></IconButton></Link>{conversation.type === 'peer' ? <div className="flex -space-x-2">{memberProfiles.slice(0, 3).map((member) => member && <Avatar key={member.id} src={member.avatar} name={member.fullName} size="sm" online={member.online} className="border-2 border-white" />)}</div> : <Avatar src={otherMember?.avatar} name={displayName ?? conversation.name} size="md" online={otherMember?.online} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate font-display text-base font-semibold tracking-[-0.03em]">{displayName}</h1><Pill tone={conversation.type === 'peer' ? 'orange' : 'green'} className="hidden !px-2 !py-0.5 !text-[8px] sm:inline-flex">{conversation.type === 'peer' ? 'Peer group' : 'Buddy'}</Pill></div><p className="mt-0.5 truncate text-[11px] text-[#87938b]">{conversation.type === 'peer' ? `${conversation.memberIds.length} members · realtime` : otherMember?.online ? 'Online now' : otherMember?.lastSeen ?? 'Study buddy'}</p></div><div className="flex items-center gap-1"><IconButton label="Start voice call" onClick={() => void startCall(conversation, 'voice')}><Phone size={17} /></IconButton><IconButton label="Start video call" onClick={() => void startCall(conversation, 'video')}><Camera size={17} /></IconButton><IconButton label="Conversation info" className="hidden sm:inline-flex"><Info size={17} /></IconButton><div className="relative"><IconButton label="More options" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></IconButton>{menuOpen && <div className="absolute right-0 top-11 z-20 w-48 rounded-2xl border border-[#e1eae1] bg-white p-2 shadow-soft"><button disabled={clearing} onClick={() => void clearHistory()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#a8523e] hover:bg-[#fff0ec] disabled:opacity-50"><Trash2 size={15} />{clearing ? 'Clearing...' : 'Clear history'}</button></div>}</div></div></header><div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 lg:px-12"><div className="mx-auto max-w-3xl"><div className="mb-8 flex flex-col items-center text-center"><Pill tone={conversation.type === 'peer' ? 'orange' : 'green'}>{conversation.type === 'peer' ? 'Peer study space' : 'Private study space'}</Pill><p className="mt-3 max-w-md text-xs leading-5 text-[#89958d]">Keep it useful, kind, and focused. Shared links stay between members.</p></div>{messages.length === 0 && <div className="rounded-2xl border border-dashed border-[#dce6dc] bg-white/60 p-8 text-center text-xs text-[#7b887f]">No messages yet. Start the conversation.</div>}{messages.map((message, index) => { const previous = messages[index - 1]; const showDate = !previous || formatFullDate(previous.createdAt) !== formatFullDate(message.createdAt); const grouped = Boolean(previous && previous.senderId === message.senderId && !showDate); return <div key={message.id}>{showDate && <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-[#e1e9e1]" /><span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a1aca4]">{formatFullDate(message.createdAt)}</span><div className="h-px flex-1 bg-[#e1e9e1]" /></div>}<MessageBubble message={message} mine={message.senderId === currentUser.id} grouped={grouped} onImage={setViewer} /></div>})}{typingName && <p className="mt-4 text-xs font-semibold text-[#89958d]">{typingName} is typing...</p>}</div></div>{error && <div className="border-t border-[#f2d0c8] bg-[#fff5f1] px-4 py-2 text-center text-xs font-semibold text-[#a8523e]">{error}</div>}<form onSubmit={(event) => { event.preventDefault(); void submitMessage() }} className="border-t border-[#e4ece4] bg-white px-4 py-3 sm:px-6"><div className="mx-auto flex max-w-3xl items-end gap-2"><input ref={fileRef} type="file" accept="image/*" onChange={(event) => void chooseImage(event)} className="hidden" /><IconButton type="button" label="Attach image" onClick={() => fileRef.current?.click()} disabled={sending}><FileImage size={18} /></IconButton><input value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping() }} placeholder="Write something useful..." className="input min-h-11 flex-1 !rounded-2xl !py-3" disabled={sending} /><Button type="submit" disabled={sending || !draft.trim()} className="h-11 w-11 !rounded-2xl !p-0" aria-label="Send message">{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</Button></div></form>{viewer && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setViewer(null)}><button onClick={() => setViewer(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white" aria-label="Close image"><X size={20} /></button><img src={viewer} alt="Shared study image" className="max-h-[90dvh] max-w-full rounded-2xl object-contain" /></div>}</div>
}
