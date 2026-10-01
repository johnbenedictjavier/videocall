import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, Check, HeartHandshake, Keyboard, Loader2, MessageCircle, ShieldCheck, Square, Users, UsersRound, Video, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CallModal } from '../components/CallModal'
import { FloatingChat } from '../components/FloatingChat'
import { Button, Pill } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { acceptRandomRules, blockRandomUser, fetchRandomEncounter, finishRandomEncounter, hasAcceptedRandomRules, joinRandomQueue, leaveRandomQueue, reportRandomUser } from '../services/supabaseService'
import type { CallKind, MatchMode, RandomEncounter } from '../types'

type QueueState = 'selecting' | 'checking' | 'rules' | 'waiting' | 'matched' | 'stopped' | 'error' | 'demo'

const RULES_VERSION = 'random-meet-v1'
const MIN_PEER_MEMBERS = 3
const MAX_PEER_MEMBERS = 5

export function MatchPage() {
  const { currentUser, isDemo } = useAuth()
  const { refreshData } = useAppData()
  const userId = currentUser?.id
  const [kind, setKind] = useState<CallKind>('video')
  const [mode, setMode] = useState<MatchMode | null>(null)
  const [maxMembers, setMaxMembers] = useState(MAX_PEER_MEMBERS)
  const [queueState, setQueueState] = useState<QueueState>('selecting')
  const [encounter, setEncounter] = useState<RandomEncounter | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [acceptingRules, setAcceptingRules] = useState(false)
  const [error, setError] = useState('')
  const [lastConversationId, setLastConversationId] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)
  const requestRef = useRef(false)
  const matchingEnabledRef = useRef(false)
  const finishingRef = useRef(false)
  const encounterRef = useRef<RandomEncounter | null>(null)
  const mountedRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const queueNow = useCallback(async () => {
    if (!userId || isDemo || !isSupabaseConfigured || !mode || !matchingEnabledRef.current || requestRef.current) return
    requestRef.current = true
    setError('')
    try {
      const found = await joinRandomQueue(kind, mode, mode === 'peer' ? maxMembers : 2)
      if (!mountedRef.current || !matchingEnabledRef.current) return
      if (found) {
        encounterRef.current = found
        setEncounter(found)
        setQueueState('matched')
        stopPolling()
        void refreshData().catch(() => undefined)
      } else {
        setQueueState('waiting')
        if (pollingRef.current === null) pollingRef.current = window.setInterval(() => void queueNow(), 3500)
      }
    } catch (queueError) {
      if (!mountedRef.current) return
      setQueueState('error')
      setError(queueError instanceof Error ? queueError.message : 'Meet matching is not available right now.')
      stopPolling()
    } finally {
      requestRef.current = false
    }
  }, [isDemo, kind, maxMembers, mode, refreshData, stopPolling, userId])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!userId) return () => undefined
    if (isDemo || !isSupabaseConfigured) {
      setQueueState('demo')
      return () => undefined
    }

    setQueueState('selecting')
    return () => {
      stopPolling()
      requestRef.current = false
      matchingEnabledRef.current = false
      void leaveRandomQueue().catch(() => undefined)
    }
  }, [isDemo, stopPolling, userId])

  useEffect(() => {
    if (!encounter || !userId) return () => undefined
    const timer = window.setInterval(async () => {
      try {
        const current = await fetchRandomEncounter(userId)
        if (!mountedRef.current) return
        if (current?.id === encounter.id) {
          const membersChanged = current.participantIds.length !== encounter.participantIds.length || current.participantIds.some((participantId) => !encounter.participantIds.includes(participantId))
          if (membersChanged) {
            encounterRef.current = current
            setEncounter(current)
          }
          return
        }
        encounterRef.current = null
        setEncounter(null)
        setQueueState('waiting')
        await queueNow()
      } catch {
        // A temporary read failure should not interrupt a live room.
      }
    }, 3500)
    return () => window.clearInterval(timer)
  }, [encounter, queueNow, userId])

  const startMatching = async () => {
    if (!mode || !userId || queueState === 'matched' || queueState === 'waiting') return
    matchingEnabledRef.current = true
    setError('')
    setQueueState('checking')
    try {
      const accepted = await hasAcceptedRandomRules(userId, RULES_VERSION)
      if (!accepted) {
        setQueueState('rules')
        setRulesOpen(true)
        return
      }
      await queueNow()
    } catch (prepareError) {
      setQueueState('error')
      setError(prepareError instanceof Error ? prepareError.message : 'Unable to prepare Meet matching.')
    }
  }

  const acceptRulesAndStart = async () => {
    if (!userId || !mode) return
    setAcceptingRules(true)
    setError('')
    try {
      await acceptRandomRules(userId, RULES_VERSION)
      setRulesOpen(false)
      await queueNow()
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'The rules could not be saved.')
    } finally {
      setAcceptingRules(false)
    }
  }

  const stopMatching = useCallback(async () => {
    matchingEnabledRef.current = false
    stopPolling()
    await leaveRandomQueue().catch(() => undefined)
    encounterRef.current = null
    setEncounter(null)
    setQueueState('stopped')
  }, [stopPolling])

  const finishEncounter = async (status: 'ended' | 'skipped', requeue: boolean) => {
    const current = encounterRef.current
    if (!current || finishingRef.current) return
    finishingRef.current = true
    encounterRef.current = null
    setEncounter(null)
    setLastConversationId(current.conversationId ?? null)
    stopPolling()
    await finishRandomEncounter(current.id, status).catch(() => undefined)
    if (requeue && mode) {
      matchingEnabledRef.current = true
      setQueueState('waiting')
      await queueNow()
    } else {
      matchingEnabledRef.current = false
      await leaveRandomQueue().catch(() => undefined)
      setQueueState('stopped')
    }
    finishingRef.current = false
  }

  const chooseMode = (nextMode: MatchMode) => {
    if (queueState === 'matched' || queueState === 'waiting' || queueState === 'checking') return
    matchingEnabledRef.current = false
    setMode(nextMode)
    setQueueState('selecting')
    setError('')
  }

  const chooseKind = (nextKind: CallKind) => {
    if (queueState === 'matched' || queueState === 'waiting' || queueState === 'checking') return
    setKind(nextKind)
  }

  const blockUser = async () => {
    const current = encounterRef.current
    const otherUserId = current?.participantIds.find((participantId) => participantId !== userId)
    if (current && userId && otherUserId) await blockRandomUser(userId, otherUserId)
  }

  const reportUser = async (reason: string) => {
    const current = encounterRef.current
    const otherUserId = current?.participantIds.find((participantId) => participantId !== userId)
    if (current && userId && otherUserId) await reportRandomUser(userId, otherUserId, current.id, reason)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || rulesOpen) return
      if (queueState === 'waiting' || queueState === 'checking') {
        event.preventDefault()
        void stopMatching()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [queueState, rulesOpen, stopMatching])

  if (!currentUser) return null

  const waiting = queueState === 'checking' || queueState === 'waiting'
  const stateLabel = queueState === 'selecting' ? 'Choose a mode' : queueState === 'checking' ? 'Checking your access' : queueState === 'waiting' ? mode === 'peer' ? `Waiting for ${MIN_PEER_MEMBERS} peers` : 'Waiting for a person' : queueState === 'matched' ? 'Match found' : queueState === 'demo' ? 'Demo mode' : queueState === 'rules' ? 'Rules first' : queueState === 'stopped' ? 'Matching stopped' : 'Matching unavailable'
  const modeLabel = mode === 'peer' ? 'Peer room' : 'Study Buddy'

  return <div className="space-y-7">
    <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-[#758178]">Choose the kind of study call you want</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Meet someone new</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#78857c]">Matching never starts until you choose a room type. Study Buddy is one-to-one; Peer rooms open with three and hold up to five.</p>
      </div>
      <div className="flex rounded-2xl bg-mist p-1">
        <button onClick={() => chooseKind('video')} disabled={queueState === 'matched' || queueState === 'waiting' || queueState === 'checking'} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition sm:px-4 ${kind === 'video' ? 'bg-white text-ink shadow-sm' : 'text-[#829087]'}`}><Video size={15} />Video</button>
        <button onClick={() => chooseKind('voice')} disabled={queueState === 'matched' || queueState === 'waiting' || queueState === 'checking'} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition sm:px-4 ${kind === 'voice' ? 'bg-white text-ink shadow-sm' : 'text-[#829087]'}`}><Volume2 size={15} />Voice</button>
      </div>
    </section>

    <section className="grid gap-7 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="relative min-h-[470px] overflow-hidden rounded-[32px] bg-[#193b2a] p-6 text-white shadow-soft sm:p-9">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-white/[0.06]" />
        <div className="absolute -bottom-28 -left-20 h-64 w-64 rounded-full border-[34px] border-[#8fd3a0]/[0.08]" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-center justify-between gap-3"><Pill className="bg-white/10 text-[#d0ebd6]"><span className="h-1.5 w-1.5 rounded-full bg-[#7ce39b]" />{stateLabel}</Pill><span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">{mode ? `${modeLabel} · ${kind}` : `${kind} room`}</span></div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {queueState === 'selecting' && <><div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><UsersRound size={40} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Choose your room</h2><p className="mt-3 max-w-md text-sm leading-6 text-white/60">Pick a Study Buddy or Peer room before you enter the queue.</p><div className="mt-7 grid w-full max-w-lg gap-3 sm:grid-cols-2"><button onClick={() => chooseMode('buddy')} className={`rounded-2xl border p-4 text-left transition ${mode === 'buddy' ? 'border-[#a8e4b4] bg-white/15' : 'border-white/10 bg-white/[0.06] hover:bg-white/10'}`}><span className="flex items-center gap-2 text-sm font-extrabold"><HeartHandshake size={17} />Study Buddy</span><span className="mt-2 block text-xs leading-5 text-white/55">Exactly 2 people for a focused one-to-one session.</span></button><button onClick={() => chooseMode('peer')} className={`rounded-2xl border p-4 text-left transition ${mode === 'peer' ? 'border-[#a8e4b4] bg-white/15' : 'border-white/10 bg-white/[0.06] hover:bg-white/10'}`}><span className="flex items-center gap-2 text-sm font-extrabold"><UsersRound size={17} />Peer room</span><span className="mt-2 block text-xs leading-5 text-white/55">Starts at 3 people and fills up to 5.</span></button></div>{mode === 'peer' && <label className="mt-4 flex items-center gap-3 text-xs font-bold text-white/75">Maximum members<select value={maxMembers} onChange={(event) => setMaxMembers(Math.max(MIN_PEER_MEMBERS, Math.min(MAX_PEER_MEMBERS, Number(event.target.value))))} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none"><option value={3} className="text-ink">3</option><option value={4} className="text-ink">4</option><option value={5} className="text-ink">5</option></select></label>}{mode && <Button onClick={() => void startMatching()} className="mt-6 bg-white text-[#193b2a] hover:bg-[#edf8ef]"><ArrowRight size={16} />Start matching</Button>}</>}
            {queueState === 'checking' && <><Loader2 className="animate-spin text-[#9ee1ad]" size={34} /><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Checking the room rules...</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Your {modeLabel.toLowerCase()} queue is being prepared.</p></>}
            {queueState === 'rules' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><ShieldCheck size={45} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">A safe start matters</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Review the community rules before random matching begins.</p><Button onClick={() => setRulesOpen(true)} className="mt-7 bg-white text-[#193b2a] hover:bg-[#edf8ef]">Review rules</Button></>}
            {queueState === 'waiting' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><Users size={42} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Looking for {mode === 'peer' ? 'peers' : 'someone'}...</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Keep this page open. Your {modeLabel.toLowerCase()} room will open when the required people are ready.</p><Loader2 className="mt-7 animate-spin text-[#9ee1ad]" size={24} /><Button variant="ghost" onClick={() => void stopMatching()} className="mt-6 border border-white/15 text-white hover:bg-white/10"><Square size={15} />Stop <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">Esc</kbd></Button></>}
            {queueState === 'matched' && <><div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#8fd3a0]/20"><Camera size={42} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Connecting you now</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Your private {modeLabel.toLowerCase()} room is opening. {encounter && `${encounter.participantIds.length}/${encounter.maxMembers} members are in the room.`}</p></>}
            {queueState === 'stopped' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><Square size={38} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Matching is stopped</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Choose a room and start again whenever you are ready.</p><Button onClick={() => setQueueState('selecting')} className="mt-7 bg-white text-[#193b2a] hover:bg-[#edf8ef]"><ArrowRight size={16} />Choose a room</Button></>}
            {queueState === 'demo' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><Users size={42} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Real account required</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Demo Login is stored on one browser. Sign in with a Supabase account to match with people on other devices.</p></>}
            {queueState === 'error' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-[#f2a08f]/20 bg-[#f2a08f]/10"><X size={42} className="text-[#ffb3a5]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Could not start matching</h2><p className="mt-3 max-w-lg text-sm leading-6 text-white/60">{error}</p><Button onClick={() => void startMatching()} className="mt-7 bg-white text-[#193b2a] hover:bg-[#edf8ef]">Try again</Button></>}
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-white/45"><ShieldCheck size={14} />You can stop, skip, block, or report at any time.</div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-[28px] border border-[#e3ece3] bg-white p-6 shadow-card"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint text-moss"><ShieldCheck size={19} /></div><div><p className="font-display text-base font-semibold">Meet room rules</p><p className="text-[11px] text-[#87938b]">Adults 18+ only</p></div></div><ul className="mt-5 space-y-3 text-xs leading-5 text-[#647269]"><li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-moss" />Be respectful and get consent before sharing personal information.</li><li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-moss" />No nudity, sexual content, threats, hate, scams, or illegal activity.</li><li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-moss" />Use Stop, Next, Block, or Report immediately when anything feels unsafe.</li></ul><button onClick={() => setRulesOpen(true)} className="mt-5 text-xs font-extrabold text-moss underline underline-offset-4">Read the full rules</button></div>
        <div className="rounded-[28px] bg-[#fff7ed] p-6"><div className="flex items-center gap-3 text-[#a76b27]"><Keyboard size={18} /><p className="font-display text-base font-semibold">Quick controls</p></div><p className="mt-3 text-xs leading-5 text-[#967950]">Press <strong>Esc</strong> to stop. During a call, press <strong>Right Arrow</strong> for Next and a new match.</p>{lastConversationId && <Link to={`/messages/${lastConversationId}`} className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-[#a76b27]"><MessageCircle size={15} />Open the conversation</Link>}</div>
      </aside>
    </section>

    {rulesOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#172d20]/55 p-3 backdrop-blur-sm sm:items-center"><div className="w-full max-w-lg rounded-[30px] bg-white p-6 shadow-soft sm:p-8"><div className="flex items-start justify-between gap-4"><div><Pill tone="green">Before you meet</Pill><h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.04em]">Keep random chat safe</h2></div><button onClick={() => { setRulesOpen(false); if (queueState === 'rules') setQueueState('selecting') }} className="rounded-xl p-2 text-[#89958d] hover:bg-mist" aria-label="Close rules"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm leading-6 text-[#5d6b62]"><p>You must be 18 or older. Do not show or request nudity, sexual content, violence, illegal activity, personal documents, passwords, or financial information.</p><p>Be respectful. Do not harass, threaten, discriminate, record, or share another person’s video without consent.</p><p>Use <strong>Stop</strong>, <strong>Next</strong>, <strong>Block</strong>, or <strong>Report</strong> immediately when something feels unsafe. Serious or repeated violations may result in removal.</p></div>{error && <p className="mt-4 rounded-2xl bg-[#fff0ec] p-3 text-xs font-semibold leading-5 text-[#a8523e]">{error}</p>}<Button onClick={() => void acceptRulesAndStart()} disabled={acceptingRules} className="mt-7 w-full">{acceptingRules ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}I am 18+ and agree to the rules</Button></div></div>}
    {encounter && <CallModal call={{ id: encounter.id, encounterId: encounter.id, otherUserId: encounter.participantIds.find((participantId) => participantId !== userId), participantIds: encounter.participantIds, conversationId: encounter.conversationId, kind: encounter.kind }} onStop={() => finishEncounter('ended', false)} onNext={() => finishEncounter('skipped', true)} onBlock={blockUser} onReport={reportUser} />}
    {encounter?.conversationId && <FloatingChat conversationId={encounter.conversationId} />}
  </div>
}
