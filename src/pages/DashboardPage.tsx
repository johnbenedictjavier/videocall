import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, MessageCircle, Play, Sparkles, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoProfiles } from '../data/demoData'
import { findBuddyMatches } from '../features/matching/matching'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { formatAvailability, formatRelativeTime } from '../utils/format'
import { Avatar, Button, Pill, ProgressBar, ScoreRing, SectionTitle } from '../components/ui'

export function DashboardPage() {
  const { currentUser } = useAuth()
  const { conversations } = useAppData()
  if (!currentUser) return null

  const topMatch = findBuddyMatches(currentUser, demoProfiles)[0]
  const weeklyProgress = Math.min(100, currentUser.stats.learningHours / 60 * 100)

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#758178]">Wednesday, September 30</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Ready to make progress, {currentUser.fullName.split(' ')[0]}?</h1>
        </div>
        <Pill tone="green"><span className="h-1.5 w-1.5 rounded-full bg-[#55b97e]" />You are learning in public</Pill>
      </div>

      <section className="relative overflow-hidden rounded-[30px] bg-[#234c36] p-6 text-white shadow-soft sm:p-8">
        <div className="absolute -right-8 -top-24 h-72 w-72 rounded-full border-[48px] border-white/[0.06]" />
        <div className="absolute -bottom-40 right-48 h-72 w-72 rounded-full border-[42px] border-[#8bc693]/10" />
        <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <Pill className="bg-white/10 text-[#cbe8ce]">Your next useful connection</Pill>
            <h2 className="mt-5 max-w-xl font-display text-3xl font-semibold leading-tight tracking-[-0.055em] sm:text-4xl">Trade what you know for what you need.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/65">Your skill profile is ready. Find a buddy who can make Java OOP click, while you unlock their database confidence.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Link to="/match"><Button className="bg-white !text-[#234c36] shadow-none hover:bg-[#eff8f0]"><Sparkles size={16} />Find my match<ArrowRight size={16} /></Button></Link><Link to="/skillgps"><Button variant="ghost" className="border border-white/15 text-white hover:bg-white/10">Open SkillGPS</Button></Link></div>
          </div>
          <div className="relative mx-auto flex w-full max-w-[310px] items-center justify-center lg:justify-end"><div className="absolute inset-8 rounded-full border border-white/10" /><div className="absolute inset-16 rounded-full border border-dashed border-white/15" /><div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-white/10 backdrop-blur"><div className="flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-[#315d43]"><ScoreRing score={topMatch.score} size="lg" /></div><div className="absolute -right-1 top-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-coral text-white shadow-lg"><UsersRound size={18} /></div><div className="absolute -bottom-1 left-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#8bc693] text-[#234c36] shadow-lg"><BookOpen size={18} /></div></div></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Buddy sessions" value={String(currentUser.stats.buddySessions)} note="+3 this month" icon={<UsersRound size={15} />} tone="green" />
        <StatCard label="Students helped" value={String(currentUser.stats.studentsHelped)} note="You are a great peer" icon={<CheckCircle2 size={15} />} tone="orange" />
        <StatCard label="Learning hours" value={`${currentUser.stats.learningHours} hrs`} note="This semester" icon={<Clock3 size={15} />} tone="blue" />
        <div className="rounded-[24px] border border-[#e4ece4] bg-white p-5 shadow-card"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#758178]">Weekly rhythm</span><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f1ecff] text-[#8065c2]"><CalendarDays size={15} /></span></div><p className="mt-5 font-display text-3xl font-semibold">{Math.round(weeklyProgress)}<span className="ml-1 text-sm font-sans font-semibold text-[#87938b]">%</span></p><ProgressBar value={weeklyProgress} color="bg-[#8065c2]" className="mt-2" /></div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <section><SectionTitle eyebrow="Calculated from your profile" title="A match worth meeting" action={<Link to="/match" className="flex items-center gap-1 text-xs font-extrabold text-moss">See all <ArrowRight size={14} /></Link>} /><div className="rounded-[28px] border border-[#e4ece4] bg-white p-5 shadow-card sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><Avatar src={topMatch.profile.avatar} name={topMatch.profile.fullName} size="lg" online={topMatch.profile.online} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-semibold tracking-[-0.04em]">{topMatch.profile.fullName}</h3><Pill tone="green">Best fit</Pill></div><p className="mt-1 text-xs text-[#859188]">{topMatch.profile.course} · {topMatch.profile.yearLevel}</p><p className="mt-3 text-sm leading-6 text-[#69766e]">{topMatch.profile.bio}</p></div><ScoreRing score={topMatch.score} /></div><div className="my-5 h-px bg-[#edf2ed]" /><div className="grid gap-4 sm:grid-cols-2"><SkillList title="They can help you with" skills={topMatch.needsHelp} tone="green" /><SkillList title="You can help them with" skills={topMatch.canHelp} tone="orange" /></div><div className="mt-5 flex items-center justify-between border-t border-[#edf2ed] pt-4"><span className="flex items-center gap-1.5 text-xs font-semibold text-[#87938b]"><Clock3 size={14} />{formatAvailability(topMatch.sharedAvailability)}</span><Link to="/match"><Button size="sm">View match <ArrowRight size={14} /></Button></Link></div></div></section>
        <section><SectionTitle eyebrow="Keep the loop going" title="Recent study spaces" action={<Link to="/messages" className="flex items-center gap-1 text-xs font-extrabold text-moss">Inbox <ArrowRight size={14} /></Link>} /><div className="space-y-3">{conversations.slice(0, 2).map((conversation) => <Link to={`/messages/${conversation.id}`} key={conversation.id} className="flex items-center gap-3 rounded-[22px] border border-[#e4ece4] bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-moss/30"><Avatar src={conversation.avatar} name={conversation.name} size="md" online={conversation.online} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-extrabold">{conversation.name}</p><span className="shrink-0 text-[10px] font-semibold text-[#9aa59d]">{formatRelativeTime(conversation.lastMessageAt)}</span></div><p className="mt-1 truncate text-xs text-[#7d8981]">{conversation.lastMessage}</p></div>{conversation.unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-[10px] font-bold text-white">{conversation.unreadCount}</span>}</Link>)}<Link to="/messages" className="flex items-center justify-center gap-2 rounded-[22px] border border-dashed border-[#dce6dc] py-4 text-xs font-extrabold text-[#78857c] transition hover:border-moss/40 hover:text-moss"><MessageCircle size={15} />Open all conversations</Link></div></section>
      </div>

      <section className="rounded-[28px] border border-[#e4ece4] bg-white p-5 shadow-card sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><Pill tone="orange">Small steps count</Pill><h2 className="mt-3 font-display text-xl font-semibold tracking-[-0.04em]">Your learning loop this week</h2><p className="mt-1 text-sm text-[#7e8a81]">One useful conversation beats an hour of passive scrolling.</p></div><div className="flex gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint text-moss"><Play size={16} fill="currentColor" /></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0d9] text-[#ad6a1d]"><BookOpen size={16} /></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f2ff] text-[#4774b9]"><MessageCircle size={16} /></div></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><LoopItem done title="Refresh a skill" text="Keep your profile honest" /><LoopItem title="Meet one peer" text="Your next connection is waiting" /><LoopItem title="Share one win" text="Teach it forward" /></div></section>
    </div>
  )
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: React.ReactNode; tone: 'green' | 'orange' | 'blue' }) {
  const colors = { green: 'bg-mint text-moss', orange: 'bg-[#fff0d9] text-[#ad6a1d]', blue: 'bg-[#e9f2ff] text-[#4774b9]' }
  return <div className="rounded-[24px] border border-[#e4ece4] bg-white p-5 shadow-card"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#758178]">{label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${colors[tone]}`}>{icon}</span></div><p className="mt-5 font-display text-3xl font-semibold">{value}</p><p className="mt-1 text-[11px] font-bold text-[#55a273]">{note}</p></div>
}

function SkillList({ title, skills, tone }: { title: string; skills: { name: string }[]; tone: 'green' | 'orange' }) {
  return <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#95a098]">{title}</p><div className="mt-2 flex flex-wrap gap-2">{skills.slice(0, 3).map((skill) => <span key={skill.name} className={`rounded-xl px-2.5 py-1.5 text-xs font-bold ${tone === 'green' ? 'bg-mint text-moss' : 'bg-[#fff0d9] text-[#a96b24]'}`}>{skill.name}</span>)}</div></div>
}

function LoopItem({ title, text, done = false }: { title: string; text: string; done?: boolean }) {
  return <div className="flex items-center gap-3 rounded-2xl bg-cream p-3"><CheckCircle2 size={17} className={done ? 'text-moss' : 'text-[#b0bdb4]'} /><div><p className="text-xs font-extrabold">{title}</p><p className="text-[11px] text-[#89958d]">{text}</p></div></div>
}
