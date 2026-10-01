import { useEffect, useState } from 'react'
import { ExternalLink, MessageCircle, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { useTyping } from '../hooks/useTyping'
import { formatTime } from '../utils/format'
import { Button, IconButton } from './ui'

export function FloatingChat({ conversationId }: { conversationId?: string }) {
  const { currentUser } = useAuth()
  const { getConversation, getConversationMessages, sendMessage, markConversationRead } = useAppData()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const conversation = conversationId ? getConversation(conversationId) : undefined
  const messages = conversationId ? getConversationMessages(conversationId) : []
  const { typingName, notifyTyping } = useTyping(conversationId, currentUser?.id, currentUser?.fullName)

  useEffect(() => {
    if (open && conversationId) markConversationRead(conversationId)
  }, [conversationId, markConversationRead, open])

  if (!currentUser || !conversation) return null

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

  return <>
    {!open && <button onClick={() => setOpen(true)} className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[85] flex items-center gap-2 rounded-full bg-moss px-4 py-3 text-xs font-extrabold text-white shadow-soft transition hover:bg-[#245a3f] lg:bottom-6 lg:right-6"><MessageCircle size={17} />Message</button>}
    {open && <section className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[85] flex h-[min(560px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-[28px] border border-[#e0e9e0] bg-cream shadow-2xl sm:left-auto sm:right-5 sm:w-[370px] lg:bottom-6"><header className="flex items-center gap-3 border-b border-[#e4ece4] bg-white px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{conversation.name}</p><p className="text-[10px] text-[#89958d]">Private study chat</p></div><Link to={`/messages/${conversation.id}`} onClick={() => setOpen(false)}><IconButton label="Open full conversation"><ExternalLink size={16} /></IconButton></Link><IconButton label="Close chat" onClick={() => setOpen(false)}><X size={17} /></IconButton></header><div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">{messages.length === 0 && <p className="rounded-2xl border border-dashed border-[#dce6dc] bg-white/70 p-5 text-center text-xs text-[#7b887f]">Say hello to your match.</p>}{messages.map((message) => <div key={message.id} className={`flex ${message.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-5 ${message.senderId === currentUser.id ? 'rounded-br-md bg-moss text-white' : 'rounded-bl-md border border-[#e4ece4] bg-white text-[#4f5d54]'}`}><p className="break-words">{message.kind === 'image' ? 'Shared an image' : message.content}</p><p className={`mt-1 text-[9px] ${message.senderId === currentUser.id ? 'text-white/60' : 'text-[#9aa59d]'}`}>{formatTime(message.createdAt)}</p></div></div>)}{typingName && <p className="text-[10px] font-semibold text-[#89958d]">{typingName} is typing...</p>}</div><form onSubmit={(event) => { event.preventDefault(); void submit() }} className="flex items-center gap-2 border-t border-[#e4ece4] bg-white p-3"><input value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping() }} placeholder="Message your match..." className="input min-h-10 flex-1 !rounded-xl !px-3 !py-2.5" disabled={sending} /><Button type="submit" disabled={sending || !draft.trim()} className="h-10 w-10 !rounded-xl !p-0" aria-label="Send message"><Send size={15} /></Button></form></section>}
  </>
}
