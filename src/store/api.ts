import { Project, Resource, Leave, Settings } from '../types'

const BASE = '/api'
export const AUTH_TOKEN_KEY = 'attendance_auth_token'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: string
  createdAt: string
}

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'AuthError'
  }
}

export const authStorage = {
  getToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(AUTH_TOKEN_KEY),
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = authStorage.getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  })
  if (res.status === 401) {
    throw new AuthError()
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${options?.method ?? 'GET'} ${path} failed ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  session: () => request<{ user: AuthUser }>('/session'),
  logout: () => request<{ ok: boolean }>('/logout', { method: 'POST' }),
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  getAll: () => request<Project[]>('/projects'),
  create: (data: Omit<Project, 'id' | 'createdAt'>) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
}

// ─── Resources ────────────────────────────────────────────────────────────────
export const resourcesApi = {
  getAll: () => request<Resource[]>('/resources'),
  getById: async (id: string) => {
    const all = await request<Resource[]>('/resources')
    return all.find((r) => r.id === id)
  },
  create: (data: Omit<Resource, 'id' | 'createdAt'>) =>
    request<Resource>('/resources', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<Resource, 'id' | 'createdAt'>>) =>
    request<Resource>(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/resources/${id}`, { method: 'DELETE' }),
}

// ─── Leaves ───────────────────────────────────────────────────────────────────
export const leavesApi = {
  getAll: () => request<Leave[]>('/leaves'),
  getById: async (id: string) => {
    const all = await request<Leave[]>('/leaves')
    return all.find((l) => l.id === id)
  },
  create: (data: Omit<Leave, 'id' | 'createdAt'>) =>
    request<Leave>('/leaves', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Omit<Leave, 'id' | 'createdAt'>>) =>
    request<Leave>(`/leaves/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean }>(`/leaves/${id}`, { method: 'DELETE' }),
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => request<Settings>('/settings'),
  save: (data: Settings) =>
    request<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
export const seedApi = {
  seed: () => request<{ seeded?: boolean; skipped?: boolean }>('/seed', { method: 'POST' }),
}
