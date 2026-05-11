import { Project, Resource, Leave, Settings } from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${options?.method ?? 'GET'} ${path} failed ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
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
