import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppShell } from './components/AppShell'
import { useAuth } from './context/AuthContext'

const AuthPage = lazy(() => import('./pages/AuthPage').then(({ AuthPage: page }) => ({ default: page })))
const ChatPage = lazy(() => import('./pages/ChatPage').then(({ ChatPage: page }) => ({ default: page })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage: page }) => ({ default: page })))
const MatchPage = lazy(() => import('./pages/MatchPage').then(({ MatchPage: page }) => ({ default: page })))
const MessagesPage = lazy(() => import('./pages/MessagesPage').then(({ MessagesPage: page }) => ({ default: page })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(({ ProfilePage: page }) => ({ default: page })))
const SkillGPSPage = lazy(() => import('./pages/SkillGPSPage').then(({ SkillGPSPage: page }) => ({ default: page })))

function PageFallback() {
  return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-9 w-9 animate-pulse rounded-2xl bg-moss" /></div>
}

function ProtectedRoutes() {
  const { currentUser, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-cream"><div className="flex flex-col items-center gap-3"><div className="h-10 w-10 animate-pulse rounded-2xl bg-moss" /><p className="text-xs font-bold text-[#7b887f]">Preparing your study space...</p></div></div>
  if (!currentUser) return <Navigate to="/auth" replace />
  return <AppShell />
}

export function App() {
  const { currentUser } = useAuth()
  return <Suspense fallback={<PageFallback />}><Routes><Route path="/auth" element={currentUser ? <Navigate to="/dashboard" replace /> : <AuthPage />} /><Route element={<ProtectedRoutes />}><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="/skillgps" element={<SkillGPSPage />} /><Route path="/match" element={<MatchPage />} /><Route path="/messages" element={<MessagesPage />} /><Route path="/messages/:conversationId" element={<ChatPage />} /><Route path="/profile" element={<ProfilePage />} /></Route><Route path="*" element={<Navigate to={currentUser ? '/dashboard' : '/auth'} replace />} /></Routes></Suspense>
}
