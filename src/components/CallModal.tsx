import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Ban, Camera, CameraOff, Flag, Loader2, Mic, MicOff, PhoneOff, ScreenShare, ShieldAlert, SkipForward, Star, Users, Volume2, Wifi, WifiOff } from 'lucide-react'
import { demoProfiles } from '../data/demoData'
import { useAuth } from '../context/AuthContext'
import { fetchRemoteProfile, submitCallRating, createDailyEncounterRoom, createDailyRoom } from '../services/supabaseService'
import type { CallKind, UserProfile } from '../types'
import { formatDuration } from '../utils/format'
import { Button, IconButton, Pill } from './ui'

type CallModalProps = {
  call: { id: string; conversationId?: string; encounterId?: string; otherUserId?: string; participantIds?: string[]; kind: CallKind }
  onStop: () => Promise<void> | void
  onNext?: () => Promise<void> | void
  onBlock?: () => Promise<void>
  onReport?: (reason: string) => Promise<void>
}

type EndAction = 'stop' | 'next'

export function CallModal({ call, onStop, onNext, onBlock, onReport }: CallModalProps) {
  const { currentUser, isDemo } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<any>(null)
  const [joining, setJoining] = useState(true)
  const [connected, setConnected] = useState(false)
  const [usingDaily, setUsingDaily] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(call.kind === 'video')
  const [speakerOn, setSpeakerOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyBusy, setSafetyBusy] = useState(false)
  const [endingAction, setEndingAction] = useState<EndAction | null>(null)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingBusy, setRatingBusy] = useState(false)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState('')
  const [targetProfiles, setTargetProfiles] = useState<UserProfile[]>([])

  const participantIds = useMemo(() => {
    const ids = call.participantIds?.length ? call.participantIds : call.otherUserId ? [call.otherUserId] : []
    return [...new Set(ids)].filter((id) => id && id !== currentUser?.id)
  }, [call.otherUserId, call.participantIds, currentUser?.id])
  const members = demoProfiles.filter((profile) => call.participantIds?.includes(profile.id) ?? ['user-you', 'user-maria', 'user-joshua', 'user-anna'].includes(profile.id))
  const participants: UserProfile[] = (members.length ? members : demoProfiles).slice(0, 5)

  useEffect(() => {
    let mounted = true
    let fallbackTimer: number | undefined

    const join = async () => {
      if (isDemo) {
        fallbackTimer = window.setTimeout(() => {
          if (mounted) {
            setJoining(false)
            setConnected(true)
          }
        }, 850)
        return
      }

      try {
        const room = call.encounterId
          ? await createDailyEncounterRoom(call.encounterId, call.kind)
          : call.conversationId
            ? await createDailyRoom(call.conversationId, call.kind, call.id)
            : null
        if (!room?.roomUrl || !containerRef.current) throw new Error('The live call room was not returned by the server.')
        const DailyIframe = (await import('@daily-co/daily-js')).default
        const frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: false,
          showFullscreenButton: false,
          showLocalVideo: call.kind === 'video',
          iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '24px' },
        })
        frameRef.current = frame
        frame.on('camera-error', (event: any) => {
          if (mounted) {
            setCameraOn(false)
            setError(event.errorMsg?.errorMsg ?? event.errorMsg ?? 'Camera access was blocked. Check your browser permissions and try again.')
          }
        })
        frame.on('error', (event: any) => {
          if (mounted) setError(event.errorMsg ?? 'The live call connection failed.')
        })
        await frame.join({ url: room.roomUrl, token: room.token, startVideoOff: call.kind !== 'video', startAudioOff: false })
        frame.setShowLocalVideo(call.kind === 'video')
        if (mounted) {
          setUsingDaily(true)
          setJoining(false)
          setConnected(true)
        }
      } catch (joinError) {
        if (mounted) {
          setJoining(false)
          setError(joinError instanceof Error ? joinError.message : 'The live call could not be started.')
        }
      }
    }

    void join()
    return () => {
      mounted = false
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      if (frameRef.current) {
        void frameRef.current.leave()
        frameRef.current.destroy()
        frameRef.current = null
      }
    }
  }, [call.conversationId, call.id, call.kind, call.encounterId, isDemo, retryKey])

  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [connected])

  useEffect(() => {
    if (!ratingOpen || isDemo || !participantIds.length) return () => undefined
    let active = true
    void Promise.all(participantIds.map((id) => fetchRemoteProfile(id))).then((profiles) => {
      if (active) setTargetProfiles(profiles.filter((profile): profile is UserProfile => Boolean(profile)))
    }).catch(() => {
      if (active) setTargetProfiles([])
    })
    return () => {
      active = false
    }
  }, [isDemo, participantIds, ratingOpen])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    frameRef.current?.setLocalAudio(!next)
  }

  const toggleCamera = () => {
    const next = !cameraOn
    setCameraOn(next)
    frameRef.current?.setLocalVideo(next)
  }

  const completeAction = async (action: EndAction) => {
    try {
      if (action === 'next' && onNext) await onNext()
      else await onStop()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The call could not be closed.')
      setEndingAction(null)
    }
  }

  const leaveRoom = async () => {
    const frame = frameRef.current
    frameRef.current = null
    if (!frame) return
    try {
      await frame.leave()
    } catch {
      // The frame may already be disconnected when the user closes the call.
    }
    frame.destroy()
    setUsingDaily(false)
  }

  const requestEnd = async (action: EndAction) => {
    if (endingAction || ratingOpen) return
    setEndingAction(action)
    await leaveRoom()
    if (!participantIds.length) {
      await completeAction(action)
      return
    }
    setRatingOpen(true)
  }

  const skipRatings = async () => {
    if (!endingAction || ratingBusy) return
    setRatingOpen(false)
    await completeAction(endingAction)
  }

  const submitRatings = async () => {
    if (!endingAction || ratingBusy) return
    setRatingBusy(true)
    setError('')
    try {
      await Promise.all(Object.entries(ratings).map(([rateeId, rating]) => submitCallRating({
        encounterId: call.encounterId,
        callId: call.encounterId ? undefined : call.id,
        rateeId,
        rating,
        feedback,
      })))
      setRatingOpen(false)
      await completeAction(endingAction)
    } catch (ratingError) {
      setError(ratingError instanceof Error ? ratingError.message : 'The ratings could not be saved.')
    } finally {
      setRatingBusy(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || ratingOpen) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        void requestEnd('stop')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        void requestEnd('next')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [endingAction, participantIds.length, ratingOpen])

  const status = ratingOpen ? 'Rate your session' : usingDaily ? 'Daily live' : isDemo ? 'Demo room' : error ? 'Call unavailable' : 'Securing call'
  const safetyEnabled = Boolean(call.encounterId && call.otherUserId && (onBlock || onReport))
  const profileName = (id: string, index: number) => targetProfiles.find((profile) => profile.id === id)?.fullName ?? demoProfiles.find((profile) => profile.id === id)?.fullName ?? `Participant ${index + 1}`

  const submitReport = async (reason: string) => {
    if (!onReport) return
    setSafetyBusy(true)
    try {
      await onReport(reason)
      await requestEnd('stop')
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The report could not be submitted.')
    } finally {
      setSafetyBusy(false)
    }
  }

  const submitBlock = async () => {
    if (!onBlock) return
    setSafetyBusy(true)
    try {
      await onBlock()
      await requestEnd('stop')
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : 'The user could not be blocked.')
    } finally {
      setSafetyBusy(false)
    }
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10241a]/90 p-3 backdrop-blur-md sm:p-6"><div className="relative flex h-[min(760px,calc(100dvh-24px))] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#18271e] shadow-2xl sm:h-[min(760px,calc(100dvh-48px))]">
    <div className="flex items-center justify-between px-5 py-4 text-white sm:px-7"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Wifi size={17} /></div><div><p className="font-display text-sm font-semibold">{call.kind === 'video' ? 'Video meet' : 'Voice meet'}</p><p className="text-[11px] text-white/50">{ratingOpen ? 'Call ended' : connected ? formatDuration(elapsed) : joining ? 'Connecting securely...' : 'Unable to connect'}</p></div></div><div className="flex items-center gap-2"><Pill className="bg-white/10 text-white/70">{status}</Pill><IconButton label={ratingOpen ? 'Skip ratings' : 'Stop call'} onClick={() => ratingOpen ? void skipRatings() : void requestEnd('stop')} className="text-white/70 hover:bg-white/10 hover:text-white"><PhoneOff size={17} /></IconButton></div></div>
    {ratingOpen ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-12 sm:pb-8"><div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-6"><div className="text-center"><Pill className="bg-white/10 text-white/70">Session feedback</Pill><h2 className="mt-5 font-display text-3xl font-semibold tracking-[-0.05em] text-white">How was your study session?</h2><p className="mt-3 text-sm leading-6 text-white/55">Rate each participant you want to review. You can skip any participant or skip the whole form.</p></div><div className="mt-7 space-y-3">{participantIds.map((id, index) => <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><p className="text-sm font-extrabold text-white">{profileName(id, index)}</p><div className="mt-3 flex gap-1.5">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRatings((current) => ({ ...current, [id]: value }))} aria-label={`Rate ${profileName(id, index)} ${value} out of 5`} className="rounded-xl p-2 transition hover:bg-white/10"><Star size={22} className={ratings[id] && ratings[id] >= value ? 'fill-[#f6c86e] text-[#f6c86e]' : 'text-white/35'} /></button>)}</div></div>)}</div><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={500} placeholder="Optional feedback" className="mt-4 min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#a8e4b4]" />{error && <p className="mt-3 rounded-2xl bg-[#fff0ec] p-3 text-xs font-semibold leading-5 text-[#ffb3a5]">{error}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => void skipRatings()} disabled={ratingBusy} className="border border-white/10 text-white hover:bg-white/10"><SkipForward size={15} />Skip ratings</Button><Button onClick={() => void submitRatings()} disabled={ratingBusy} className="bg-white text-[#193b2a] hover:bg-[#edf8ef]">{ratingBusy ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}Finish</Button></div></div></div> : <>
      <div className="relative min-h-0 flex-1 px-3 pb-3 sm:px-5 sm:pb-5"><div ref={containerRef} className="relative h-full min-h-[220px] overflow-hidden rounded-[24px] bg-[#23352a]">
        {isDemo && !usingDaily && connected && <div className="absolute inset-0 flex flex-col p-3 sm:p-5"><div className={call.kind === 'video' ? 'grid h-full grid-cols-2 gap-3' : 'flex h-full flex-wrap items-center justify-center gap-5'}>{participants.map((participant, index) => <div key={participant.id} className={call.kind === 'video' ? 'relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-[#31483a]' : 'relative flex flex-col items-center justify-center'}><div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,180,140,0.16),transparent_45%)]" /><div className="relative"><div className="rounded-full bg-[#426450] p-1 shadow-xl"><img src={participant.avatar} alt={participant.fullName} className={call.kind === 'video' ? 'h-20 w-20 rounded-full object-cover sm:h-28 sm:w-28' : 'h-24 w-24 rounded-full object-cover'} /></div>{index === 0 && <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-moss text-white"><Mic size={13} /></span>}</div><div className={call.kind === 'video' ? 'absolute bottom-3 left-3 rounded-lg bg-black/30 px-2 py-1 text-[10px] font-bold text-white backdrop-blur' : 'mt-3 text-xs font-bold text-white'}>{participant.fullName}{index === 0 && ' (you)'}</div></div>)}</div><div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-black/20 px-3 py-2 text-[10px] font-bold text-white/75 backdrop-blur"><Users size={13} />{participants.length} in room</div></div>}
        {joining && <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#23352a]"><Loader2 className="animate-spin text-mint" size={30} /><p className="mt-4 text-sm font-bold text-white">Joining your private room...</p><p className="mt-1 text-xs text-white/45">Your encounter is private to the matched participants.</p></div>}
        {!isDemo && error && <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#23352a] px-8 text-center"><WifiOff className="text-coral" size={32} /><p className="mt-4 text-sm font-bold text-white">Live call unavailable</p><p className="mt-2 max-w-md text-xs leading-5 text-white/55">{error}</p><div className="mt-6 flex flex-wrap justify-center gap-2"><Button variant="ghost" onClick={() => { setError(''); setJoining(true); setRetryKey((value) => value + 1) }} className="border border-white/15 text-white hover:bg-white/10">Try again</Button><Button variant="ghost" onClick={() => void requestEnd('stop')} className="border border-white/15 text-white hover:bg-white/10">Stop</Button></div></div>}
      </div></div>
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 pb-4 sm:gap-3 sm:px-5 sm:pb-7"><IconButton label={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={toggleMute} className={muted ? 'bg-white text-ink hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'}>{muted ? <MicOff size={19} /> : <Mic size={19} />}</IconButton>{call.kind === 'video' && <IconButton label={cameraOn ? 'Turn camera off' : 'Turn camera on'} onClick={toggleCamera} className={!cameraOn ? 'bg-white text-ink hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'}>{cameraOn ? <Camera size={19} /> : <CameraOff size={19} />}</IconButton>}<IconButton label={speakerOn ? 'Turn speaker off' : 'Turn speaker on'} onClick={() => setSpeakerOn((value) => !value)} className={!speakerOn ? 'bg-white text-ink hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'}><Volume2 size={19} /></IconButton>{call.kind === 'video' && <IconButton label="Share screen" onClick={() => frameRef.current?.startScreenShare?.()} className="bg-white/10 text-white hover:bg-white/20"><ScreenShare size={18} /></IconButton>}{safetyEnabled && <IconButton label="Safety options" onClick={() => setSafetyOpen((open) => !open)} className="bg-white/10 text-white hover:bg-white/20"><ShieldAlert size={18} /></IconButton>}<Button variant="danger" size="lg" onClick={() => void requestEnd('stop')} disabled={Boolean(endingAction)} className="ml-1 rounded-full !bg-[#e87568] px-4 text-white hover:!bg-[#d96458]"><PhoneOff size={17} />Stop <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">Esc</kbd></Button><Button variant="secondary" size="lg" onClick={() => void requestEnd('next')} disabled={Boolean(endingAction)} className="rounded-full px-4"><ArrowRight size={17} />Next <kbd className="rounded bg-mist px-1.5 py-0.5 text-[10px]">→</kbd></Button></div>
      {safetyOpen && safetyEnabled && <div className="absolute bottom-24 right-4 z-20 w-64 rounded-2xl border border-white/10 bg-[#10241a] p-3 text-white shadow-2xl"><p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">Safety tools</p>{onReport && <div className="space-y-1">{['Harassment', 'Nudity or sexual content', 'Threats or hate', 'Spam or scam', 'Other'].map((reason) => <button key={reason} disabled={safetyBusy} onClick={() => void submitReport(reason)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-white/80 hover:bg-white/10"><Flag size={13} />Report: {reason}</button>)}</div>}{onBlock && <button disabled={safetyBusy} onClick={() => void submitBlock()} className="mt-2 flex w-full items-center gap-2 rounded-xl border-t border-white/10 px-2 pt-3 text-left text-xs font-semibold text-[#ffb3a5] hover:text-white"><Ban size={14} />Block and leave</button>}</div>}
    </>}</div></div>
}
