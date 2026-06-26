import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard.tsx'
import Projects from './pages/Projects.tsx'
import ProjectDetail from './pages/ProjectDetail.tsx'
import Resources from './pages/Resources.tsx'
import MemberDetail from './pages/MemberDetail.tsx'
import Leaves from './pages/Leaves.tsx'
import LeaveForm from './pages/LeaveForm.tsx'
import CalendarPage from './pages/CalendarPage.tsx'
import Settings from './pages/Settings.tsx'
import BRs from './pages/BRs.tsx'
import BRTracker from './pages/BRTracker.tsx'
import Sprints from './pages/Sprints.tsx'
import SprintCalendar from './pages/SprintCalendar.tsx'
import Login from './pages/Login.tsx'
import { authApi, authStorage, AuthUser } from './store/api'

export default function App() {
  const [authReady, setAuthReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const token = authStorage.getToken()
    if (!token) {
      setAuthReady(true)
      return
    }

    authApi.session()
      .then((result) => {
        setCurrentUser(result.user)
        setIsAuthenticated(true)
      })
      .catch(() => {
        authStorage.clearToken()
        setIsAuthenticated(false)
        setCurrentUser(null)
      })
      .finally(() => setAuthReady(true))
  }, [])

  const handleLogin = async (username: string, password: string) => {
    setAuthError('')
    try {
      const result = await authApi.login(username, password)
      authStorage.setToken(result.token)
      setCurrentUser(result.user)
      setIsAuthenticated(true)
    } catch (error) {
      setIsAuthenticated(false)
      setCurrentUser(null)
      setAuthError(error instanceof Error ? error.message : 'Login failed')
    }
  }

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Best effort only.
    }
    authStorage.clearToken()
    setIsAuthenticated(false)
    setCurrentUser(null)
  }

  if (!authReady) {
    return <div className="min-h-screen bg-gray-50 grid place-items-center text-sm text-gray-500">Loading…</div>
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} error={authError} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout onLogout={handleLogout} currentUser={currentUser} />}> 
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="brs" element={<BRs />} />
          <Route path="br-tracker" element={<BRTracker />} />
          <Route path="sprints" element={<Sprints />} />
          <Route path="sprint-calendar" element={<SprintCalendar />} />
          <Route path="resources" element={<Resources />} />
          <Route path="resources/:id" element={<MemberDetail />} />
          <Route path="leaves" element={<Leaves />} />
          <Route path="leaves/new" element={<LeaveForm />} />
          <Route path="leaves/:id/edit" element={<LeaveForm />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
