import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2, Mic, MicOff, PhoneOff, ScreenShare, Users, Volume2, Wifi } from 'lucide-react'
import { demoProfiles } from '../data/demoData'
import { createDailyRoom } from '../services/supabaseService'
import type { UserProfile } from '../types'
import { formatDuration } from '../utils/format'
import { Button, IconButton, Pill } from './ui'

type CallModalProps = {
  call: { id: string; conversationId: string; kind: 'voice' | 'video' }
  onClose: () => void
}

export function CallModal({ call, onClose }: CallModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<any>(null)
  const [connected, setConnected] = useState(false)
  const [usingDaily, setUsingDaily] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(call.kind === 'video')
  const [speakerOn, setSpeakerOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const members = demoProfiles.filter((profile) => ['user-you', 'user-maria', 'user-joshua', 'user-anna'].includes(profile.id))
  const participants: UserProfile[] = members.slice(0, call.kind === 'video' ? 4 : 3)

  useEffect(() => {
    let mounted = true
    let fallbackTimer: number | undefined
    const join = async () => {
      try {
        const room = await createDailyRoom(call.conversationId, call.kind, call.id)
        if (room?.roomUrl && containerRef.current) {
          const DailyIframe = (await import('@daily-co/daily-js')).default
          const frame = DailyIframe.createFrame(containerRef.current, {
            showLeaveButton: false,
            showFullscreenButton: false,
            iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '24px' },
          })
          frameRef.current = frame
          await frame.join({ url: room.roomUrl, token: room.token, startVideoOff: call.kind !== 'video', startAudioOff: false })
          if (mounted) {
            setUsingDaily(true)
            setConnected(true)
          }
          return
        }
      } catch (joinError) {
        if (mounted) setError(joinError instanceof Error ? joinError.message : 'Daily is not configured yet.')
      }
      fallbackTimer = window.setTimeout(() => {
        if (mounted) setConnected(true)
      }, 850)
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
  }, [call.conversationId, call.kind])

  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [connected])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (frameRef.current) frameRef.current.setLocalAudio(!next)
  }

  const toggleCamera = () => {
    const next = !cameraOn
    setCameraOn(next)
    if (frameRef.current) frameRef.current.setLocalVideo(next)
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10241a]/90 p-3 backdrop-blur-md sm:p-6"><div className="flex h-[min(760px,calc(100vh-24px))] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#18271e] shadow-2xl sm:h-[min(760px,calc(100vh-48px))]">
    <div className="flex items-center justify-between px-5 py-4 text-white sm:px-7"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Wifi size={17} /></div><div><p className="font-display text-sm font-semibold">{call.kind === 'video' ? 'Video study room' : 'Voice study room'}</p><p className="text-[11px] text-white/50">{connected ? formatDuration(elapsed) : 'Connecting securely...'}</p></div></div><div className="flex items-center gap-2"><Pill className="bg-white/10 text-white/70">{usingDaily ? 'Daily live' : 'Demo room'}</Pill><IconButton label="Close call" onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white"><PhoneOff size={17} /></IconButton></div></div>
    <div className="relative min-h-0 flex-1 px-3 pb-3 sm:px-5 sm:pb-5">
      <div ref={containerRef} className="relative h-full min-h-[340px] overflow-hidden rounded-[24px] bg-[#23352a]">
        {!usingDaily && <div className="absolute inset-0 flex flex-col p-3 sm:p-5"><div className={call.kind === 'video' ? 'grid h-full grid-cols-2 gap-3' : 'flex h-full items-center justify-center gap-5'}>{participants.map((participant, index) => <div key={participant.id} className={call.kind === 'video' ? 'relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-[#31483a]' : 'relative flex flex-col items-center justify-center'}><div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,180,140,0.16),transparent_45%)]" />{<div className="relative"><div className="rounded-full bg-[#426450] p-1 shadow-xl"><img src={participant.avatar} alt={participant.fullName} className={call.kind === 'video' ? 'h-20 w-20 rounded-full object-cover sm:h-28 sm:w-28' : 'h-24 w-24 rounded-full object-cover'} /></div>{index === 0 && <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-moss text-white"><Mic size={13} /></span>}</div>}<div className={call.kind === 'video' ? 'absolute bottom-3 left-3 rounded-lg bg-black/30 px-2 py-1 text-[10px] font-bold text-white backdrop-blur' : 'mt-3 text-xs font-bold text-white'}>{participant.fullName}{index === 0 && ' (you)'}</div></div>)}</div><div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-black/20 px-3 py-2 text-[10px] font-bold text-white/75 backdrop-blur"><Users size={13} />{participants.length} in room</div></div>}
        {!connected && <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#23352a]"><Loader2 className="animate-spin text-mint" size={30} /><p className="mt-4 text-sm font-bold text-white">Joining your study room...</p><p className="mt-1 text-xs text-white/45">Your call is private to this conversation.</p></div>}
        {error && !usingDaily && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-3 py-1.5 text-[10px] text-white/60 backdrop-blur">Demo mode: add Daily keys for live calls</div>}
      </div>
    </div>
    <div className="flex items-center justify-center gap-3 px-5 pb-5 sm:gap-4 sm:pb-7"><IconButton label={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={toggleMute} className={muted ? 'bg-white text-ink hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'}>{muted ? <MicOff size={19} /> : <Mic size={19} />}</IconButton>{call.kind === 'video' && <IconButton label={cameraOn ? 'Turn camera off' : 'Turn camera on'} onClick={toggleCamera} className={!cameraOn ? 'bg-white text-ink hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'}>{cameraOn ? <Camera size={19} /> : <CameraOff size={19} />}</IconButton>}<IconButton label={speakerOn ? 'Turn speaker off' : 'Turn speaker on'} onClick={() => setSpeakerOn((value) => !value)} className={!speakerOn ? 'bg-white text-ink hover:bg-white/90' : 'bg-white/10 text-white hover:bg-white/20'}><Volume2 size={19} /></IconButton>{call.kind === 'video' && <IconButton label="Share screen" onClick={() => frameRef.current?.startScreenShare?.()} className="bg-white/10 text-white hover:bg-white/20"><ScreenShare size={18} /></IconButton>}<Button variant="danger" size="lg" onClick={onClose} className="ml-2 rounded-full !bg-[#e87568] px-5 text-white hover:!bg-[#d96458]"><PhoneOff size={17} />End</Button></div>
  </div></div>
}
