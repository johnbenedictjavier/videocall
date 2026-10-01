import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useTyping(conversationId: string | undefined, userId: string | undefined, userName: string | undefined) {
  const [typingName, setTypingName] = useState<string | null>(null)
  const timeoutRef = useRef<number | undefined>(undefined)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const realtimeChannelRef = useRef<any>(null)

  useEffect(() => {
    if (!conversationId || !userId) return
    let realtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(`studymatch.typing.${conversationId}`)
      channelRef.current = channel
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.userId === userId) return
        setTypingName(event.data?.userName ?? 'Someone')
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(() => setTypingName(null), 1800)
      }
    }
    if (supabase) {
      realtimeChannel = supabase.channel(`typing:${conversationId}`)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.userId === userId) return
          setTypingName(payload?.userName ?? 'Someone')
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
          timeoutRef.current = window.setTimeout(() => setTypingName(null), 1800)
        })
        .subscribe()
      realtimeChannelRef.current = realtimeChannel
    }
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      channelRef.current?.close()
      channelRef.current = null
      realtimeChannelRef.current = null
      realtimeChannel?.unsubscribe()
    }
  }, [conversationId, userId])

  const notifyTyping = () => {
    const payload = { userId, userName }
    channelRef.current?.postMessage(payload)
    if (supabase && conversationId) void realtimeChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload })
  }

  return { typingName, notifyTyping }
}
