import { useEffect, useState } from 'react'
import { Check, HeartHandshake, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { storage } from '../lib/storage'
import { fetchRemoteProfile } from '../services/supabaseService'
import { Avatar, Button, Pill } from './ui'

export function MatchRequestOverlay() {
  const { currentUser, isDemo } = useAuth()
  const { requests, updateRequest } = useAppData()
  const [busy, setBusy] = useState(false)
  if (!currentUser) return null
  const request = requests.filter((item) => item.recipientId === currentUser.id && item.status === 'pending').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  const [remoteSender, setRemoteSender] = useState<import('../types').UserProfile | null>(null)
  useEffect(() => {
    if (!request || isDemo) {
      setRemoteSender(null)
      return
    }
    void fetchRemoteProfile(request.senderId).then(setRemoteSender).catch(() => setRemoteSender(null))
  }, [isDemo, request])
  const sender = request ? isDemo ? storage.profiles.find((profile) => profile.id === request.senderId) : remoteSender : undefined
  if (!request || !sender) return null

  const respond = async (status: 'accepted' | 'declined') => {
    setBusy(true)
    await updateRequest(request.id, status)
    setBusy(false)
  }

  return <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-[26px] border border-[#cfe5d3] bg-white p-4 shadow-soft lg:bottom-6 lg:left-auto lg:right-6"><div className="flex items-start gap-3"><Avatar src={sender.avatar} name={sender.fullName} size="md" online={sender.online} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Pill tone="green"><HeartHandshake size={11} />New request</Pill><span className="text-[10px] font-bold text-moss">{request.score}%</span></div><p className="mt-2 text-sm font-extrabold">{sender.fullName} wants to study with you.</p><p className="mt-1 text-xs leading-5 text-[#7e8b82]">Your strengths complement their learning gaps. Accept to open a private room.</p></div><button onClick={() => void respond('declined')} disabled={busy} className="rounded-xl p-1.5 text-[#9aa59d] hover:bg-mist"><X size={15} /></button></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="secondary" size="sm" onClick={() => void respond('declined')} disabled={busy}>Decline</Button><Button size="sm" onClick={() => void respond('accepted')} disabled={busy}><Check size={14} />Accept & chat</Button></div></div>
}
