import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Loader2, MessageCircle, Plus, Send, StickyNote, Trash2, X } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { addMeetingBoardItem, deleteMeetingBoardItem, fetchMeetingBoardItems, getOrCreateMeetingBoard, subscribeToMeetingBoard, updateMeetingBoardItem } from '../services/supabaseService'
import type { MeetingBoardItem, MeetingBoardSection } from '../types'
import { formatTime } from '../utils/format'
import { Button, IconButton } from './ui'

type Props = {
  conversationId?: string
  callId: string
  encounterId?: string
  onBoardReady: (boardId: string | null) => void
  onClose: () => void
}

const sections: { id: MeetingBoardSection; label: string; placeholder: string }[] = [
  { id: 'notes', label: 'Notes', placeholder: 'Add a shared note' },
  { id: 'goals', label: 'Goals', placeholder: 'Add a meeting goal' },
  { id: 'plans', label: 'Plans', placeholder: 'Add a next step' },
]

function BoardItemEditor({ item, busy, onSave, onRemove }: { item: MeetingBoardItem; busy: boolean; onSave: (content: string) => void; onRemove: () => void }) {
  const [value, setValue] = useState(item.content)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setValue(item.content) }, [focused, item.content])
  useEffect(() => {
    if (value.trim() === item.content) return
    const timer = window.setTimeout(() => onSave(value), 500)
    return () => window.clearTimeout(timer)
  }, [item.content, value])
  return <div className="group flex items-start gap-1 rounded-xl bg-white/[0.07] p-2"><textarea value={value} onFocus={() => setFocused(true)} onChange={(event) => setValue(event.target.value)} onBlur={() => { setFocused(false); onSave(value) }} className="min-h-12 flex-1 resize-none bg-transparent text-xs leading-5 text-white outline-none" /><button onClick={onRemove} disabled={busy} aria-label="Delete item" className="rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-[#ffb3a5]">{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button></div>
}

export function MeetingWorkspace({ conversationId, callId, encounterId, onBoardReady, onClose }: Props) {
  const { currentUser, isDemo } = useAuth()
  const { getConversationMessages, sendMessage } = useAppData()
  const [tab, setTab] = useState<'messages' | 'board'>('messages')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [items, setItems] = useState<MeetingBoardItem[]>([])
  const [newItems, setNewItems] = useState<Record<MeetingBoardSection, string>>({ notes: '', goals: '', plans: '' })
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [error, setError] = useState('')
  const messages = conversationId ? getConversationMessages(conversationId).filter((message) => message.kind !== 'system') : []
  const demoKey = `studymatch.meeting-board.${encounterId ?? callId}`

  useEffect(() => {
    if (!conversationId || !currentUser) return
    let active = true
    if (isDemo) {
      const id = `demo-board-${encounterId ?? callId}`
      setBoardId(id)
      onBoardReady(id)
      try {
        setItems(JSON.parse(localStorage.getItem(demoKey) ?? '[]') as MeetingBoardItem[])
      } catch {
        setItems([])
      }
      return
    }
    void getOrCreateMeetingBoard({ conversationId, callId: encounterId ? undefined : callId, encounterId }).then(({ board, items: initialItems }) => {
      if (!active) return
      setBoardId(board.id)
      setItems(initialItems)
      onBoardReady(board.id)
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'The shared board could not be opened.')
    })
    return () => {
      active = false
    }
  }, [callId, conversationId, currentUser, demoKey, encounterId, isDemo, onBoardReady])

  useEffect(() => {
    if (!boardId || isDemo) return
    const channel = subscribeToMeetingBoard(boardId, () => {
      void fetchMeetingBoardItems(boardId).then(setItems).catch(() => undefined)
    })
    return () => { channel?.unsubscribe() }
  }, [boardId, isDemo])

  const saveDemo = (next: MeetingBoardItem[]) => {
    setItems(next)
    localStorage.setItem(demoKey, JSON.stringify(next))
  }

  const addItem = async (section: MeetingBoardSection) => {
    const content = newItems[section].trim()
    if (!content || !boardId || !currentUser) return
    const temporaryId = crypto.randomUUID()
    setBusyItem(temporaryId)
    setError('')
    try {
      const position = items.filter((item) => item.section === section).length
      if (isDemo) {
        saveDemo([...items, { id: temporaryId, boardId, section, content, position, createdBy: currentUser.id, updatedBy: currentUser.id, updatedAt: new Date().toISOString() }])
      } else {
        const item = await addMeetingBoardItem(boardId, section, content, position, currentUser.id)
        setItems((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item])
      }
      setNewItems((current) => ({ ...current, [section]: '' }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board item could not be added.')
    } finally {
      setBusyItem(null)
    }
  }

  const editItem = async (item: MeetingBoardItem, content: string) => {
    const value = content.trim()
    if (!value || !currentUser || value === item.content) return
    setBusyItem(item.id)
    try {
      if (isDemo) saveDemo(items.map((entry) => entry.id === item.id ? { ...entry, content: value, updatedBy: currentUser.id, updatedAt: new Date().toISOString() } : entry))
      else await updateMeetingBoardItem(item.id, value, currentUser.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board item could not be updated.')
    } finally {
      setBusyItem(null)
    }
  }

  const removeItem = async (item: MeetingBoardItem) => {
    setBusyItem(item.id)
    try {
      if (isDemo) saveDemo(items.filter((entry) => entry.id !== item.id))
      else await deleteMeetingBoardItem(item.id)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board item could not be removed.')
    } finally {
      setBusyItem(null)
    }
  }

  const submitMessage = async () => {
    const content = draft.trim()
    if (!content || !conversationId || sending) return
    setSending(true)
    setError('')
    try {
      await sendMessage(conversationId, content)
      setDraft('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  const groupedItems = useMemo(() => Object.fromEntries(sections.map(({ id }) => [id, items.filter((item) => item.section === id).sort((a, b) => a.position - b.position)])) as Record<MeetingBoardSection, MeetingBoardItem[]>, [items])

  return <aside className="flex min-h-0 w-full flex-col border-t border-white/10 bg-[#122219] text-white lg:w-[340px] lg:shrink-0 lg:border-l lg:border-t-0">
    <header className="flex items-center gap-2 border-b border-white/10 p-3">
      <button onClick={() => setTab('messages')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${tab === 'messages' ? 'bg-white text-[#193b2a]' : 'text-white/60 hover:bg-white/10'}`}><MessageCircle size={15} />Messages</button>
      <button onClick={() => setTab('board')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${tab === 'board' ? 'bg-white text-[#193b2a]' : 'text-white/60 hover:bg-white/10'}`}><StickyNote size={15} />Board</button>
      <IconButton label="Hide workspace" onClick={onClose} className="text-white/60 hover:bg-white/10"><X size={16} /></IconButton>
    </header>
    {tab === 'messages' ? <>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{!conversationId && <p className="p-4 text-center text-xs text-white/45">Chat is unavailable for this meeting.</p>}{conversationId && messages.length === 0 && <p className="p-4 text-center text-xs text-white/45">Start the conversation.</p>}{messages.map((message) => { const mine = message.senderId === currentUser?.id; return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ${mine ? 'rounded-br-md bg-moss' : 'rounded-bl-md bg-white/10'}`}><p className="break-words">{message.content || message.attachmentName}</p><p className="mt-1 text-[9px] text-white/45">{formatTime(message.createdAt)}</p></div></div>})}</div>
      <form onSubmit={(event) => { event.preventDefault(); void submitMessage() }} className="flex gap-2 border-t border-white/10 p-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message" disabled={!conversationId} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white outline-none placeholder:text-white/35" /><Button type="submit" size="sm" disabled={!conversationId || sending || !draft.trim()} className="rounded-xl px-3"><Send size={14} /></Button></form>
    </> : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">{sections.map((section) => <section key={section.id}><div className="mb-2 flex items-center gap-2"><CheckSquare size={14} className="text-[#a8e4b4]" /><h3 className="text-xs font-extrabold">{section.label}</h3><span className="text-[9px] text-white/35">{groupedItems[section.id].length}</span></div><div className="space-y-2">{groupedItems[section.id].map((item) => <BoardItemEditor key={item.id} item={item} busy={busyItem === item.id} onSave={(content) => void editItem(item, content)} onRemove={() => void removeItem(item)} />)}</div><div className="mt-2 flex gap-2"><input value={newItems[section.id]} onChange={(event) => setNewItems((current) => ({ ...current, [section.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addItem(section.id) } }} placeholder={section.placeholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white outline-none placeholder:text-white/30" /><IconButton label={`Add ${section.label.toLowerCase()}`} onClick={() => void addItem(section.id)} disabled={!boardId || !newItems[section.id].trim()} className="bg-white/10 text-white hover:bg-white/20"><Plus size={15} /></IconButton></div></section>)}</div>}
    {error && <p className="border-t border-[#e87568]/30 bg-[#e87568]/10 px-3 py-2 text-[10px] font-semibold text-[#ffb3a5]">{error}</p>}
  </aside>
}
