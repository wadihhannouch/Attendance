import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AuthUser } from '../store/api'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/brs', label: 'BRs', icon: '📋' },
  { to: '/br-tracker', label: 'BR Tracker', icon: '🎯' },
  { to: '/sprints', label: 'Sprints', icon: '🏃' },
  { to: '/sprint-calendar', label: 'Sprint Calendar', icon: '📆' },
  { to: '/resources', label: 'Team Members', icon: '👥' },
  { to: '/leaves', label: 'Leaves', icon: '📅' },
  { to: '/calendar', label: 'Calendar', icon: '🗓️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

interface LayoutProps {
  onLogout: () => void
  currentUser: AuthUser | null
}

export default function Layout({ onLogout, currentUser }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${collapsed ? 'w-20' : 'w-56'}`}>
        <div className={`border-b border-gray-200 ${collapsed ? 'px-3 py-4' : 'px-5 py-4'}`}>
          <div className={`flex items-start ${collapsed ? 'justify-center' : 'justify-between gap-3'}`}>
            {collapsed ? (
              <span className="text-2xl" aria-hidden="true">🗂️</span>
            ) : (
              <h1 className="text-base font-bold text-gray-800 leading-tight">Attendance &amp;<br />Leave Manager</h1>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
              title={collapsed ? 'Expand menu' : 'Collapse menu'}
            >
              <span className="text-sm">{collapsed ? '→' : '←'}</span>
            </button>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2'} ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base" aria-hidden="true">{icon}</span>
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-2">
          {currentUser && !collapsed && (
            <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
              <p className="font-semibold text-gray-800">{currentUser.displayName}</p>
              <p className="text-gray-500">@{currentUser.username}</p>
              <p className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{currentUser.role}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`flex w-full items-center rounded-lg text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2'}`}
          >
            <span className="text-base" aria-hidden="true">🔒</span>
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
          <Outlet context={{ currentUser }} />
      </main>
    </div>
  )
}
