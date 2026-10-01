import { useState } from 'react'
import { Bell, Home, LogOut, Map, MessageCircle, PhoneCall, Sparkles, UserRound, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useCalls } from '../context/CallContext'
import { cn } from '../utils/cn'
import { formatRelativeTime } from '../utils/format'
import { Avatar, Button, IconButton, Pill } from './ui'
import { CallModal } from './CallModal'
import { MatchRequestOverlay } from './MatchRequestOverlay'

const navItems = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/skillgps', label: 'SkillGPS', icon: Map },
  { to: '/match', label: 'Meet', icon: Sparkles, special: true },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export function AppShell() {
  const { currentUser, isDemo, signOut } = useAuth()
  const { conversations, notifications, unreadNotifications, markNotificationRead } = useAppData()
  const { activeCall, incomingCall, acceptCall, declineCall, endCall, callError, clearCallError } = useCalls()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const location = useLocation()

  if (!currentUser) return null

  const unreadMessages = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)
  const title = location.pathname.startsWith('/dashboard') ? 'Your dashboard' : location.pathname.startsWith('/skillgps') ? 'Your learning profile' : location.pathname.startsWith('/match') ? 'Meet someone new' : location.pathname.startsWith('/messages') ? 'Study spaces' : location.pathname.startsWith('/profile') ? 'Your profile' : 'Good to see you'

  const notificationPanel = notificationsOpen && <>
    <button aria-label="Close notifications" onClick={() => setNotificationsOpen(false)} className="fixed inset-0 z-40 bg-black/10 lg:hidden" />
    <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[24px] border border-[#e1eae1] bg-white p-3 shadow-soft sm:left-auto sm:right-4 sm:w-[360px] lg:absolute lg:inset-x-auto lg:right-0 lg:top-12 lg:max-h-96"><div className="flex items-center justify-between px-2 py-1"><div><p className="font-display text-sm font-semibold">Notifications</p><p className="text-[11px] text-[#859188]">Realtime activity</p></div><IconButton label="Close notifications" onClick={() => setNotificationsOpen(false)}><X size={15} /></IconButton></div>{notifications.length === 0 ? <p className="px-2 py-8 text-center text-xs text-[#87938b]">You are all caught up.</p> : <div className="mt-2 space-y-1">{notifications.slice(0, 12).map((notification) => <button key={notification.id} onClick={() => { markNotificationRead(notification.id); setNotificationsOpen(false) }} className={cn('block w-full rounded-2xl p-3 text-left transition hover:bg-mist', !notification.read && 'bg-[#f2faf2]')}><div className="flex items-start justify-between gap-3"><p className="text-xs font-extrabold text-ink">{notification.title}</p><span className="shrink-0 text-[10px] text-[#9aa59d]">{formatRelativeTime(notification.createdAt)}</span></div><p className="mt-1 text-xs leading-5 text-[#758178]">{notification.body}</p></button>)}</div>}</div>
  </>

  return <div className="min-h-screen bg-cream text-ink">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-[#e7eee7] bg-[#fbfcf9] px-5 py-6 lg:flex">
      <div className="flex items-center gap-3 px-3"><div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-moss text-white shadow-[0_8px_18px_rgba(46,107,76,0.18)]"><Sparkles size={20} fill="currentColor" /></div><div><div className="font-display text-[17px] font-bold tracking-[-0.05em]">TugmAI</div><div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#8a988f]">Random Meet</div></div></div>
      <div className="mt-10 px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9aa69d]">Your space</div>
      <nav className="mt-3 flex flex-col gap-1">{navItems.map(({ to, label, icon: Icon, special }) => <NavLink key={to} to={to} className={({ isActive }) => cn('group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition', isActive ? 'bg-mint text-moss' : 'text-[#758178] hover:bg-mist hover:text-ink', special && 'mt-2')}><span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', special ? 'bg-coral text-white shadow-[0_6px_16px_rgba(233,130,97,0.26)]' : 'bg-transparent')}><Icon size={special ? 17 : 18} strokeWidth={special ? 2.4 : 2} /></span>{label}{label === 'Messages' && unreadMessages > 0 && <span className="ml-auto h-5 min-w-5 rounded-full bg-coral px-1.5 text-center text-[10px] leading-5 text-white">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}</NavLink>)}</nav>
      <div className="mt-auto rounded-[24px] bg-[#eff6ee] p-4"><div className="flex items-center gap-2"><div className="h-2 w-2 animate-pulse rounded-full bg-[#55b97e]" /><span className="text-xs font-extrabold text-moss">Live matching</span></div><p className="mt-2 text-xs leading-5 text-[#718077]">Your match score updates as your skills grow.</p></div>
      <div className="relative mt-5 flex items-center gap-3 border-t border-[#e7eee7] px-2 pt-5"><Avatar src={currentUser.avatar} name={currentUser.fullName} size="sm" online={currentUser.online} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{currentUser.fullName}</p><p className="truncate text-[10px] text-[#89958d]">{currentUser.course}</p></div><IconButton label="Sign out" onClick={() => void signOut()}><LogOut size={15} /></IconButton></div>
    </aside>

    <div className="lg:pl-[252px]">
      <header className="sticky top-0 z-20 border-b border-[#e8eee8]/80 bg-cream/90 px-4 py-4 backdrop-blur-xl sm:px-8 lg:px-10 lg:py-6"><div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4"><div className="flex items-center gap-3 lg:hidden"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss text-white"><Sparkles size={17} fill="currentColor" /></div><div><div className="font-display text-base font-bold tracking-[-0.05em]">TugmAI</div><div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#8a988f]">StudyMatch</div></div></div><div className="hidden lg:block"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-moss">{isDemo ? 'Demo workspace' : 'Connected workspace'}</p><h1 className="mt-1 font-display text-xl font-semibold tracking-[-0.04em]">{title}</h1></div><div className="ml-auto flex items-center gap-2"><div className="relative"><IconButton label="Notifications" onClick={() => { setNotificationsOpen((open) => !open); setAccountOpen(false) }} className="border border-[#e4ebe4] bg-white"><Bell size={18} />{unreadNotifications > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral ring-2 ring-white" />}</IconButton>{notificationPanel}</div><div className="relative lg:hidden"><button aria-label="Open account menu" onClick={() => { setAccountOpen((open) => !open); setNotificationsOpen(false) }} className="rounded-full focus-visible:outline-none"><Avatar src={currentUser.avatar} name={currentUser.fullName} size="sm" online={currentUser.online} /></button>{accountOpen && <div className="absolute right-0 top-12 z-50 w-48 rounded-2xl border border-[#e1eae1] bg-white p-2 shadow-soft"><div className="border-b border-[#edf2ed] px-3 py-2"><p className="truncate text-xs font-extrabold">{currentUser.fullName}</p><p className="truncate text-[10px] text-[#89958d]">{currentUser.email}</p></div><NavLink to="/profile" onClick={() => setAccountOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-[#66746b] hover:bg-mist"><UserRound size={15} />Profile</NavLink><button onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#a8523e] hover:bg-[#fff0ec]"><LogOut size={15} />Sign out</button></div>}</div></div></div></header>

      <main className="mx-auto min-h-[calc(100dvh-80px)] max-w-[1160px] px-4 pb-28 pt-6 sm:px-8 lg:px-10 lg:pb-10 lg:pt-8"><Outlet /></main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t border-[#e2ebe2] bg-white/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(30,53,38,0.06)] backdrop-blur-xl lg:hidden">{navItems.map(({ to, label, icon: Icon, special }) => <NavLink key={to} to={to} className={({ isActive }) => cn('relative flex min-w-[56px] flex-col items-center gap-1 text-[10px] font-extrabold transition', special ? '-mt-6' : 'py-1', isActive ? 'text-moss' : 'text-[#93a097]')}><span className={cn('flex items-center justify-center rounded-2xl', special ? 'h-14 w-14 bg-coral text-white shadow-[0_8px_20px_rgba(233,130,97,0.3)]' : 'h-8 w-8')}><Icon size={special ? 23 : 19} strokeWidth={special ? 2.2 : 2.2} /></span><span>{label}</span>{label === 'Messages' && unreadMessages > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[9px] text-white">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}</NavLink>)}</nav>

    {incomingCall && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#193424]/55 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[32px] bg-white p-7 text-center shadow-soft"><div className="mx-auto mb-5 flex h-20 w-20 animate-pulse-soft items-center justify-center rounded-full bg-mint"><Avatar src={incomingCall.caller.avatar} name={incomingCall.caller.fullName} size="xl" online /></div><Pill tone="green">Incoming {incomingCall.kind} call</Pill><h2 className="mt-4 font-display text-2xl font-semibold">{incomingCall.caller.fullName}</h2><p className="mt-2 text-sm text-[#77847b]">Your study buddy is calling from your shared space.</p><div className="mt-7 grid grid-cols-2 gap-3"><Button variant="danger" onClick={declineCall}><PhoneCall size={16} className="rotate-[135deg]" />Decline</Button><Button onClick={acceptCall}><PhoneCall size={16} />Accept</Button></div></div></div>}
    {activeCall && <CallModal call={activeCall} onStop={endCall} onNext={endCall} />}
    {callError && <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[75] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-[#f2d0c8] bg-[#fff5f1] p-4 text-xs font-semibold text-[#a8523e] shadow-soft lg:bottom-6 lg:left-auto lg:right-6"><p className="flex-1 leading-5">{callError}</p><IconButton label="Dismiss call error" onClick={clearCallError} className="-mr-1 -mt-1 text-[#a8523e] hover:bg-[#fbe5df]"><X size={15} /></IconButton></div>}
    <MatchRequestOverlay />
  </div>
}
