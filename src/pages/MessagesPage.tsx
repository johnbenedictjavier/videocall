import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MessageCircle, Search, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoProfiles as staticProfiles } from '../data/demoData'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { fetchRemoteProfile } from '../services/supabaseService'
import { cn } from '../utils/cn'
import { formatRelativeTime } from '../utils/format'
import { Avatar, EmptyState, Pill, SectionTitle } from '../components/ui'
import type { UserProfile } from '../types'

export function MessagesPage() {
  const { currentUser, isDemo } = useAuth()
  const { conversations } = useAppData()
  const [filter, setFilter] = useState<'all' | 'buddy' | 'peer'>('all')
  const [query, setQuery] = useState('')
  const [remoteMembers, setRemoteMembers] = useState<UserProfile[]>([])
  useEffect(() => {
    if (isDemo) {
      setRemoteMembers([])
      return
    }
    let active = true
    const memberIds = [...new Set(conversations.flatMap((conversation) => conversation.memberIds))]
    void Promise.all(memberIds.map((memberId) => fetchRemoteProfile(memberId))).then((profiles) => {
      if (active) setRemoteMembers(profiles.filter((profile): profile is UserProfile => Boolean(profile)))
    }).catch(() => {
      if (active) setRemoteMembers([])
    })
    return () => {
      active = false
    }
  }, [conversations, isDemo])

  const demoProfiles = useMemo(() => [...staticProfiles, ...remoteMembers], [remoteMembers])
  if (!currentUser) return null
  const visible = useMemo(() => conversations.filter((conversation) => (filter === 'all' || conversation.type === filter) && conversation.name.toLowerCase().includes(query.toLowerCase())), [conversations, filter, query])

  return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-[#758178]">Keep the loop moving</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Study spaces</h1><p className="mt-3 text-sm leading-6 text-[#78857c]">Every conversation here is a shared place to ask, explain, and practice.</p></div><Pill tone="green"><span className="h-1.5 w-1.5 rounded-full bg-[#55b97e]" />Realtime connected</Pill></div><div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]"><aside className="rounded-[28px] border border-[#e4ece4] bg-white p-4 shadow-card sm:p-5"><div className="relative"><Search size={16} className="absolute left-3.5 top-3.5 text-[#98a49b]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="input pl-10" placeholder="Search study spaces" /></div><div className="mt-4 flex gap-1 rounded-2xl bg-mist p-1">{(['all', 'buddy', 'peer'] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={cn('flex-1 rounded-xl py-2 text-[11px] font-extrabold capitalize transition', filter === item ? 'bg-white text-ink shadow-sm' : 'text-[#849188]')}>{item === 'all' ? 'All' : item === 'buddy' ? 'Buddy' : 'Peer'}</button>)}</div><div className="mt-5 space-y-2">{visible.map((conversation) => { const member = demoProfiles.find((profile) => profile.id === conversation.memberIds.find((id) => id !== currentUser.id)); const avatar = conversation.avatar ?? member?.avatar; return <Link to={`/messages/${conversation.id}`} key={conversation.id} className="group flex items-center gap-3 rounded-2xl p-3 transition hover:bg-mist"><Avatar src={avatar} name={conversation.name} size="md" online={conversation.online} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-extrabold">{conversation.name}</p><span className="shrink-0 text-[10px] text-[#9aa59d]">{formatRelativeTime(conversation.lastMessageAt)}</span></div><div className="mt-1 flex items-center gap-2"><p className="truncate text-[11px] text-[#7e8b82]">{conversation.lastMessage ?? 'Start the conversation'}</p>{conversation.type === 'peer' && <UsersRound size={12} className="shrink-0 text-[#9aa59d]" />}</div></div>{conversation.unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}<ArrowRight size={14} className="text-[#b0bab2] transition group-hover:translate-x-0.5 group-hover:text-moss" /></Link> })}</div>{visible.length === 0 && <p className="py-10 text-center text-xs text-[#8b978e]">No matching study spaces yet.</p>}</aside><section className="hidden lg:block"><SectionTitle eyebrow="How it works" title="A better kind of inbox" /><div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"><div className="rounded-[24px] border border-[#e4ece4] bg-white p-5 shadow-card"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-moss"><MessageCircle size={17} /></div><h3 className="mt-5 font-display text-base font-semibold">Ask freely</h3><p className="mt-2 text-xs leading-5 text-[#7e8b82]">Messages stay private to the people in your buddy or peer room.</p></div><div className="rounded-[24px] border border-[#e4ece4] bg-white p-5 shadow-card"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0d9] text-[#ad6a1d]"><UsersRound size={17} /></div><h3 className="mt-5 font-display text-base font-semibold">Teach forward</h3><p className="mt-2 text-xs leading-5 text-[#7e8b82]">Share links, screenshots, and the one explanation that finally clicked.</p></div><div className="rounded-[24px] border border-[#e4ece4] bg-white p-5 shadow-card"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f2ff] text-[#4774b9]"><span className="text-sm font-display font-bold">1:1</span></div><h3 className="mt-5 font-display text-base font-semibold">Call when words stall</h3><p className="mt-2 text-xs leading-5 text-[#7e8b82]">Jump from a chat into voice or video without leaving StudyMatch.</p></div></div><div className="mt-5 rounded-[24px] bg-[#234c36] p-6 text-white"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#bde0c3]">A small reminder</p><p className="mt-3 font-display text-xl font-semibold leading-7 tracking-[-0.04em]">The best study groups are built around useful questions, not perfect schedules.</p></div></section></div></div>
}
