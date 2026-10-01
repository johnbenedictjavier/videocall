import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Download, ExternalLink, FileImage, FileText, MessageCircle, Paperclip, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoProfiles } from '../data/demoData'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { useTyping } from '../hooks/useTyping'
import { fetchRemoteProfile } from '../services/supabaseService'
import { formatTime } from '../utils/format'
import type { Message, UserProfile } from '../types'
import { Avatar, Button, IconButton } from './ui'

export function FloatingChat({ conversationId }: { conversationId?: string }) {
  const { currentUser, isDemo } = useAuth()
  const { getConversation, getConversationMessages, sendMessage, sendAttachmentMessage, markConversationRead } = useAppData()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [remoteMembers, setRemoteMembers] = useState<UserProfile[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const conversation = conversationId ? getConversation(conversationId) : undefined
  const messages = conversationId ? getConversationMessages(conversationId) : []
  const { typingName, notifyTyping } = useTyping(conversationId, currentUser?.id, currentUser?.fullName)

  useEffect(() => {
    if (!conversation || isDemo || conversation.type !== 'peer') {
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

  const directory = useMemo(() => [...demoProfiles, ...remoteMembers], [remoteMembers])

  useEffect(() => {
    if (open && conversationId) markConversationRead(conversationId)
  }, [conversationId, markConversationRead, open])

  if (!currentUser || !conversation) return null

  const peer = conversation.type === 'peer'
  const submit = async () => {
    const value = draft.trim()
    if (!value || sending) return
    setSending(true)
    try {
      await sendMessage(conversation.id, value)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  const chooseAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSending(true)
    try {
      await sendAttachmentMessage(conversation.id, file)
    } finally {
      setSending(false)
    }
  }

  const renderAttachment = (message: Message, mine: boolean) => {
    if (message.kind === 'image') return message.attachmentUrl ? <img src={message.attachmentUrl} alt={message.attachmentName ?? 'Shared image'} className="max-h-36 max-w-full rounded-xl object-cover" /> : <span className="flex items-center gap-2"><FileImage size={14} />{message.attachmentName ?? 'Shared image'}</span>
    if (message.kind === 'file') return message.attachmentUrl ? <a href={message.attachmentUrl} download={message.attachmentName} target="_blank" rel="noreferrer noopener" className={`flex items-center gap-2 ${mine ? 'text-white' : 'text-moss'}`}><FileText size={14} /><span className="min-w-0 flex-1 break-all">{message.attachmentName ?? 'Shared file'}</span><Download size={12} /></a> : <span className="flex items-center gap-2"><FileText size={14} />{message.attachmentName ?? 'Shared file'}</span>
    return message.content
  }

  return <>
    {!open && <button onClick={() => setOpen(true)} className="fixed right-4 top-[calc(5rem+env(safe-area-inset-top))] z-[85] flex items-center gap-2 rounded-full bg-moss px-4 py-3 text-xs font-extrabold text-white shadow-soft transition hover:bg-[#245a3f] lg:bottom-6 lg:right-6 lg:top-auto"><MessageCircle size={17} />Message</button>}
    {open && <section className="fixed inset-x-3 bottom-[calc(8rem+env(safe-area-inset-bottom))] top-[calc(5rem+env(safe-area-inset-top))] z-[85] flex flex-col overflow-hidden rounded-[28px] border border-[#e0e9e0] bg-cream shadow-2xl sm:left-auto sm:right-5 sm:w-[370px] lg:bottom-6 lg:top-auto lg:h-[min(560px,calc(100dvh-3rem))]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#e4ece4] bg-white px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{conversation.name}</p><p className="text-[10px] text-[#89958d]">Private study chat</p></div><Link to={`/messages/${conversation.id}`} onClick={() => setOpen(false)}><IconButton label="Open full conversation"><ExternalLink size={16} /></IconButton></Link><IconButton label="Close chat" onClick={() => setOpen(false)}><X size={17} /></IconButton></header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">{messages.length === 0 && <p className="rounded-2xl border border-dashed border-[#dce6dc] bg-white/70 p-5 text-center text-xs text-[#7b887f]">Say hello to your match.</p>}{messages.map((message, index) => { const previous = messages[index - 1]; const grouped = previous?.senderId === message.senderId; const mine = message.senderId === currentUser.id; const sender = directory.find((profile) => profile.id === message.senderId); return <div key={message.id} className={`flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>{peer && !mine && <div className="flex w-6 shrink-0 items-end">{!grouped && <Avatar src={sender?.avatar} name={sender?.fullName ?? 'Peer'} size="xs" />}</div>}<div className={`max-w-[82%] ${grouped ? 'mt-0.5' : 'mt-3'}`}>{peer && !mine && !grouped && <p className="mb-0.5 px-1 text-[9px] font-extrabold text-[#718077]">{sender?.fullName ?? 'Peer'}</p>}<div className={`rounded-2xl px-3 py-2 text-xs leading-5 ${mine ? 'rounded-br-md bg-moss text-white' : 'rounded-bl-md border border-[#e4ece4] bg-white text-[#4f5d54]'}`}>{renderAttachment(message, mine)}<p className={`mt-1 text-[9px] ${mine ? 'text-white/60' : 'text-[#9aa59d]'}`}>{formatTime(message.createdAt)}</p></div></div></div> })}{typingName && <p className="text-[10px] font-semibold text-[#89958d]">{typingName} is typing...</p>}</div>
      <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="flex shrink-0 items-center gap-2 border-t border-[#e4ece4] bg-white p-3"><input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={(event) => void chooseAttachment(event)} className="hidden" /><IconButton type="button" label="Share a photo or file" onClick={() => fileRef.current?.click()} disabled={sending}><Paperclip size={16} /></IconButton><input value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping() }} placeholder="Write a message..." className="input min-w-0 flex-1" /><Button type="submit" size="sm" aria-label="Send message" disabled={sending || !draft.trim()} className="rounded-xl px-3"><Send size={14} /></Button></form>
    </section>}
  </>
}
