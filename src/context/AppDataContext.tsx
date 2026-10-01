import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { storage } from '../lib/storage'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { clearRemoteConversationHistory, createRemoteConversation, fetchRemoteConversations, fetchRemoteNotifications, fetchRemoteRequests, insertCalculatedMatch, insertMessage, insertMatchRequest as createRemoteRequest, markRemoteConversationRead, markRemoteNotificationRead, subscribeToConversation, subscribeToUserEvents, updateMatchRequest, uploadChatAttachment } from '../services/supabaseService'
import type { Conversation, MatchRequest, Message, NotificationItem, PeerGroupMatch } from '../types'
import { useAuth } from './AuthContext'
import { getMessagePreview, isVisibleMessage } from '../utils/message'

type AppDataContextValue = {
  conversations: Conversation[]
  messages: Message[]
  requests: MatchRequest[]
  notifications: NotificationItem[]
  unreadNotifications: number
  sendMessage: (conversationId: string, content: string) => Promise<Message>
  sendAttachmentMessage: (conversationId: string, file: File) => Promise<Message>
  createBuddyRequest: (payload: { recipientId: string; matchId: string; score: number; breakdown?: import('../types').MatchBreakdown }) => Promise<void>
  updateRequest: (requestId: string, status: 'accepted' | 'declined' | 'skipped') => Promise<void>
  joinPeerGroup: (group: PeerGroupMatch) => void
  markConversationRead: (conversationId: string) => void
  clearConversationHistory: (conversationId: string) => Promise<void>
  markNotificationRead: (notificationId: string) => void
  refreshData: () => Promise<void>
  getConversationMessages: (conversationId: string) => Message[]
  getConversation: (conversationId: string) => Conversation | undefined
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('Unable to read that attachment.'))
  reader.readAsDataURL(file)
})

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { currentUser, isDemo } = useAuth()
  const remoteEnabled = Boolean(currentUser && isSupabaseConfigured && !isDemo)
  const [conversations, setConversations] = useState<Conversation[]>(() => storage.getConversations())
  const [messages, setMessages] = useState<Message[]>(() => storage.getMessages())
  const [requests, setRequests] = useState<MatchRequest[]>(() => storage.getRequests())
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => storage.getNotifications())

  const refreshFromStorage = useCallback(() => {
    if (remoteEnabled) return
    setConversations(storage.getConversations())
    setMessages(storage.getMessages())
    setRequests(storage.getRequests())
    setNotifications(storage.getNotifications())
  }, [remoteEnabled])

  useEffect(() => {
    if (remoteEnabled) {
      setConversations([])
      setMessages([])
      setRequests([])
      setNotifications([])
    } else {
      refreshFromStorage()
    }
  }, [currentUser?.id, refreshFromStorage, remoteEnabled])

  useEffect(() => {
    window.addEventListener('studymatch:data', refreshFromStorage)
    window.addEventListener('storage', refreshFromStorage)
    return () => {
      window.removeEventListener('studymatch:data', refreshFromStorage)
      window.removeEventListener('storage', refreshFromStorage)
    }
  }, [refreshFromStorage])

  const refreshRemoteData = useCallback(async () => {
    if (!remoteEnabled || !currentUser) return
    const [remote, remoteRequests, remoteNotifications] = await Promise.all([
      fetchRemoteConversations(currentUser.id),
      fetchRemoteRequests(currentUser.id),
      fetchRemoteNotifications(currentUser.id),
    ])
    setConversations(remote.conversations)
    setMessages(remote.messages)
    setRequests(remoteRequests)
    setNotifications(remoteNotifications)
  }, [currentUser, remoteEnabled])

  useEffect(() => {
    void refreshRemoteData().catch(() => undefined)
  }, [refreshRemoteData])

  const receiveMessage = useCallback((message: Message) => {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current
      const next = [...current, message]
      if (!remoteEnabled) storage.setMessages(next)
      return next
    })
    setConversations((current) => {
      const next = current.map((conversation) => conversation.id === message.conversationId ? {
        ...conversation,
        lastMessage: getMessagePreview(message),
        lastMessageAt: message.createdAt,
        unreadCount: message.senderId === currentUser?.id ? conversation.unreadCount : conversation.unreadCount + 1,
      } : conversation)
      if (!remoteEnabled) storage.setConversations(next)
      return next
    })
  }, [currentUser?.id, remoteEnabled])

  const conversationIds = useMemo(() => conversations.map((conversation) => conversation.id).sort().join(','), [conversations])

  useEffect(() => {
    if (!currentUser || !remoteEnabled) return
    const channels = conversationIds.split(',').filter(Boolean).map((conversationId) => subscribeToConversation(conversationId, receiveMessage)).filter(Boolean)
    const userChannel = subscribeToUserEvents(currentUser.id, () => {
      void refreshRemoteData().catch(() => undefined)
      // Acceptance creates the conversation immediately after the request update.
      // A second read lets the sender see it even if Realtime delivers those events out of order.
      window.setTimeout(() => void refreshRemoteData().catch(() => undefined), 800)
    })
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
      userChannel?.unsubscribe()
    }
  }, [conversationIds, currentUser, receiveMessage, refreshRemoteData, remoteEnabled])

  const addMessage = useCallback((message: Message) => {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current
      const next = [...current, message]
      if (!remoteEnabled) storage.setMessages(next)
      return next
    })
    setConversations((current) => {
      const next = current.map((conversation) => conversation.id === message.conversationId ? {
        ...conversation,
        lastMessage: getMessagePreview(message),
        lastMessageAt: message.createdAt,
      } : conversation)
      if (!remoteEnabled) storage.setConversations(next)
      return next
    })
  }, [remoteEnabled])

  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!currentUser) throw new Error('Please sign in first.')
    const now = new Date().toISOString()
    if (remoteEnabled && supabase) {
      const row = await insertMessage({ conversationId, senderId: currentUser.id, content, kind: 'text', createdAt: now, readBy: [currentUser.id] })
      const message: Message = {
        id: String(row?.id ?? crypto.randomUUID()),
        conversationId,
        senderId: currentUser.id,
        content,
        kind: 'text',
        createdAt: String(row?.created_at ?? now),
        readBy: [currentUser.id],
      }
      addMessage(message)
      return message
    }
    const message: Message = { id: crypto.randomUUID(), conversationId, senderId: currentUser.id, content, kind: 'text', createdAt: now, readBy: [currentUser.id] }
    addMessage(message)
    return message
  }, [addMessage, currentUser, remoteEnabled])

  const sendAttachmentMessage = useCallback(async (conversationId: string, file: File) => {
    if (!currentUser) throw new Error('Please sign in first.')
    if (file.size > 12 * 1024 * 1024) throw new Error('Files must be smaller than 12MB.')
    const now = new Date().toISOString()
    const kind = file.type.startsWith('image/') ? 'image' : 'file'
    let attachmentUrl: string | undefined
    let attachmentPath: string | undefined
    if (remoteEnabled) {
      const uploaded = await uploadChatAttachment(file, currentUser.id, conversationId)
      if (uploaded) {
        attachmentUrl = uploaded.url
        attachmentPath = uploaded.path
      }
    }
    if (!attachmentUrl) attachmentUrl = await fileToDataUrl(file)
    const payload = { conversationId, senderId: currentUser.id, content: '', kind: kind as Message['kind'], attachmentUrl, attachmentPath, attachmentName: file.name, createdAt: now, readBy: [currentUser.id] }
    if (remoteEnabled && supabase) {
      const row = await insertMessage(payload)
      const message: Message = { ...payload, id: String(row?.id ?? crypto.randomUUID()), createdAt: String(row?.created_at ?? now) }
      addMessage(message)
      return message
    }
    const message: Message = { ...payload, id: crypto.randomUUID() }
    addMessage(message)
    return message
  }, [addMessage, currentUser, remoteEnabled])

  const createBuddyRequest = useCallback(async ({ recipientId, matchId, score, breakdown = { complementarity: score, learningNeedRelevance: score, availability: 0, studyPreference: 0, academicRelevance: 0 } }: { recipientId: string; matchId: string; score: number; breakdown?: import('../types').MatchBreakdown }) => {
    if (!currentUser) return
    const now = new Date().toISOString()
    let persistedMatchId = matchId
    let remoteRequestId: string | undefined
    if (remoteEnabled) {
      const remoteMatch = await insertCalculatedMatch({ createdBy: currentUser.id, memberIds: [currentUser.id, recipientId], mode: 'buddy', score, breakdown })
      persistedMatchId = String(remoteMatch?.id ?? matchId)
    }
    const request: MatchRequest = { id: crypto.randomUUID(), senderId: currentUser.id, recipientId, mode: 'buddy', matchId: persistedMatchId, score, status: 'pending', createdAt: now, updatedAt: now }
    const next = [...requests.filter((item) => !(item.senderId === currentUser.id && item.recipientId === recipientId && item.status === 'pending')), request]
    setRequests(next)
    storage.setRequests(next)
    if (remoteEnabled) {
      const remoteRequest = await createRemoteRequest({ senderId: currentUser.id, recipientId, matchId: persistedMatchId, mode: 'buddy', score })
      remoteRequestId = remoteRequest?.id ? String(remoteRequest.id) : undefined
      if (remoteRequestId) {
        const withRemoteId = next.map((item) => item.id === request.id ? { ...item, remoteId: remoteRequestId } : item)
        setRequests(withRemoteId)
        storage.setRequests(withRemoteId)
      }
    }
    const recipientNotice: NotificationItem = {
      id: `request-${request.id}`,
      userId: recipientId,
      type: 'request',
      title: 'New buddy request',
      body: `${currentUser.fullName} wants to study with you.`,
      createdAt: now,
      read: false,
      actionId: request.id,
    }
    const notices = [recipientNotice, ...storage.getNotifications()]
    setNotifications(notices)
    storage.setNotifications(notices)
  }, [currentUser, remoteEnabled, requests])

  const updateRequest = useCallback(async (requestId: string, status: 'accepted' | 'declined' | 'skipped') => {
    const request = requests.find((item) => item.id === requestId)
    if (!request || !currentUser) return
    const updated = { ...request, status, updatedAt: new Date().toISOString() }
    const nextRequests = requests.map((item) => item.id === requestId ? updated : item)
    setRequests(nextRequests)
    storage.setRequests(nextRequests)
    if (remoteEnabled) await updateMatchRequest(request.remoteId ?? requestId, status)
    if (status !== 'accepted') return
    let conversationId = `conversation-${[request.senderId, request.recipientId].sort().join('-')}`
    if (remoteEnabled) {
      const remoteConversation = await createRemoteConversation({ type: 'buddy', name: 'Study buddy', memberIds: [request.senderId, request.recipientId], createdBy: currentUser.id, matchId: request.matchId })
      if (remoteConversation?.id) conversationId = String(remoteConversation.id)
    }
    if (!conversations.some((conversation) => conversation.id === conversationId)) {
      const otherId = request.senderId === currentUser.id ? request.recipientId : request.senderId
      const conversation: Conversation = { id: conversationId, type: 'buddy', name: 'New study buddy', memberIds: [request.senderId, request.recipientId], unreadCount: 0, online: true }
      const nextConversations = [...conversations, conversation]
      setConversations(nextConversations)
      storage.setConversations(nextConversations)
      const acceptance: NotificationItem = { id: `accepted-${request.id}`, userId: otherId, type: 'accepted', title: 'Buddy request accepted', body: `${currentUser.fullName} accepted your study request.`, createdAt: new Date().toISOString(), read: false }
      const nextNotifications = [acceptance, ...storage.getNotifications()]
      setNotifications(nextNotifications)
      storage.setNotifications(nextNotifications)
    }
  }, [conversations, currentUser, remoteEnabled, requests])

  const markConversationRead = useCallback((conversationId: string) => {
    setConversations((current) => {
      const next = current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation)
      if (!remoteEnabled) storage.setConversations(next)
      return next
    })
    if (currentUser) {
      setMessages((current) => {
        const next = current.map((message) => message.conversationId === conversationId && !message.readBy.includes(currentUser.id) ? { ...message, readBy: [...message.readBy, currentUser.id] } : message)
        if (!remoteEnabled) storage.setMessages(next)
        return next
      })
    }
    if (remoteEnabled) void markRemoteConversationRead(conversationId).catch(() => undefined)
  }, [currentUser, remoteEnabled])

  const clearConversationHistory = useCallback(async (conversationId: string) => {
    if (remoteEnabled) await clearRemoteConversationHistory(conversationId)
    setMessages((current) => {
      const next = current.filter((message) => message.conversationId !== conversationId)
      if (!remoteEnabled) storage.setMessages(next)
      return next
    })
    setConversations((current) => {
      const next = current.map((conversation) => conversation.id === conversationId ? { ...conversation, lastMessage: undefined, lastMessageAt: undefined, unreadCount: 0 } : conversation)
      if (!remoteEnabled) storage.setConversations(next)
      return next
    })
  }, [remoteEnabled])

  const markNotificationRead = useCallback((notificationId: string) => {
    setNotifications((current) => {
      const next = current.map((notification) => notification.id === notificationId ? { ...notification, read: true } : notification)
      if (!remoteEnabled) storage.setNotifications(next)
      return next
    })
    if (remoteEnabled && currentUser) void markRemoteNotificationRead(notificationId, currentUser.id).catch(() => undefined)
  }, [currentUser, remoteEnabled])

  const joinPeerGroup = useCallback((group: PeerGroupMatch) => {
    if (group.members.length < 3 || group.members.length > 5) return
    if (conversations.some((conversation) => conversation.id === group.id)) return
    const conversation: Conversation = {
      id: group.id,
      type: 'peer',
      name: 'The Study Loop',
      memberIds: group.members.map((member) => member.id),
      avatar: group.members.find((member) => member.id !== currentUser?.id)?.avatar,
      unreadCount: 0,
      online: true,
    }
    const next = [...conversations, conversation]
    setConversations(next)
    storage.setConversations(next)
  }, [conversations, currentUser])

  const visibleConversations = useMemo(() => conversations.filter((conversation) => messages.some((message) => message.conversationId === conversation.id && isVisibleMessage(message))), [conversations, messages])

  const value = useMemo<AppDataContextValue>(() => ({
    conversations: visibleConversations,
    messages,
    requests,
    notifications: currentUser ? notifications.filter((notification) => notification.userId === currentUser.id) : [],
    unreadNotifications: currentUser ? notifications.filter((notification) => notification.userId === currentUser.id && !notification.read).length : 0,
    sendMessage,
    sendAttachmentMessage,
    createBuddyRequest,
    updateRequest,
    joinPeerGroup,
    markConversationRead,
    clearConversationHistory,
    markNotificationRead,
    refreshData: refreshRemoteData,
    getConversationMessages: (conversationId) => messages.filter((message) => message.conversationId === conversationId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    getConversation: (conversationId) => conversations.find((conversation) => conversation.id === conversationId),
  }), [clearConversationHistory, conversations, createBuddyRequest, joinPeerGroup, markConversationRead, markNotificationRead, messages, notifications, requests, sendAttachmentMessage, sendMessage, updateRequest, currentUser, refreshRemoteData, visibleConversations])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export const useAppData = () => {
  const context = useContext(AppDataContext)
  if (!context) throw new Error('useAppData must be used inside AppDataProvider')
  return context
}
