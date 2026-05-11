import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Resources from './pages/Resources'
import Leaves from './pages/Leaves'
import LeaveForm from './pages/LeaveForm'
import CalendarPage from './pages/CalendarPage'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="resources" element={<Resources />} />
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
