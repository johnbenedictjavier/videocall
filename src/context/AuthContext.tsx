import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoProfiles } from '../data/demoData'
import { storage, seedDemoStorage } from '../lib/storage'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { fetchRemoteProfile, signInWithPassword, signOutFromSupabase, signUpWithPassword } from '../services/supabaseService'
import type { UserProfile } from '../types'

type AuthContextValue = {
  currentUser: UserProfile | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (payload: { email: string; password: string; fullName: string; username: string; course?: string; yearLevel?: string; school?: string; bio?: string; preferredStudyMode?: string }) => Promise<void>
  demoLogin: (id?: string) => void
  switchDemoUser: (id: string) => void
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const profileFromAuth = (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): UserProfile => ({
  id: user.id,
  fullName: String(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'StudyMatch student'),
  username: String(user.user_metadata?.username ?? user.email?.split('@')[0] ?? 'student'),
  email: user.email ?? '',
  course: String(user.user_metadata?.course ?? 'Student'),
  yearLevel: String(user.user_metadata?.year_level ?? 'New learner'),
  school: String(user.user_metadata?.school ?? 'Add your school'),
  bio: String(user.user_metadata?.bio ?? 'Ready to learn with a peer.'),
  avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(String(user.user_metadata?.full_name ?? user.email ?? 'Student'))}`,
  preferredStudyMode: 'Video call',
  availability: [],
  learningInterests: [],
  strengths: [],
  weaknesses: [],
  stats: { buddySessions: 0, peerSessions: 0, studentsHelped: 0, learningHours: 0 },
  online: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => storage.getCurrentUser())
  const [supabaseUser, setSupabaseUser] = useState<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null>(null)
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    seedDemoStorage()
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setSupabaseUser(data.session.user)
        setCurrentUserId(data.session.user.id)
      }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null)
      if (session?.user) {
        setCurrentUserId(session.user.id)
        storage.setCurrentUser(session.user.id)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabaseUser) {
      setRemoteProfile(null)
      return
    }
    let active = true
    void fetchRemoteProfile(supabaseUser.id).then((profile) => {
      if (active) setRemoteProfile(profile)
    })
    return () => {
      active = false
    }
  }, [supabaseUser])

  useEffect(() => {
    const sync = () => setCurrentUserId(storage.getCurrentUser())
    window.addEventListener('studymatch:data', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('studymatch:data', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const currentUser = useMemo(() => {
    const base = supabaseUser && currentUserId === supabaseUser.id ? remoteProfile ?? profileFromAuth(supabaseUser) : demoProfiles.find((profile) => profile.id === currentUserId)
    if (!base) return null
    return { ...base, ...storage.getProfileOverrides()[base.id] }
  }, [currentUserId, remoteProfile, supabaseUser])

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    loading,
    isDemo: Boolean(currentUser && demoProfiles.some((profile) => profile.id === currentUser.id)),
    signIn: async (email, password) => {
      if (!isSupabaseConfigured) {
        const match = demoProfiles.find((profile) => profile.email.toLowerCase() === email.toLowerCase())
        if (!match || password.length < 4) throw new Error('Use Demo Login or enter one of the demo emails.')
        storage.setCurrentUser(match.id)
        setCurrentUserId(match.id)
        return
      }
      const user = await signInWithPassword(email, password)
      if (user) {
        storage.setCurrentUser(user.id)
        setCurrentUserId(user.id)
        setSupabaseUser(user)
      }
    },
    signUp: async (payload) => {
      if (!isSupabaseConfigured) throw new Error('Connect Supabase to create a real account. Demo Login is ready now.')
      await signUpWithPassword(payload)
    },
    demoLogin: (id = 'user-you') => {
      storage.setCurrentUser(id)
      setCurrentUserId(id)
      setSupabaseUser(null)
      setRemoteProfile(null)
    },
    switchDemoUser: (id) => {
      if (demoProfiles.some((profile) => profile.id === id)) {
        storage.setCurrentUser(id)
        setCurrentUserId(id)
        setSupabaseUser(null)
        setRemoteProfile(null)
      }
    },
    updateProfile: async (patch) => {
      if (!currentUser) return
      const overrides = storage.getProfileOverrides()
      storage.setProfileOverrides({ ...overrides, [currentUser.id]: { ...overrides[currentUser.id], ...patch } })
      if (supabase && !demoProfiles.some((profile) => profile.id === currentUser.id)) {
        await supabase.from('profiles').update({
          full_name: patch.fullName,
          username: patch.username,
          course: patch.course,
          year_level: patch.yearLevel,
          school: patch.school,
          bio: patch.bio,
          preferred_study_mode: patch.preferredStudyMode,
        }).eq('id', currentUser.id)
      }
      setCurrentUserId(currentUser.id)
    },
    signOut: async () => {
      await signOutFromSupabase()
      storage.setCurrentUser(null)
      setCurrentUserId(null)
      setSupabaseUser(null)
      setRemoteProfile(null)
    },
  }), [currentUser, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
