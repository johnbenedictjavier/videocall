import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Camera, CameraOff, ChevronLeft, Circle, Flag, Loader2, MessageCircle, Mic, MicOff, PhoneOff, ScreenShare, ShieldAlert, SkipForward, Star, Video, Wifi, WifiOff, X } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { demoProfiles } from '../data/demoData'
import { createDailyEncounterRoom, createDailyRoom, fetchRemoteProfile, finalizeMeetingBoard, submitCallRating } from '../services/supabaseService'
import type { CallKind, UserProfile } from '../types'
import { formatDuration } from '../utils/format'
import { MeetingWorkspace } from './MeetingWorkspace'
import { Button, IconButton, Pill } from './ui'

type CallModalProps = {
  call: { id: string; conversationId?: string; encounterId?: string; otherUserId?: string; participantIds?: string[]; kind: CallKind }
  onStop: () => Promise<void> | void
  onNext?: () => Promise<void> | void
  onBlock?: (targetId: string) => Promise<void>
  onReport?: (targetId: string, category: string, details: string, contextMessageIds: string[]) => Promise<void>
}

type EndAction = 'stop' | 'next'
type ConsentRequest = { requestId: string; requesterId: string; stage: 'approve' | 'copy' }
type ConsentResponse = { approved: boolean; wantsCopy: boolean }
type RecordingMessage =
  | { type: 'recording-request'; requestId: string; requesterId: string }
  | { type: 'recording-response'; requestId: string; userId: string; approved: boolean; wantsCopy: boolean }
  | { type: 'recording-start'; requestId: string; recipients: string[] }
  | { type: 'recording-stop'; reason?: string }
  | { type: 'recording-cancel'; requestId: string }

const REPORT_CATEGORIES = ['Harassment', 'Nudity or sexual content', 'Threats or hate', 'Spam or scam', 'Other']
const isDesktopChrome = () => /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent) && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

export function CallModal({ call, onStop, onNext, onBlock, onReport }: CallModalProps) {
  const { currentUser, isDemo } = useAuth()
  const { getConversationMessages } = useAppData()
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<any>(null)
  const setupIdRef = useRef(0)
  const boardIdRef = useRef<string | null>(null)
  const endingRef = useRef(false)
  const recordingRef = useRef(false)
  const recordingFinishedRef = useRef<(() => void) | null>(null)
  const activeConsentRef = useRef<{ requestId: string; requesterId: string; approved: boolean | null; wantsCopy: boolean } | null>(null)
  const [joining, setJoining] = useState(true)
  const [connected, setConnected] = useState(false)
  const [usingDaily, setUsingDaily] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(call.kind === 'video')
  const [remaining, setRemaining] = useState(60 * 60)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyBusy, setSafetyBusy] = useState(false)
  const [endingAction, setEndingAction] = useState<EndAction | null>(null)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingBusy, setRatingBusy] = useState(false)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState('')
  const [targetProfiles, setTargetProfiles] = useState<UserProfile[]>([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState('')
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0])
  const [reportDetails, setReportDetails] = useState('')
  const [contextIds, setContextIds] = useState<string[]>([])
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [recording, setRecording] = useState(false)
  const [recordingPending, setRecordingPending] = useState(false)
  const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null)
  const [ownedRequestId, setOwnedRequestId] = useState<string | null>(null)
  const [consentResponses, setConsentResponses] = useState<Record<string, ConsentResponse>>({})
  const consentExpectedRef = useRef<string[]>([])

  const participantIds = useMemo(() => {
    const ids = call.participantIds?.length ? call.participantIds : call.otherUserId ? [call.otherUserId] : []
    return [...new Set(ids)].filter((id) => id && id !== currentUser?.id)
  }, [call.otherUserId, call.participantIds, currentUser?.id])
  const recentMessages = call.conversationId ? getConversationMessages(call.conversationId).filter((message) => message.kind !== 'system').slice(-10) : []
  const recordingSupported = !isDemo && isDesktopChrome()

  const refreshConnectedIds = useCallback((frame: any) => {
    const ids = Object.values(frame.participants?.() ?? {}).map((participant: any) => String(participant.user_id ?? '')).filter(Boolean)
    setConnectedIds([...new Set(ids)])
  }, [])

  const downloadRecordingData = useRef<Uint8Array[]>([])
  const startLocalRecording = useCallback(() => {
    if (!frameRef.current || recordingRef.current) return
    downloadRecordingData.current = []
    frameRef.current.startRecording({ type: 'local', maxDuration: Math.max(1, remaining) })
  }, [remaining])

  const stopLocalRecording = useCallback(() => {
    if (!frameRef.current || !recordingRef.current) return
    frameRef.current.stopRecording()
  }, [])

  const handleRecordingMessage = useCallback((message: RecordingMessage, fromUserId?: string) => {
    if (!currentUser) return
    if (message.type === 'recording-request' && message.requesterId !== currentUser.id) {
      if (!fromUserId || fromUserId !== message.requesterId) return
      if (!recordingSupported) {
        frameRef.current?.sendAppMessage?.({ type: 'recording-response', requestId: message.requestId, userId: currentUser.id, approved: false, wantsCopy: false } satisfies RecordingMessage)
        setNotice('A recording request was declined because local recording requires desktop Chrome.')
        return
      }
      activeConsentRef.current = { requestId: message.requestId, requesterId: message.requesterId, approved: null, wantsCopy: false }
      setConsentRequest({ requestId: message.requestId, requesterId: message.requesterId, stage: 'approve' })
      setRecordingPending(true)
    } else if (message.type === 'recording-response') {
      if (!ownedRequestId || message.requestId !== ownedRequestId || !fromUserId || fromUserId !== message.userId || !consentExpectedRef.current.includes(message.userId)) return
      setConsentResponses((current) => ({ ...current, [message.userId]: { approved: message.approved, wantsCopy: message.wantsCopy } }))
    } else if (message.type === 'recording-start') {
      const consent = activeConsentRef.current
      if (!consent || consent.requestId !== message.requestId || consent.requesterId !== fromUserId || consent.approved !== true) return
      setConsentRequest(null)
      setRecordingPending(false)
      if (message.recipients.includes(currentUser.id) && consent.wantsCopy) startLocalRecording()
      else setRecording(true)
      activeConsentRef.current = null
    } else if (message.type === 'recording-stop') {
      if (fromUserId && !connectedIds.includes(fromUserId)) return
      setConsentRequest(null)
      setRecordingPending(false)
      stopLocalRecording()
      setRecording(false)
      recordingRef.current = false
      if (message.reason) setNotice(message.reason)
    } else if (message.type === 'recording-cancel') {
      const consent = activeConsentRef.current
      if (consent && (consent.requestId !== message.requestId || consent.requesterId !== fromUserId)) return
      setConsentRequest(null)
      setRecordingPending(false)
      setNotice('The recording request was cancelled because the room changed or consent was declined.')
    }
  }, [connectedIds, currentUser, ownedRequestId, recordingSupported, startLocalRecording, stopLocalRecording])
  const recordingMessageRef = useRef(handleRecordingMessage)
  useEffect(() => { recordingMessageRef.current = handleRecordingMessage }, [handleRecordingMessage])

  useEffect(() => {
    const setupId = ++setupIdRef.current
    let fallbackTimer: number | undefined
    const join = async () => {
      if (isDemo) {
        fallbackTimer = window.setTimeout(() => {
          if (setupId !== setupIdRef.current) return
          setJoining(false)
          setConnected(true)
          setExpiresAt(Date.now() + 60 * 60 * 1000)
        }, 500)
        return
      }
      try {
        const room = call.encounterId ? await createDailyEncounterRoom(call.encounterId, call.kind) : call.conversationId ? await createDailyRoom(call.conversationId, call.kind, call.id) : null
        if (!room?.roomUrl || !containerRef.current || setupId !== setupIdRef.current) throw new Error('The live call room was not returned by the server.')
        const DailyIframe = (await import('@daily-co/daily-js')).default
        if (setupId !== setupIdRef.current || !containerRef.current) return
        const frame = DailyIframe.createFrame(containerRef.current, { showLeaveButton: false, showFullscreenButton: false, showLocalVideo: call.kind === 'video', iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '24px' } })
        frameRef.current = frame
        frame.on('camera-error', () => { setCameraOn(false); setNotice('Camera access is unavailable. The audio call can continue.') })
        frame.on('error', (event: any) => setError(event.errorMsg ?? 'The live call connection failed.'))
        frame.on('participant-joined', () => refreshConnectedIds(frame))
        frame.on('participant-left', () => refreshConnectedIds(frame))
        frame.on('app-message', (event: any) => {
          const sender = frame.participants?.()?.[event.fromId]
          recordingMessageRef.current(event.data as RecordingMessage, sender?.user_id ? String(sender.user_id) : undefined)
        })
        frame.on('recording-started', () => { recordingRef.current = true; setRecording(true); setRecordingPending(false) })
        frame.on('recording-stopped', () => { recordingRef.current = false; setRecording(false) })
        frame.on('recording-error', (event: any) => { recordingRef.current = false; setRecording(false); setError(event.errorMsg ?? 'The recording could not continue.') })
        frame.on('recording-data', (event: any) => {
          if (event.data?.length) downloadRecordingData.current.push(event.data)
          if (event.finished && downloadRecordingData.current.length) {
            const blob = new Blob(downloadRecordingData.current, { type: 'video/webm' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `studymatch-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            downloadRecordingData.current = []
            recordingFinishedRef.current?.()
            recordingFinishedRef.current = null
          }
        })
        await frame.join({ url: room.roomUrl, token: room.token, startVideoOff: call.kind !== 'video', startAudioOff: false })
        if (setupId !== setupIdRef.current) { await frame.leave(); frame.destroy(); return }
        frame.setShowLocalVideo(call.kind === 'video')
        refreshConnectedIds(frame)
        setExpiresAt(new Date(room.expiresAt).getTime())
        setUsingDaily(true)
        setJoining(false)
        setConnected(true)
      } catch (reason) {
        if (setupId === setupIdRef.current) { setJoining(false); setError(reason instanceof Error ? reason.message : 'The live call could not be started.') }
      }
    }
    void join()
    return () => {
      setupIdRef.current++
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      const frame = frameRef.current
      frameRef.current = null
      if (frame) { if (recordingRef.current) frame.stopRecording(); void frame.leave(); frame.destroy() }
    }
  }, [call.conversationId, call.encounterId, call.id, call.kind, isDemo, refreshConnectedIds, retryKey])

  useEffect(() => {
    if (!connected || !expiresAt) return
    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [connected, expiresAt])

  useEffect(() => {
    if (!participantIds.length || isDemo) { setTargetProfiles(demoProfiles.filter((profile) => participantIds.includes(profile.id))); return }
    let active = true
    void Promise.all(participantIds.map(fetchRemoteProfile)).then((profiles) => { if (active) setTargetProfiles(profiles.filter((profile): profile is UserProfile => Boolean(profile))) }).catch(() => undefined)
    return () => { active = false }
  }, [isDemo, participantIds])

  const profileName = (id: string, index = 0) => targetProfiles.find((profile) => profile.id === id)?.fullName ?? demoProfiles.find((profile) => profile.id === id)?.fullName ?? `Participant ${index + 1}`
  const boardReady = useCallback((id: string | null) => { boardIdRef.current = id }, [])

  useEffect(() => () => {
    if (boardIdRef.current && !isDemo) void finalizeMeetingBoard(boardIdRef.current).catch(() => undefined)
  }, [isDemo])

  useEffect(() => {
    if (!recording) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [recording])

  const leaveRoom = async () => {
    const frame = frameRef.current
    frameRef.current = null
    if (!frame) return
    if (recordingRef.current) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 10000)
        recordingFinishedRef.current = () => { window.clearTimeout(timeout); resolve() }
        frame.stopRecording()
      })
    }
    try { await frame.leave() } catch { /* Already disconnected. */ }
    frame.destroy()
    setUsingDaily(false)
  }

  const completeAction = async (action: EndAction) => {
    try { if (action === 'next' && onNext) await onNext(); else await onStop() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The call could not be closed.'); setEndingAction(null); endingRef.current = false }
  }

  const requestEnd = async (action: EndAction) => {
    if (endingRef.current || ratingOpen) return
    endingRef.current = true
    setEndingAction(action)
    frameRef.current?.sendAppMessage?.({ type: 'recording-stop', reason: 'The meeting ended.' } satisfies RecordingMessage)
    await leaveRoom()
    if (boardIdRef.current && !isDemo) await finalizeMeetingBoard(boardIdRef.current).catch(() => setNotice('The meeting ended, but the shared notes could not be finalized.'))
    if (!participantIds.length) { await completeAction(action); return }
    setRatingOpen(true)
  }

  useEffect(() => {
    if (remaining !== 0 || !connected || endingRef.current) return
    setNotice('The one-hour meeting limit has been reached.')
    void requestEnd('stop')
  }, [connected, remaining])

  useEffect(() => {
    if (remaining === 600) setNotice('10 minutes remain in this meeting.')
    if (remaining === 60) setNotice('1 minute remains in this meeting.')
  }, [remaining])

  useEffect(() => {
    if ((!recordingPending && !recording) || isDemo) return
    const expected = consentExpectedRef.current
    if (expected.length && expected.some((id) => !connectedIds.includes(id))) {
      frameRef.current?.sendAppMessage?.({ type: 'recording-cancel', requestId: ownedRequestId ?? consentRequest?.requestId ?? '' } satisfies RecordingMessage)
      if (recording) frameRef.current?.sendAppMessage?.({ type: 'recording-stop', reason: 'Recording stopped because the participant list changed.' } satisfies RecordingMessage)
      stopLocalRecording()
      setRecording(false)
      setRecordingPending(false)
      setConsentRequest(null)
      setOwnedRequestId(null)
    }
  }, [connectedIds, consentRequest?.requestId, isDemo, ownedRequestId, recording, recordingPending, stopLocalRecording])

  useEffect(() => {
    if (!recordingPending || !currentUser || !ownedRequestId) return
    const expected = consentExpectedRef.current
    if (!expected.length || expected.some((id) => !consentResponses[id])) return
    if (expected.some((id) => !consentResponses[id].approved)) {
      frameRef.current?.sendAppMessage?.({ type: 'recording-cancel', requestId: ownedRequestId } satisfies RecordingMessage)
      setRecordingPending(false)
      setConsentRequest(null)
      setOwnedRequestId(null)
      setNotice('Recording was not started because every participant must approve it.')
      return
    }
    const recipients = expected.filter((id) => consentResponses[id].wantsCopy)
    const message: RecordingMessage = { type: 'recording-start', requestId: ownedRequestId, recipients }
    frameRef.current?.sendAppMessage?.(message)
    recordingMessageRef.current(message, currentUser.id)
    setOwnedRequestId(null)
  }, [consentResponses, currentUser, ownedRequestId, recordingPending])

  const beginRecordingRequest = () => {
    if (!currentUser || !recordingSupported || connectedIds.length < 2) { setNotice(recordingSupported ? 'Wait for another participant to join before requesting a recording.' : 'Local recording is available only in desktop Chrome.'); return }
    const requestId = crypto.randomUUID()
    consentExpectedRef.current = connectedIds
    activeConsentRef.current = { requestId, requesterId: currentUser.id, approved: null, wantsCopy: false }
    setConsentResponses({})
    setOwnedRequestId(requestId)
    setConsentRequest({ requestId, requesterId: currentUser.id, stage: 'approve' })
    setRecordingPending(true)
  }

  const answerConsent = (approved: boolean, wantsCopy = false) => {
    if (!consentRequest || !currentUser) return
    if (approved && consentRequest.stage === 'approve') { setConsentRequest({ ...consentRequest, stage: 'copy' }); return }
    const response: RecordingMessage = { type: 'recording-response', requestId: consentRequest.requestId, userId: currentUser.id, approved, wantsCopy: approved && wantsCopy }
    activeConsentRef.current = { requestId: consentRequest.requestId, requesterId: consentRequest.requesterId, approved, wantsCopy: approved && wantsCopy }
    setConsentResponses((current) => ({ ...current, [currentUser.id]: { approved, wantsCopy: approved && wantsCopy } }))
    if (consentRequest.requesterId === currentUser.id) {
      const expected = connectedIds
      consentExpectedRef.current = expected
      frameRef.current?.sendAppMessage?.({ type: 'recording-request', requestId: consentRequest.requestId, requesterId: currentUser.id } satisfies RecordingMessage)
    } else frameRef.current?.sendAppMessage?.(response)
    setConsentRequest(null)
    if (consentRequest.requesterId !== currentUser.id) setRecordingPending(false)
  }

  const stopRecordingForEveryone = () => {
    const message: RecordingMessage = { type: 'recording-stop', reason: 'A participant stopped the recording.' }
    frameRef.current?.sendAppMessage?.(message)
    recordingMessageRef.current(message)
  }

  const submitReport = async () => {
    if (!onReport || !reportTarget || !reportDetails.trim()) return
    setSafetyBusy(true)
    try {
      await onReport(reportTarget, reportCategory, reportDetails.trim(), contextIds)
      setReportOpen(false)
      setSafetyOpen(false)
      setReportDetails('')
      setContextIds([])
      setNotice('Report submitted for review. The meeting will remain open.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The report could not be submitted.') }
    finally { setSafetyBusy(false) }
  }

  const submitBlock = async () => {
    const target = reportTarget || participantIds[0]
    if (!onBlock || !target) return
    setSafetyBusy(true)
    try { await onBlock(target); setNotice(`${profileName(target)} was blocked.`); setSafetyOpen(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The user could not be blocked.') }
    finally { setSafetyBusy(false) }
  }

  const skipRatings = async () => { if (endingAction && !ratingBusy) { setRatingOpen(false); await completeAction(endingAction) } }
  const submitRatings = async () => {
    if (!endingAction || ratingBusy) return
    setRatingBusy(true)
    try {
      await Promise.all(Object.entries(ratings).map(([rateeId, rating]) => submitCallRating({ encounterId: call.encounterId, callId: call.encounterId ? undefined : call.id, rateeId, rating, feedback })))
      setRatingOpen(false)
      await completeAction(endingAction)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The ratings could not be saved.') }
    finally { setRatingBusy(false) }
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || ratingOpen || reportOpen || consentRequest) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') { event.preventDefault(); void requestEnd('stop') }
      else if (event.key === 'ArrowRight' && onNext) { event.preventDefault(); void requestEnd('next') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [consentRequest, onNext, ratingOpen, reportOpen])

  const elapsed = Math.max(0, 60 * 60 - remaining)
  const warning = remaining <= 600
  const demoParticipants = demoProfiles.filter((profile) => call.participantIds?.includes(profile.id)).slice(0, 5)

  if (ratingOpen) return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10241a]/95 p-3"><section className="max-h-[calc(100dvh-24px)] w-full max-w-2xl overflow-y-auto rounded-[30px] bg-[#18271e] p-6 text-white sm:p-10"><div className="text-center"><Pill className="bg-white/10 text-white/70">Session feedback</Pill><h2 className="mt-4 font-display text-3xl font-semibold">How was your study session?</h2></div><div className="mt-7 space-y-3">{participantIds.map((id, index) => <div key={id} className="rounded-2xl bg-white/[0.06] p-4"><p className="text-sm font-extrabold">{profileName(id, index)}</p><div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => setRatings((current) => ({ ...current, [id]: value }))} className="p-2"><Star size={22} className={ratings[id] >= value ? 'fill-[#f6c86e] text-[#f6c86e]' : 'text-white/30'} /></button>)}</div></div>)}</div><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={500} placeholder="Optional feedback" className="mt-4 min-h-24 w-full rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm outline-none" /><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => void skipRatings()} disabled={ratingBusy} className="text-white"><SkipForward size={15} />Skip</Button><Button onClick={() => void submitRatings()} disabled={ratingBusy}>Submit ratings</Button></div></section></div>

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10241a]/90 p-2 backdrop-blur-md sm:p-5"><div className="relative flex h-[calc(100dvh-16px)] w-full max-w-7xl flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#18271e] shadow-2xl sm:h-[calc(100dvh-40px)]">
    <header className="flex shrink-0 items-center gap-3 px-4 py-3 text-white sm:px-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Wifi size={17} /></div><div className="min-w-0 flex-1"><p className="font-display text-sm font-semibold">{call.kind === 'video' ? 'Video meet' : 'Voice meet'}</p><p className={`text-[11px] ${warning ? 'font-bold text-[#ffd58a]' : 'text-white/50'}`}>{connected ? `${formatDuration(elapsed)} · ${formatDuration(remaining)} remaining` : joining ? 'Connecting securely...' : 'Unable to connect'}</p></div>{recording && <Pill className="bg-[#e87568]/20 text-[#ffb3a5]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#e87568]" />Recording</Pill>}<IconButton label={workspaceOpen ? 'Hide messages and board' : 'Show messages and board'} onClick={() => setWorkspaceOpen((open) => !open)} className="text-white/70 hover:bg-white/10"><MessageCircle size={17} /></IconButton><IconButton label="Stop call" onClick={() => void requestEnd('stop')} className="text-white/70 hover:bg-white/10"><PhoneOff size={17} /></IconButton></header>
    {notice && <div className="flex shrink-0 items-center gap-2 border-y border-[#f6c86e]/20 bg-[#f6c86e]/10 px-4 py-2 text-xs font-semibold text-[#ffe0a3]"><p className="flex-1">{notice}</p><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row"><div className="flex min-h-0 flex-1 flex-col"><div className="relative min-h-0 flex-1 p-3 sm:p-5"><div ref={containerRef} className="relative h-full min-h-[220px] overflow-hidden rounded-[24px] bg-[#23352a]">
      {isDemo && connected && <div className="grid h-full grid-cols-2 gap-3 p-4">{(demoParticipants.length ? demoParticipants : demoProfiles.slice(0, 2)).map((participant) => <div key={participant.id} className="flex flex-col items-center justify-center rounded-2xl bg-[#31483a]"><img src={participant.avatar} alt={participant.fullName} className="h-20 w-20 rounded-full object-cover" /><p className="mt-3 text-xs font-bold text-white">{participant.fullName}</p></div>)}</div>}
      {joining && <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#23352a]"><Loader2 className="animate-spin text-mint" size={30} /><p className="mt-4 text-sm font-bold text-white">Joining your private room...</p></div>}
      {!isDemo && error && !connected && <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#23352a] px-8 text-center text-white"><WifiOff className="text-coral" size={32} /><p className="mt-4 text-sm font-bold">Live call unavailable</p><p className="mt-2 max-w-md text-xs text-white/55">{error}</p><Button variant="ghost" onClick={() => { setError(''); setJoining(true); setRetryKey((value) => value + 1) }} className="mt-5 border border-white/15 text-white">Try again</Button></div>}
    </div></div>
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pb-4 sm:gap-3 sm:pb-6"><IconButton label={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={() => { const next = !muted; setMuted(next); frameRef.current?.setLocalAudio(!next) }} className={muted ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20'}>{muted ? <MicOff size={19} /> : <Mic size={19} />}</IconButton>{call.kind === 'video' && <IconButton label={cameraOn ? 'Turn camera off' : 'Turn camera on'} onClick={() => { const next = !cameraOn; setCameraOn(next); frameRef.current?.setLocalVideo(next) }} className={!cameraOn ? 'bg-white text-ink' : 'bg-white/10 text-white hover:bg-white/20'}>{cameraOn ? <Camera size={19} /> : <CameraOff size={19} />}</IconButton>}{call.kind === 'video' && <IconButton label="Share screen" onClick={() => frameRef.current?.startScreenShare?.()} className="bg-white/10 text-white hover:bg-white/20"><ScreenShare size={18} /></IconButton>}<IconButton label={recording ? 'Stop recording' : 'Request recording'} onClick={recording ? stopRecordingForEveryone : beginRecordingRequest} disabled={recordingPending} className={recording ? 'bg-[#e87568] text-white' : 'bg-white/10 text-white hover:bg-white/20'}>{recording ? <Circle size={17} fill="currentColor" /> : <Video size={18} />}</IconButton>{call.encounterId && onReport && <IconButton label="Safety options" onClick={() => setSafetyOpen((open) => !open)} className="bg-white/10 text-white hover:bg-white/20"><ShieldAlert size={18} /></IconButton>}<Button variant="danger" onClick={() => void requestEnd('stop')} disabled={Boolean(endingAction)} className="rounded-full"><PhoneOff size={17} />Stop</Button>{onNext && <Button variant="secondary" onClick={() => void requestEnd('next')} disabled={Boolean(endingAction)} className="rounded-full"><ArrowRight size={17} />Next</Button>}</footer></div>
    {workspaceOpen && <MeetingWorkspace conversationId={call.conversationId} callId={call.id} encounterId={call.encounterId} onBoardReady={boardReady} onClose={() => setWorkspaceOpen(false)} />}</div>
    {error && connected && <p className="absolute bottom-24 left-4 right-4 z-20 mx-auto max-w-lg rounded-2xl bg-[#fff0ec] p-3 text-xs font-semibold text-[#a8523e] shadow-xl">{error}</p>}
    {safetyOpen && <div className="absolute bottom-24 right-4 z-30 w-72 rounded-2xl border border-white/10 bg-[#10241a] p-3 text-white shadow-2xl"><p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">Safety tools</p><select value={reportTarget || participantIds[0] || ''} onChange={(event) => setReportTarget(event.target.value)} className="mb-2 w-full rounded-xl border border-white/10 bg-white/10 px-2 py-2 text-xs text-white outline-none">{participantIds.map((id, index) => <option key={id} value={id} className="text-ink">{profileName(id, index)}</option>)}</select><button onClick={() => { setReportTarget((target) => target || participantIds[0] || ''); setReportOpen(true); setSafetyOpen(false) }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold hover:bg-white/10"><Flag size={13} />Report selected participant</button>{onBlock && <button onClick={() => void submitBlock()} disabled={safetyBusy} className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-[#ffb3a5] hover:bg-white/10"><ShieldAlert size={13} />Block selected participant</button>}</div>}
    {reportOpen && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-3"><section className="max-h-[90%] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-5 text-ink shadow-2xl sm:p-7"><div className="flex items-start gap-3"><button onClick={() => setReportOpen(false)} className="rounded-xl p-2 hover:bg-mist"><ChevronLeft size={18} /></button><div className="flex-1"><h2 className="font-display text-xl font-semibold">Submit a report</h2><p className="mt-1 text-xs text-[#78857c]">Reports are queued for review and do not automatically end this meeting.</p></div></div><label className="mt-5 block text-xs font-extrabold">Participant<select value={reportTarget} onChange={(event) => setReportTarget(event.target.value)} className="input mt-2 w-full">{participantIds.map((id, index) => <option key={id} value={id}>{profileName(id, index)}</option>)}</select></label><label className="mt-4 block text-xs font-extrabold">Category<select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} className="input mt-2 w-full">{REPORT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="mt-4 block text-xs font-extrabold">What happened?<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={2000} className="input mt-2 min-h-24 w-full resize-none" placeholder="Describe the behavior for review" /></label>{recentMessages.length > 0 && <div className="mt-4"><p className="text-xs font-extrabold">Optional recent chat context</p><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{recentMessages.map((message) => <label key={message.id} className="flex items-start gap-2 rounded-xl bg-mist p-2 text-xs"><input type="checkbox" checked={contextIds.includes(message.id)} onChange={(event) => setContextIds((current) => event.target.checked ? [...current, message.id] : current.filter((id) => id !== message.id))} /><span className="line-clamp-2">{message.content || message.attachmentName}</span></label>)}</div></div>}<Button onClick={() => void submitReport()} disabled={safetyBusy || !reportTarget || !reportDetails.trim()} className="mt-5 w-full"><Flag size={15} />Submit for review</Button></section></div>}
    {consentRequest && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-3"><section className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center text-ink shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0ec] text-[#c85f50]"><Circle size={20} /></div><h2 className="mt-4 font-display text-xl font-semibold">{consentRequest.stage === 'approve' ? 'Approve the session record request?' : 'Do you also want to receive the recorded session?'}</h2><p className="mt-2 text-xs leading-5 text-[#78857c]">{consentRequest.stage === 'approve' ? 'Recording starts only if everyone approves. It captures meeting media, not your full screen.' : 'Choosing yes creates a local copy that downloads through your browser. Nothing is uploaded to StudyMatch.'}</p><div className="mt-6 grid grid-cols-2 gap-3"><Button variant="ghost" onClick={() => answerConsent(consentRequest.stage === 'copy', false)} className="border border-[#dfe8df]">No</Button><Button onClick={() => answerConsent(true, true)}>Yes</Button></div></section></div>}
  </div></div>
}
