import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { storage } from '../lib/storage'
import { isSupabaseConfigured } from '../lib/supabase'
import { createCallInvite, fetchRemoteProfile, subscribeToUserEvents } from '../services/supabaseService'
import type { CallKind, Conversation, UserProfile } from '../types'
import { useAuth } from './AuthContext'

export type IncomingCall = {
  id: string
  conversationId: string
  kind: CallKind
  caller: UserProfile
}

type ActiveCall = {
  id: string
  conversationId: string
  kind: CallKind
}

type CallContextValue = {
  activeCall: ActiveCall | null
  incomingCall: IncomingCall | null
  startCall: (conversation: Conversation, kind: CallKind) => Promise<void>
  acceptCall: () => void
  declineCall: () => void
  endCall: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const { currentUser, isDemo } = useAuth()
  const remoteEnabled = Boolean(currentUser && isSupabaseConfigured && !isDemo)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (!currentUser) return
    const showIncoming = (payload: Record<string, unknown>, caller: UserProfile) => {
      const kind = payload.kind === 'voice' || payload.kind === 'video' ? payload.kind : null
      if (!kind || !payload.conversation_id) return
      setIncomingCall({ id: String(payload.id ?? crypto.randomUUID()), conversationId: String(payload.conversation_id), kind, caller })
    }
    const realtimeChannel = remoteEnabled ? subscribeToUserEvents(currentUser.id, (payload) => {
      const recipientIds = Array.isArray(payload.recipient_ids) ? payload.recipient_ids.map(String) : []
      const recipientId = payload.recipient_id ? String(payload.recipient_id) : ''
      const callerId = String(payload.caller_id ?? '')
      if (!callerId || callerId === currentUser.id || (!recipientIds.includes(currentUser.id) && recipientId !== currentUser.id) || !payload.conversation_id) return
      const caller = storage.profiles.find((profile) => profile.id === callerId)
      if (caller) showIncoming(payload, caller)
      else void fetchRemoteProfile(callerId).then((profile) => { if (profile) showIncoming(payload, profile) }).catch(() => undefined)
    }) : null
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('studymatch.calls')
      channelRef.current = channel
      channel.onmessage = (event: MessageEvent) => {
        const payload = event.data as { type?: string; recipientIds?: string[]; conversationId?: string; kind?: CallKind; callerId?: string; id?: string }
        if (payload.type !== 'invite' || !payload.recipientIds?.includes(currentUser.id) || !payload.conversationId || !payload.kind || !payload.callerId) return
        const caller = storage.profiles.find((profile) => profile.id === payload.callerId)
        if (!caller) return
        setIncomingCall({ id: payload.id ?? crypto.randomUUID(), conversationId: payload.conversationId, kind: payload.kind, caller })
      }
      return () => {
        channel.close()
        channelRef.current = null
        realtimeChannel?.unsubscribe()
      }
    }
    return () => realtimeChannel?.unsubscribe()
  }, [currentUser, remoteEnabled])

  const value = useMemo<CallContextValue>(() => ({
    activeCall,
    incomingCall,
    startCall: async (conversation, kind) => {
      if (!currentUser) return
      const recipientIds = conversation.memberIds.filter((memberId) => memberId !== currentUser.id)
      const remote = remoteEnabled ? await createCallInvite({ conversationId: conversation.id, callerId: currentUser.id, recipientIds, kind }) : null
      const id = String(remote?.id ?? crypto.randomUUID())
      if (channelRef.current) channelRef.current.postMessage({ type: 'invite', id, conversationId: conversation.id, kind, callerId: currentUser.id, recipientIds })
      setActiveCall({ id, conversationId: conversation.id, kind })
    },
    acceptCall: () => {
      if (!incomingCall) return
      setActiveCall({ id: incomingCall.id, conversationId: incomingCall.conversationId, kind: incomingCall.kind })
      setIncomingCall(null)
    },
    declineCall: () => setIncomingCall(null),
    endCall: () => setActiveCall(null),
  }), [activeCall, currentUser, incomingCall, remoteEnabled])

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export const useCalls = () => {
  const context = useContext(CallContext)
  if (!context) throw new Error('useCalls must be used inside CallProvider')
  return context
}
