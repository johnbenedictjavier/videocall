import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, BookOpen, Home, LogOut, Map, MessageCircle, PhoneCall, Sparkles, UserRound, UsersRound, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useCalls } from '../context/CallContext'
import { demoProfiles } from '../data/demoData'
import { cn } from '../utils/cn'
import { formatRelativeTime } from '../utils/format'
import { Avatar, Button, IconButton, Pill } from './ui'
import { CallModal } from './CallModal'
import { MatchRequestOverlay } from './MatchRequestOverlay'

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/skillgps', label: 'SkillGPS', icon: Map },
  { to: '/match', label: 'Match', icon: Sparkles, special: true },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export function AppShell() {
  const { currentUser, isDemo, signOut, switchDemoUser } = useAuth()
  const { notifications, unreadNotifications, requests, updateRequest, markNotificationRead } = useAppData()
  const { activeCall, incomingCall, acceptCall, declineCall, endCall, callError, clearCallError } = useCalls()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [demoSwitcherOpen, setDemoSwitcherOpen] = useState(false)
  const location = useLocation()

  if (!currentUser) return null

  const title = location.pathname.startsWith('/skillgps') ? 'Your learning profile' : location.pathname.startsWith('/match') ? 'Find your people' : location.pathname.startsWith('/messages') ? 'Study spaces' : location.pathname.startsWith('/profile') ? 'Your profile' : 'Good to see you'

  return <div className="min-h-screen bg-cream text-ink">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-[#e7eee7] bg-[#fbfcf9] px-5 py-6 lg:flex">
      <div className="flex items-center gap-3 px-3"><div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-moss text-white shadow-[0_8px_18px_rgba(46,107,76,0.18)]"><Sparkles size={20} fill="currentColor" /></div><div><div className="font-display text-[17px] font-bold tracking-[-0.05em]">TugmAI</div><div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#8a988f]">StudyMatch</div></div></div>
      <div className="mt-10 px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9aa69d]">Your space</div>
      <nav className="mt-3 flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon, special }) => <NavLink key={to} to={to} className={({ isActive }) => cn('group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition', isActive ? 'bg-mint text-moss' : 'text-[#758178] hover:bg-mist hover:text-ink', special && 'mt-2')}><span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', special ? 'bg-coral text-white shadow-[0_6px_16px_rgba(233,130,97,0.26)]' : 'bg-transparent')}><Icon size={special ? 17 : 18} strokeWidth={special ? 2.4 : 2} /></span>{label}{label === 'Messages' && <span className="ml-auto h-5 min-w-5 rounded-full bg-coral px-1.5 text-center text-[10px] leading-5 text-white">2</span>}</NavLink>)}
      </nav>
      <div className="mt-auto rounded-[24px] bg-[#eff6ee] p-4"><div className="flex items-center gap-2"><div className="h-2 w-2 animate-pulse rounded-full bg-[#55b97e]" /><span className="text-xs font-extrabold text-moss">Live matching</span></div><p className="mt-2 text-xs leading-5 text-[#718077]">Your match score updates as your skills grow.</p></div>
      <div className="relative mt-5 flex items-center gap-3 border-t border-[#e7eee7] px-2 pt-5"><Avatar src={currentUser.avatar} name={currentUser.fullName} size="sm" online={currentUser.online} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{currentUser.fullName}</p><p className="truncate text-[10px] text-[#89958d]">{currentUser.course}</p></div><IconButton label="Sign out" onClick={() => void signOut()}><LogOut size={15} /></IconButton></div>
    </aside>

    <div className="lg:pl-[252px]">
      <header className="sticky top-0 z-20 border-b border-[#e8eee8]/80 bg-cream/90 px-4 py-4 backdrop-blur-xl sm:px-8 lg:px-10 lg:py-6"><div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4"><div className="flex items-center gap-3 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss text-white"><Sparkles size={17} fill="currentColor" /></div><div><div className="font-display text-base font-bold tracking-[-0.05em]">TugmAI</div><div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#8a988f]">StudyMatch</div></div></div><div className="hidden lg:block"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-moss">{isDemo ? 'Demo workspace' : 'Connected workspace'}</p><h1 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em]">{title}</h1></div><div className="ml-auto flex items-center gap-2"><div className="relative"><IconButton label="Notifications" onClick={() => setNotificationsOpen((open) => !open)} className="border border-[#e4ebe4] bg-white"><Bell size={18} />{unreadNotifications > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral ring-2 ring-white" />}</IconButton>{notificationsOpen && <div className="absolute right-0 top-12 z-40 w-[min(360px,calc(100vw-32px))] rounded-[24px] border border-[#e1eae1] bg-white p-3 shadow-soft"><div className="flex items-center justify-between px-2 py-1"><div><p className="font-display text-sm font-semibold">Notifications</p><p className="text-[11px] text-[#859188]">Realtime activity</p></div><IconButton label="Close notifications" onClick={() => setNotificationsOpen(false)}><X size={15} /></IconButton></div>{notifications.length === 0 ? <p className="px-2 py-8 text-center text-xs text-[#87938b]">You are all caught up.</p> : <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">{notifications.slice(0, 6).map((notification) => <div key={notification.id} className={cn('rounded-2xl p-3', notification.read ? 'bg-white' : 'bg-mint')}><div className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-moss"><Bell size={13} /></div><div className="min-w-0"><p className="text-xs font-extrabold">{notification.title}</p><p className="mt-0.5 text-xs leading-5 text-[#718077]">{notification.body}</p><p className="mt-1 text-[10px] text-[#99a39c]">{formatRelativeTime(notification.createdAt)}</p></div></div></div>)}</div>}</div>}</div><div className="relative"><button onClick={() => isDemo && setDemoSwitcherOpen((open) => !open)} className="flex items-center gap-2 rounded-full border border-[#e4ebe4] bg-white p-1 pr-3 transition hover:border-moss/40"><Avatar src={currentUser.avatar} name={currentUser.fullName} size="sm" online={currentUser.online} /><span className="hidden max-w-28 truncate text-xs font-extrabold sm:block">{currentUser.fullName.split(' ')[0]}</span></button>{demoSwitcherOpen && isDemo && <div className="absolute right-0 top-12 z-40 w-64 rounded-[24px] border border-[#e1eae1] bg-white p-3 shadow-soft"><p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#95a098]">Switch demo persona</p>{demoProfiles.slice(0, 5).map((profile) => <button key={profile.id} onClick={() => { switchDemoUser(profile.id); setDemoSwitcherOpen(false) }} className={cn('flex w-full items-center gap-2 rounded-2xl p-2 text-left transition hover:bg-mist', profile.id === currentUser.id && 'bg-mint')}><Avatar src={profile.avatar} name={profile.fullName} size="xs" online={profile.online} /><span className="min-w-0 flex-1 truncate text-xs font-bold">{profile.fullName}</span>{profile.id === currentUser.id && <span className="text-[10px] text-moss">Current</span>}</button>)}</div>}</div></div></div></header>

      <main className="mx-auto min-h-[calc(100vh-80px)] max-w-[1160px] px-4 pb-28 pt-6 sm:px-8 lg:px-10 lg:pb-10 lg:pt-8"><Outlet /></main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t border-[#e2ebe2] bg-white/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(30,53,38,0.06)] backdrop-blur-xl lg:hidden">{navItems.map(({ to, label, icon: Icon, special }) => <NavLink key={to} to={to} className={({ isActive }) => cn('flex min-w-[56px] flex-col items-center gap-1 text-[10px] font-extrabold transition', special ? '-mt-6' : 'py-1', isActive ? 'text-moss' : 'text-[#93a097]')}><span className={cn('flex items-center justify-center rounded-2xl', special ? 'h-14 w-14 bg-coral text-white shadow-[0_8px_20px_rgba(233,130,97,0.3)]' : 'h-8 w-8')}><Icon size={special ? 23 : 19} strokeWidth={special ? 2.2 : 2.2} /></span><span>{label}</span></NavLink>)}</nav>

    {incomingCall && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#193424]/55 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[32px] bg-white p-7 text-center shadow-soft"><div className="mx-auto mb-5 flex h-20 w-20 animate-pulse-soft items-center justify-center rounded-full bg-mint"><Avatar src={incomingCall.caller.avatar} name={incomingCall.caller.fullName} size="xl" online /></div><Pill tone="green">Incoming {incomingCall.kind} call</Pill><h2 className="mt-4 font-display text-2xl font-semibold">{incomingCall.caller.fullName}</h2><p className="mt-2 text-sm text-[#77847b]">Your study buddy is calling from your shared space.</p><div className="mt-7 grid grid-cols-2 gap-3"><Button variant="danger" onClick={declineCall}><PhoneCall size={16} className="rotate-[135deg]" />Decline</Button><Button onClick={acceptCall}><PhoneCall size={16} />Accept</Button></div></div></div>}
      {activeCall && <CallModal call={activeCall} onClose={endCall} />}
      {callError && <div className="fixed bottom-24 left-4 right-4 z-[75] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-[#f2d0c8] bg-[#fff5f1] p-4 text-xs font-semibold text-[#a8523e] shadow-soft lg:bottom-6 lg:left-auto lg:right-6"><p className="flex-1 leading-5">{callError}</p><IconButton label="Dismiss call error" onClick={clearCallError} className="-mr-1 -mt-1 text-[#a8523e] hover:bg-[#fbe5df]"><X size={15} /></IconButton></div>}
      <MatchRequestOverlay />
  </div>
}
