import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react'
import { isSupabaseConfigured } from '../lib/supabase'
import { sendPasswordReset } from '../services/supabaseService'
import { useAuth } from '../context/AuthContext'
import { Button, Pill } from '../components/ui'
import type { StudyMode } from '../types'

export function AuthPage() {
  const { signIn, signUp, demoLogin } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [course, setCourse] = useState('')
  const [yearLevel, setYearLevel] = useState('')
  const [school, setSchool] = useState('')
  const [bio, setBio] = useState('')
  const [preferredStudyMode, setPreferredStudyMode] = useState<StudyMode>('Video call')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email)
        setNotice('Password reset instructions are on their way.')
      } else if (mode === 'signup') {
        await signUp({ email, password, fullName, username, course, yearLevel, school, bio, preferredStudyMode })
        setNotice('Account created. Check your email if confirmation is enabled.')
        setMode('login')
      } else {
        await signIn(email, password)
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)]">
    <BrandPanel />
    <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:justify-center lg:px-20 xl:px-28"><div className="mx-auto w-full max-w-md">
       <div className="flex items-center justify-between lg:hidden"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss text-white"><Sparkles size={17} fill="currentColor" /></div><span className="font-display font-bold tracking-[-0.05em]">TugmAI</span></div><Pill tone="green">Random Meet</Pill></div>
       <div className="mt-12 lg:mt-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-moss">Welcome to Random Meet</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{mode === 'forgot' ? 'Reset your password' : mode === 'signup' ? 'Create your account' : 'Meet someone new.'}</h2><p className="mt-3 text-sm leading-6 text-[#78857c]">{mode === 'forgot' ? 'Enter your email and we will send a secure reset link.' : 'Adults 18+ are paired automatically for respectful voice and video conversations.'}</p></div>
      {mode !== 'forgot' && <button onClick={() => demoLogin()} className="group mt-7 flex w-full items-center gap-4 rounded-[22px] border border-[#cfe5d3] bg-mint p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-moss shadow-sm"><Sparkles size={19} /></span><span className="flex-1"><span className="block text-sm font-extrabold text-ink">Explore the live demo</span><span className="mt-0.5 block text-xs text-[#6f8375]">Jump in as Alex · no account needed</span></span><ArrowRight size={18} className="text-moss transition group-hover:translate-x-1" /></button>}
      {mode !== 'forgot' && <div className="mt-4 flex items-center gap-3"><div className="h-px flex-1 bg-[#e4ebe4]" /><span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#a0aaa3]">{isSupabaseConfigured ? 'or use your account' : 'or connect Supabase'}</span><div className="h-px flex-1 bg-[#e4ebe4]" /></div>}
      <div className="mt-6 flex rounded-2xl bg-mist p-1">{(['login', 'signup'] as const).map((item) => <button key={item} onClick={() => { setMode(item); setError(''); setNotice('') }} className={`flex-1 rounded-xl py-2.5 text-xs font-extrabold transition ${mode === item ? 'bg-white text-ink shadow-sm' : 'text-[#829087]'}`}>{item === 'login' ? 'Log in' : 'Sign up'}</button>)}</div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === 'signup' && <><div className="grid gap-3 sm:grid-cols-2"><label className="field"><span>Full name</span><div className="relative"><UserRound className="absolute left-3 top-3.5 text-[#96a39a]" size={16} /><input value={fullName} onChange={(event) => setFullName(event.target.value)} required className="input pl-10" placeholder="Alex Johnson" /></div></label><label className="field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} required className="input" placeholder="alexj" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="field"><span>Course</span><input value={course} onChange={(event) => setCourse(event.target.value)} required className="input" placeholder="BS Computer Science" /></label><label className="field"><span>Year level</span><input value={yearLevel} onChange={(event) => setYearLevel(event.target.value)} required className="input" placeholder="2nd Year" /></label></div><label className="field"><span>School</span><input value={school} onChange={(event) => setSchool(event.target.value)} required className="input" placeholder="Northbridge University" /></label><label className="field"><span>Short bio</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} required className="input min-h-20 resize-y" placeholder="What do you enjoy learning?" /></label><label className="field"><span>Preferred study method</span><select value={preferredStudyMode} onChange={(event) => setPreferredStudyMode(event.target.value as StudyMode)} className="input"><option>Video call</option><option>Voice call</option><option>Text first</option><option>In person</option></select></label></>}
        <label className="field"><span>Email</span><div className="relative"><Mail className="absolute left-3 top-3.5 text-[#96a39a]" size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="input pl-10" placeholder="you@university.edu" /></div></label>
        {mode !== 'forgot' && <label className="field"><span>Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 text-[#96a39a]" size={16} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} className="input pl-10 pr-10" placeholder="At least 6 characters" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3.5 text-[#96a39a]">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
        {mode === 'login' && <button type="button" onClick={() => setMode('forgot')} className="text-xs font-bold text-moss hover:underline">Forgot password?</button>}
        {error && <div className="rounded-2xl bg-[#fff0ec] px-4 py-3 text-xs font-semibold leading-5 text-[#a8523e]">{error}</div>}
        {notice && <div className="flex items-start gap-2 rounded-2xl bg-mint px-4 py-3 text-xs font-semibold leading-5 text-moss"><Check size={15} className="mt-0.5 shrink-0" />{notice}</div>}
        <Button type="submit" disabled={busy} size="lg" className="mt-2 w-full">{busy ? 'Working...' : mode === 'forgot' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Enter StudyMatch'}<ArrowRight size={17} /></Button>
      </form>
      {mode === 'forgot' && <button onClick={() => setMode('login')} className="mt-4 w-full text-center text-xs font-bold text-[#758178] hover:text-moss">Back to login</button>}
      <div className="mt-8 flex items-start gap-3 border-t border-[#e7eee7] pt-5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-mist text-[#718077]"><LockKeyhole size={14} /></div><p className="text-[11px] leading-5 text-[#89958d]">Your profile and conversations are private. Supabase Row Level Security protects your learning spaces.</p></div>
    </div></section>
  </div>
}

function BrandPanel() {
  return <section className="relative hidden overflow-hidden bg-[#183525] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20"><div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border-[70px] border-[#6fa878]/10" /><div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full border-[50px] border-[#e98261]/10" /><div className="relative flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#8fcca0] text-[#173b28]"><Sparkles size={21} fill="currentColor" /></div><div><div className="font-display text-lg font-bold tracking-[-0.05em]">TugmAI</div><div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/50">StudyMatch</div></div></div><div className="relative max-w-xl"><Pill className="bg-white/10 text-[#c7e6cc]">Peer learning, made human</Pill><h1 className="mt-6 font-display text-5xl font-semibold leading-[1.08] tracking-[-0.06em] xl:text-6xl">Find the person who knows what you need to learn.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/65">TugmAI uses your real strengths and learning gaps to make study connections that actually help both sides grow.</p><div className="mt-10 grid max-w-md grid-cols-3 gap-3"><Metric value="45%" label="skill fit" /><Metric value="24/7" label="peer energy" /><Metric value="1:1" label="real support" /></div></div><p className="relative text-xs text-white/35">A learning product by TugmAI · Built for students who share the climb.</p></section>
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="font-display text-2xl font-semibold">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/45">{label}</p></div>
}
