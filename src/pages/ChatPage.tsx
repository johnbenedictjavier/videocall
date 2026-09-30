import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, FileImage, Info, Link2, Loader2, Mic, MoreHorizontal, Paperclip, Phone, Send, Smile, UsersRound, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { demoProfiles } from '../data/demoData'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useCalls } from '../context/CallContext'
import { useTyping } from '../hooks/useTyping'
import { cn } from '../utils/cn'
import { formatFullDate, formatTime } from '../utils/format'
import { Avatar, Button, IconButton, Pill, ReadState } from '../components/ui'
import type { Message } from '../types'

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
  const { currentUser } = useAuth()
  const { getConversation, getConversationMessages, sendMessage, sendImageMessage, markConversationRead } = useAppData()
  const { startCall } = useCalls()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const conversation = conversationId ? getConversation(conversationId) : undefined
  const messages = conversationId ? getConversationMessages(conversationId) : []
  const { typingName, notifyTyping } = useTyping(conversationId, currentUser?.id, currentUser?.fullName)
  const otherMember = conversation ? demoProfiles.find((profile) => profile.id === conversation.memberIds.find((id) => id !== currentUser?.id)) : undefined
  const displayName = conversation?.type === 'buddy' && otherMember ? otherMember.fullName : conversation?.name
  const memberProfiles = useMemo(() => conversation?.memberIds.map((id) => demoProfiles.find((profile) => profile.id === id)).filter(Boolean) ?? [], [conversation])

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

  return <div className="-mx-4 -mt-6 flex h-[calc(100vh-100px)] flex-col overflow-hidden bg-cream sm:-mx-8 sm:-mt-8 lg:-mx-10 lg:h-[calc(100vh-112px)]"><header className="flex items-center gap-3 border-b border-[#e4ece4] bg-white px-4 py-3 sm:px-6"><Link to="/messages" className="lg:hidden"><IconButton label="Back to messages"><ArrowLeft size={19} /></IconButton></Link>{conversation.type === 'peer' ? <div className="flex -space-x-2">{memberProfiles.slice(0, 3).map((member) => member && <Avatar key={member.id} src={member.avatar} name={member.fullName} size="sm" online={member.online} className="border-2 border-white" />)}</div> : <Avatar src={otherMember?.avatar} name={displayName ?? conversation.name} size="md" online={otherMember?.online} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate font-display text-base font-semibold tracking-[-0.03em]">{displayName}</h1><Pill tone={conversation.type === 'peer' ? 'orange' : 'green'} className="hidden !px-2 !py-0.5 !text-[8px] sm:inline-flex">{conversation.type === 'peer' ? 'Peer group' : 'Buddy'}</Pill></div><p className="mt-0.5 truncate text-[11px] text-[#87938b]">{conversation.type === 'peer' ? `${conversation.memberIds.length} members · realtime` : otherMember?.online ? 'Online now' : otherMember?.lastSeen ?? 'Study buddy'}</p></div><div className="flex items-center gap-1"><IconButton label="Start voice call" onClick={() => void startCall(conversation, 'voice')}><Phone size={17} /></IconButton><IconButton label="Start video call" onClick={() => void startCall(conversation, 'video')}><Camera size={17} /></IconButton><IconButton label="Conversation info" className="hidden sm:inline-flex"><Info size={17} /></IconButton><IconButton label="More options"><MoreHorizontal size={18} /></IconButton></div></header><div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 lg:px-12"><div className="mx-auto max-w-3xl"><div className="mb-8 flex flex-col items-center text-center"><div className="flex -space-x-2">{memberProfiles.slice(0, 4).map((member) => member && <Avatar key={member.id} src={member.avatar} name={member.fullName} size="sm" className="border-2 border-cream" />)}</div><p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#9aa59d]">{conversation.type === 'peer' ? 'Peer room' : 'Private buddy room'}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#8a968e]">A calm place to ask the question you would usually keep to yourself.</p></div>{messages.map((message, index) => { const previous = messages[index - 1]; const sameDay = previous && new Date(previous.createdAt).toDateString() === new Date(message.createdAt).toDateString(); const grouped = previous?.senderId === message.senderId && sameDay; return <div key={message.id}>{!sameDay && <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-[#e1e9e1]" /><span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#a0aaa3]">{new Date(message.createdAt).toDateString() === new Date().toDateString() ? 'Today' : formatFullDate(message.createdAt)}</span><div className="h-px flex-1 bg-[#e1e9e1]" /></div>}<MessageBubble message={message} mine={message.senderId === currentUser.id} grouped={Boolean(grouped)} onImage={setViewer} /></div>})}{typingName && <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#89958d]"><span className="flex gap-1 rounded-full border border-[#e4ece4] bg-white px-3 py-2"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss" /></span>{typingName} is typing</div>}</div></div><div className="border-t border-[#e4ece4] bg-white px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6"><div className="mx-auto max-w-3xl">{error && <div className="mb-2 rounded-xl bg-[#fff0ec] px-3 py-2 text-xs font-semibold text-[#a8523e]">{error}</div>}<div className="flex items-end gap-2 rounded-[22px] border border-[#dfe8df] bg-cream p-2 focus-within:border-moss/50 focus-within:ring-4 focus-within:ring-moss/5"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void chooseImage(event)} /><IconButton label="Share an image" onClick={() => fileRef.current?.click()} className="shrink-0"><Paperclip size={18} /></IconButton><textarea value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping() }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitMessage() } }} rows={1} className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-[#a3aea6]" placeholder="Share a question, link, or small win..." /><IconButton label="Add emoji" className="hidden sm:inline-flex"><Smile size={18} /></IconButton><button onClick={() => void submitMessage()} disabled={!draft.trim() || sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-moss text-white transition hover:bg-[#245a3f] disabled:opacity-40">{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</button></div><div className="mt-2 flex items-center justify-center gap-3 text-[10px] font-semibold text-[#9aa59d]"><span className="flex items-center gap-1"><Check size={12} className="text-moss" />Messages sync in realtime</span><span className="hidden items-center gap-1 sm:flex"><FileImage size={12} />Images up to 8MB</span><span className="hidden items-center gap-1 sm:flex"><Link2 size={12} />Links are clickable</span></div></div></div>{viewer && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><button onClick={() => setViewer(null)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"><X size={20} /></button><img src={viewer} alt="Shared study image fullscreen" className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl" /></div>}</div>
}
