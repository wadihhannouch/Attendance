import { FormEvent, useState } from 'react'

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<void>
  error: string
}

export default function Login({ onLogin, error }: LoginProps) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onLogin(username, password)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 grid place-items-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Attendance &amp; Leave Manager</p>
        </div>

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <p className="font-semibold text-gray-700">Available users</p>
          <p className="mt-1">Admin: <span className="font-medium">admin / admin123</span></p>
          <p>Super User: <span className="font-medium">superuser / super123</span></p>
          <p>Android: <span className="font-medium">android / android123</span></p>
          <p>iOS: <span className="font-medium">ios / ios12345</span></p>
          <p>MAS: <span className="font-medium">mas / mas12345</span></p>
        </div>

        <div>
          <label className="label">Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>

        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}