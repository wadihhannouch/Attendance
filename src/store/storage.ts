import { Project, Resource, Leave, Settings } from '../types';

// ─── Generic helpers ───────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

const PROJECTS_KEY = 'att_projects';

export const projectsStorage = {
  getAll: (): Project[] => load<Project[]>(PROJECTS_KEY, []),
  getById: (id: string): Project | undefined =>
    projectsStorage.getAll().find((p) => p.id === id),
  create: (data: Omit<Project, 'id' | 'createdAt'>): Project => {
    const item: Project = { ...data, id: generateId(), createdAt: new Date().toISOString() };
    save(PROJECTS_KEY, [...projectsStorage.getAll(), item]);
    return item;
  },
  update: (id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | undefined => {
    const all = projectsStorage.getAll();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], ...data };
    save(PROJECTS_KEY, all);
    return all[idx];
  },
  remove: (id: string): void => {
    save(PROJECTS_KEY, projectsStorage.getAll().filter((p) => p.id !== id));
  },
};

// ─── Resources ────────────────────────────────────────────────────────────────

const RESOURCES_KEY = 'att_resources';

export const resourcesStorage = {
  getAll: (): Resource[] => load<Resource[]>(RESOURCES_KEY, []),
  getById: (id: string): Resource | undefined =>
    resourcesStorage.getAll().find((r) => r.id === id),
  create: (data: Omit<Resource, 'id' | 'createdAt'>): Resource => {
    const item: Resource = { ...data, id: generateId(), createdAt: new Date().toISOString() };
    save(RESOURCES_KEY, [...resourcesStorage.getAll(), item]);
    return item;
  },
  update: (id: string, data: Partial<Omit<Resource, 'id' | 'createdAt'>>): Resource | undefined => {
    const all = resourcesStorage.getAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], ...data };
    save(RESOURCES_KEY, all);
    return all[idx];
  },
  remove: (id: string): void => {
    save(RESOURCES_KEY, resourcesStorage.getAll().filter((r) => r.id !== id));
  },
};

// ─── Leaves ───────────────────────────────────────────────────────────────────

const LEAVES_KEY = 'att_leaves';

export const leavesStorage = {
  getAll: (): Leave[] => load<Leave[]>(LEAVES_KEY, []),
  getById: (id: string): Leave | undefined =>
    leavesStorage.getAll().find((l) => l.id === id),
  create: (data: Omit<Leave, 'id' | 'createdAt'>): Leave => {
    const item: Leave = { ...data, id: generateId(), createdAt: new Date().toISOString() };
    save(LEAVES_KEY, [...leavesStorage.getAll(), item]);
    return item;
  },
  update: (id: string, data: Partial<Omit<Leave, 'id' | 'createdAt'>>): Leave | undefined => {
    const all = leavesStorage.getAll();
    const idx = all.findIndex((l) => l.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], ...data };
    save(LEAVES_KEY, all);
    return all[idx];
  },
  remove: (id: string): void => {
    save(LEAVES_KEY, leavesStorage.getAll().filter((l) => l.id !== id));
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'att_settings';

const DEFAULT_SETTINGS: Settings = {
  leaveTypes: ['Annual', 'Sick', 'Other'],
  defaultAnnualQuota: 21,
  publicHolidays: [],
};

export const settingsStorage = {
  get: (): Settings => load<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS),
  save: (data: Settings): void => save(SETTINGS_KEY, data),
};
