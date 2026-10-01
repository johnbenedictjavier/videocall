import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, MessageCircle, ShieldCheck, SkipForward, Users, Video, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CallModal } from '../components/CallModal'
import { FloatingChat } from '../components/FloatingChat'
import { Button, Pill } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { acceptRandomRules, blockRandomUser, fetchRandomEncounter, finishRandomEncounter, hasAcceptedRandomRules, joinRandomQueue, leaveRandomQueue, reportRandomUser } from '../services/supabaseService'
import type { CallKind, RandomEncounter } from '../types'

type QueueState = 'checking' | 'rules' | 'waiting' | 'matched' | 'error' | 'demo'

const RULES_VERSION = 'random-meet-v1'

export function MatchPage() {
  const { currentUser, isDemo } = useAuth()
  const { refreshData } = useAppData()
  const userId = currentUser?.id
  const [kind, setKind] = useState<CallKind>('video')
  const [queueState, setQueueState] = useState<QueueState>('checking')
  const [encounter, setEncounter] = useState<RandomEncounter | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [acceptingRules, setAcceptingRules] = useState(false)
  const [error, setError] = useState('')
  const [lastConversationId, setLastConversationId] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)
  const requestRef = useRef(false)
  const encounterRef = useRef<RandomEncounter | null>(null)
  const mountedRef = useRef(true)

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const queueNow = useCallback(async () => {
    if (!userId || isDemo || requestRef.current) return
    requestRef.current = true
    setError('')
    try {
      const found = await joinRandomQueue(kind)
      if (!mountedRef.current) return
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
      setError(queueError instanceof Error ? queueError.message : 'Random matching is not available right now.')
      stopPolling()
    } finally {
      requestRef.current = false
    }
  }, [isDemo, kind, refreshData, stopPolling, userId])

  useEffect(() => {
    mountedRef.current = true
    if (!userId) return () => undefined
    if (isDemo || !isSupabaseConfigured) {
      setQueueState('demo')
      return () => undefined
    }

    let cancelled = false
    const prepare = async () => {
      setQueueState('checking')
      try {
        const accepted = await hasAcceptedRandomRules(userId, RULES_VERSION)
        if (cancelled || !mountedRef.current) return
        if (!accepted) {
          setQueueState('rules')
          setRulesOpen(true)
          return
        }
        await queueNow()
      } catch (prepareError) {
        if (!cancelled && mountedRef.current) {
          setQueueState('error')
          setError(prepareError instanceof Error ? prepareError.message : 'Unable to prepare random matching.')
        }
      }
    }
    void prepare()

    return () => {
      cancelled = true
      stopPolling()
      requestRef.current = false
      void leaveRandomQueue().catch(() => undefined)
    }
  }, [isDemo, kind, queueNow, stopPolling, userId])

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  useEffect(() => {
    if (!encounter || !userId) return () => undefined
    const timer = window.setInterval(async () => {
      try {
        const current = await fetchRandomEncounter(userId)
        if (current?.id === encounter.id || !mountedRef.current) return
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

  const acceptRulesAndStart = async () => {
    if (!userId) return
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

  const finishEncounter = async (status: 'ended' | 'skipped' = 'skipped') => {
    const current = encounterRef.current
    if (!current) return
    encounterRef.current = null
    setEncounter(null)
    setLastConversationId(current.conversationId ?? null)
    setQueueState('waiting')
    stopPolling()
    await finishRandomEncounter(current.id, status).catch(() => undefined)
    await queueNow()
  }

  const chooseKind = (nextKind: CallKind) => {
    if (queueState === 'matched') return
    setKind(nextKind)
  }

  const blockAndLeave = async () => {
    const current = encounterRef.current
    const otherUserId = current?.participantIds.find((participantId) => participantId !== userId)
    if (current && userId && otherUserId) await blockRandomUser(userId, otherUserId)
    await finishEncounter('ended')
  }

  const reportAndLeave = async (reason: string) => {
    const current = encounterRef.current
    const otherUserId = current?.participantIds.find((participantId) => participantId !== userId)
    if (current && userId && otherUserId) await reportRandomUser(userId, otherUserId, current.id, reason)
    await finishEncounter('ended')
  }

  if (!currentUser) return null

  const waiting = queueState === 'checking' || queueState === 'waiting'
  const stateLabel = queueState === 'checking' ? 'Checking your access' : queueState === 'waiting' ? 'Waiting for a person' : queueState === 'matched' ? 'Match found' : queueState === 'demo' ? 'Demo mode' : queueState === 'rules' ? 'Rules first' : 'Matching unavailable'

  return <div className="space-y-7">
    <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-[#758178]">Random, one-to-one conversations</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Meet someone new</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#78857c]">You will be paired automatically with the next available adult. No requests, profiles, or awkward introductions.</p>
      </div>
      <div className="flex rounded-2xl bg-mist p-1">
        <button onClick={() => chooseKind('video')} disabled={queueState === 'matched'} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition sm:px-4 ${kind === 'video' ? 'bg-white text-ink shadow-sm' : 'text-[#829087]'}`}><Video size={15} />Video</button>
        <button onClick={() => chooseKind('voice')} disabled={queueState === 'matched'} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition sm:px-4 ${kind === 'voice' ? 'bg-white text-ink shadow-sm' : 'text-[#829087]'}`}><Volume2 size={15} />Voice</button>
      </div>
    </section>

    <section className="grid gap-7 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="relative min-h-[470px] overflow-hidden rounded-[32px] bg-[#193b2a] p-6 text-white shadow-soft sm:p-9">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-white/[0.06]" />
        <div className="absolute -bottom-28 -left-20 h-64 w-64 rounded-full border-[34px] border-[#8fd3a0]/[0.08]" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-center justify-between gap-3"><Pill className="bg-white/10 text-[#d0ebd6]"><span className="h-1.5 w-1.5 rounded-full bg-[#7ce39b]" />{stateLabel}</Pill><span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">{kind} room</span></div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {waiting && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><Users size={42} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">{queueState === 'checking' ? 'Getting things ready...' : 'Looking for someone...'}</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Keep this page open. When another person is ready, your private room will open automatically.</p><Loader2 className="mt-7 animate-spin text-[#9ee1ad]" size={24} /> </>}
            {queueState === 'rules' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><ShieldCheck size={45} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">A safe start matters</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Review the community rules before random matching begins.</p><Button onClick={() => setRulesOpen(true)} className="mt-7 bg-white text-[#193b2a] hover:bg-[#edf8ef]">Review rules</Button></>}
            {queueState === 'matched' && <><div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#8fd3a0]/20"><Camera size={42} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Connecting you now</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Your private {kind} room is opening. Keep camera and microphone permissions ready.</p></>}
            {queueState === 'demo' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.08]"><Users size={42} className="text-[#bde7c6]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Real account required</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Demo Login is stored on one browser. Sign in with a Supabase account to match with a different phone.</p></>}
            {queueState === 'error' && <><div className="flex h-28 w-28 items-center justify-center rounded-full border border-[#f2a08f]/20 bg-[#f2a08f]/10"><X size={42} className="text-[#ffb3a5]" /></div><h2 className="mt-7 font-display text-3xl font-semibold tracking-[-0.05em]">Could not start matching</h2><p className="mt-3 max-w-lg text-sm leading-6 text-white/60">{error}</p><Button onClick={() => void queueNow()} className="mt-7 bg-white text-[#193b2a] hover:bg-[#edf8ef]">Try again</Button></>}
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-white/45"><ShieldCheck size={14} />You can leave, skip, or report at any time.</div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-[28px] border border-[#e3ece3] bg-white p-6 shadow-card"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint text-moss"><ShieldCheck size={19} /></div><div><p className="font-display text-base font-semibold">Random meet rules</p><p className="text-[11px] text-[#87938b]">Adults 18+ only</p></div></div><ul className="mt-5 space-y-3 text-xs leading-5 text-[#647269]"><li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-moss" />Be respectful and get consent before sharing personal information.</li><li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-moss" />No nudity, sexual content, threats, hate, scams, or illegal activity.</li><li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-moss" />Use Block, Report, or Next if anything feels unsafe.</li></ul><button onClick={() => setRulesOpen(true)} className="mt-5 text-xs font-extrabold text-moss underline underline-offset-4">Read the full rules</button></div>
        <div className="rounded-[28px] bg-[#fff7ed] p-6"><div className="flex items-center gap-3 text-[#a76b27]"><SkipForward size={18} /><p className="font-display text-base font-semibold">How it works</p></div><p className="mt-3 text-xs leading-5 text-[#967950]">Both phones enter the same live queue. The server pairs two available people and creates a private Daily room. Closing the room automatically searches again.</p>{lastConversationId && <Link to={`/messages/${lastConversationId}`} className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-[#a76b27]"><MessageCircle size={15} />Open the conversation</Link>}</div>
      </aside>
    </section>

     {rulesOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#172d20]/55 p-3 backdrop-blur-sm sm:items-center"><div className="w-full max-w-lg rounded-[30px] bg-white p-6 shadow-soft sm:p-8"><div className="flex items-start justify-between gap-4"><div><Pill tone="green">Before you meet</Pill><h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.04em]">Keep random chat safe</h2></div><button onClick={() => setRulesOpen(false)} className="rounded-xl p-2 text-[#89958d] hover:bg-mist" aria-label="Close rules"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm leading-6 text-[#5d6b62]"><p>You must be 18 or older. Do not show or request nudity, sexual content, violence, illegal activity, personal documents, passwords, or financial information.</p><p>Be respectful. Do not harass, threaten, discriminate, record, or share another person’s video without consent.</p><p>Use <strong>Next</strong>, <strong>Block</strong>, or <strong>Report</strong> immediately when something feels unsafe. Serious or repeated violations may result in removal.</p></div>{error && <p className="mt-4 rounded-2xl bg-[#fff0ec] p-3 text-xs font-semibold leading-5 text-[#a8523e]">{error}</p>}<Button onClick={() => void acceptRulesAndStart()} disabled={acceptingRules} className="mt-7 w-full">{acceptingRules ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}I am 18+ and agree to the rules</Button></div></div>}
     {encounter && <CallModal call={{ id: encounter.id, encounterId: encounter.id, otherUserId: encounter.participantIds.find((participantId) => participantId !== userId), conversationId: encounter.conversationId, kind: encounter.kind }} onClose={() => void finishEncounter('skipped')} onBlock={blockAndLeave} onReport={reportAndLeave} />}
     {encounter?.conversationId && <FloatingChat conversationId={encounter.conversationId} />}
   </div>
 }
