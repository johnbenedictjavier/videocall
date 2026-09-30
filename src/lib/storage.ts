import { demoConversations, demoMessages, demoProfiles } from '../data/demoData'
import type { Conversation, MatchRequest, Message, NotificationItem } from '../types'

const STORAGE_KEYS = {
  currentUser: 'studymatch.current-user',
  conversations: 'studymatch.conversations',
  messages: 'studymatch.messages',
  requests: 'studymatch.requests',
  notifications: 'studymatch.notifications',
  profileOverrides: 'studymatch.profile-overrides',
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const write = <T>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('studymatch:data', { detail: key }))
}

export const storageKeys = STORAGE_KEYS

export const seedDemoStorage = () => {
  if (!localStorage.getItem(STORAGE_KEYS.conversations)) write(STORAGE_KEYS.conversations, demoConversations)
  if (!localStorage.getItem(STORAGE_KEYS.messages)) write(STORAGE_KEYS.messages, demoMessages)
  if (!localStorage.getItem(STORAGE_KEYS.requests)) write(STORAGE_KEYS.requests, [])
  if (!localStorage.getItem(STORAGE_KEYS.notifications)) write(STORAGE_KEYS.notifications, [])
}

export const storage = {
  getCurrentUser: () => localStorage.getItem(STORAGE_KEYS.currentUser),
  setCurrentUser: (id: string | null) => {
    if (id) localStorage.setItem(STORAGE_KEYS.currentUser, id)
    else localStorage.removeItem(STORAGE_KEYS.currentUser)
    window.dispatchEvent(new CustomEvent('studymatch:data', { detail: STORAGE_KEYS.currentUser }))
  },
  getConversations: () => read<Conversation[]>(STORAGE_KEYS.conversations, demoConversations),
  setConversations: (items: Conversation[]) => write(STORAGE_KEYS.conversations, items),
  getMessages: () => read<Message[]>(STORAGE_KEYS.messages, demoMessages),
  setMessages: (items: Message[]) => write(STORAGE_KEYS.messages, items),
  getRequests: () => read<MatchRequest[]>(STORAGE_KEYS.requests, []),
  setRequests: (items: MatchRequest[]) => write(STORAGE_KEYS.requests, items),
  getNotifications: () => read<NotificationItem[]>(STORAGE_KEYS.notifications, []),
  setNotifications: (items: NotificationItem[]) => write(STORAGE_KEYS.notifications, items),
  getProfileOverrides: () => read<Record<string, Partial<import('../types').UserProfile>>>(STORAGE_KEYS.profileOverrides, {}),
  setProfileOverrides: (items: Record<string, Partial<import('../types').UserProfile>>) => write(STORAGE_KEYS.profileOverrides, items),
  profiles: demoProfiles,
}
