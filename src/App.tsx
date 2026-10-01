import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAuth } from './context/AuthContext'
import { AuthPage } from './pages/AuthPage'
import { ChatPage } from './pages/ChatPage'
import { DashboardPage } from './pages/DashboardPage'
import { MatchPage } from './pages/MatchPage'
import { MessagesPage } from './pages/MessagesPage'
import { ProfilePage } from './pages/ProfilePage'
import { SkillGPSPage } from './pages/SkillGPSPage'

function ProtectedRoutes() {
  const { currentUser, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-cream"><div className="flex flex-col items-center gap-3"><div className="h-10 w-10 animate-pulse rounded-2xl bg-moss" /><p className="text-xs font-bold text-[#7b887f]">Preparing your study space...</p></div></div>
  if (!currentUser) return <Navigate to="/auth" replace />
  return <AppShell />
}

export function App() {
  const { currentUser } = useAuth()
  return <Routes><Route path="/auth" element={currentUser ? <Navigate to="/match" replace /> : <AuthPage />} /><Route element={<ProtectedRoutes />}><Route path="/" element={<Navigate to="/match" replace />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="/skillgps" element={<SkillGPSPage />} /><Route path="/match" element={<MatchPage />} /><Route path="/messages" element={<MessagesPage />} /><Route path="/messages/:conversationId" element={<ChatPage />} /><Route path="/profile" element={<ProfilePage />} /></Route><Route path="*" element={<Navigate to={currentUser ? '/match' : '/auth'} replace />} /></Routes>
}
