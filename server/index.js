import express from 'express'
import Database from 'better-sqlite3'
import cors from 'cors'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { mkdirSync } from 'fs'

const DATA_DIR = process.env.DATA_DIR ?? './data'
const SESSION_TTL_DAYS = 14
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(`${DATA_DIR}/attendance.db`)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#3B82F6',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resources (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    email                TEXT NOT NULL DEFAULT '',
    role                 TEXT NOT NULL DEFAULT '',
    project_ids          TEXT NOT NULL DEFAULT '[]',
    annual_leave_balance INTEGER NOT NULL DEFAULT 21,
    created_at           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leaves (
    id          TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    type        TEXT NOT NULL,
    other_label TEXT,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    deputy_id   TEXT,
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id                   INTEGER PRIMARY KEY DEFAULT 1,
    leave_types          TEXT    NOT NULL DEFAULT '["Annual","Sick","Emergency","Other"]',
    default_annual_quota INTEGER NOT NULL DEFAULT 21,
    public_holidays      TEXT    NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS business_requirements (
    id          TEXT PRIMARY KEY,
    reference   TEXT NOT NULL,
    title       TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#3B82F6',
    project_ids TEXT NOT NULL DEFAULT '[]',
    sprint_id   TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS br_tracker (
    id              TEXT    PRIMARY KEY,
    br_id           TEXT    NOT NULL,
    resource_id     TEXT    NOT NULL,
    timeline_days   INTEGER NOT NULL DEFAULT 1,
    execution_order INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sprints (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    project_id      TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    testing_date    TEXT NOT NULL,
    pilot_date      TEXT NOT NULL,
    production_date TEXT NOT NULL,
    created_at      TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (id) VALUES (1);
`)

// ─── Migrations ───────────────────────────────────────────────────────────────
const leafCols = db.prepare(`SELECT name FROM pragma_table_info('leaves')`).all().map((r) => r.name)
if (!leafCols.includes('handover_items')) {
  db.exec(`ALTER TABLE leaves ADD COLUMN handover_items TEXT NOT NULL DEFAULT '[]'`)
}

const brCols = db.prepare(`SELECT name FROM pragma_table_info('business_requirements')`).all().map((r) => r.name)
if (!brCols.includes('project_ids')) {
  db.exec(`ALTER TABLE business_requirements ADD COLUMN project_ids TEXT NOT NULL DEFAULT '[]'`)
}
const brColsNew = db.prepare(`SELECT name FROM pragma_table_info('business_requirements')`).all().map((r) => r.name)
if (!brColsNew.includes('sprint_id')) {
  db.exec(`ALTER TABLE business_requirements ADD COLUMN sprint_id TEXT`)
}

// Fix rows where created_at and project_ids were swapped by an earlier positional INSERT bug.
// Corrupted rows have an ISO date in project_ids (doesn't start with '[').
db.prepare(`UPDATE business_requirements SET created_at = project_ids, project_ids = created_at WHERE project_ids NOT LIKE '[%'`).run()

const genId = () => randomBytes(8).toString('hex')
const genToken = () => randomBytes(24).toString('hex')

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => ({
  salt,
  hash: scryptSync(password, salt, 64).toString('hex'),
})

const verifyPassword = (password, passwordHash, passwordSalt) => {
  const computedHash = scryptSync(password, passwordSalt, 64)
  const storedHash = Buffer.from(passwordHash, 'hex')
  return storedHash.length === computedHash.length && timingSafeEqual(storedHash, computedHash)
}

const mapUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  createdAt: row.created_at,
})

const ensureDefaultUsers = () => {
  const now = new Date().toISOString()
  const defaultUsers = [
    { username: 'admin', displayName: 'Administrator', role: 'Admin', password: 'admin123' },
    { username: 'superuser', displayName: 'Super User', role: 'SuperUser', password: 'super123' },
    { username: 'android', displayName: 'Android Lead', role: 'Android', password: 'android123' },
    { username: 'ios', displayName: 'iOS Lead', role: 'iOS', password: 'ios12345' },
    { username: 'mas', displayName: 'MAS Lead', role: 'MAS', password: 'mas12345' },
  ]

  const insertUser = db.prepare('INSERT INTO users (id, username, display_name, role, password_hash, password_salt, created_at) VALUES (?,?,?,?,?,?,?)')
  for (const user of defaultUsers) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(user.username)
    if (exists) continue
    const { hash, salt } = hashPassword(user.password)
    insertUser.run(genId(), user.username, user.displayName, user.role, hash, salt, now)
  }
}

ensureDefaultUsers()

const getSessionUser = (token) => {
  if (!token) return null

  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token)

  if (!row) return null
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }

  return mapUser(row)
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
const mapResource = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  projectIds: JSON.parse(row.project_ids),
  annualLeaveBalance: row.annual_leave_balance,
  createdAt: row.created_at,
})

const mapLeave = (row) => ({
  id: row.id,
  resourceId: row.resource_id,
  type: row.type,
  otherLabel: row.other_label ?? undefined,
  startDate: row.start_date,
  endDate: row.end_date,
  status: row.status,
  deputyId: row.deputy_id ?? undefined,
  notes: row.notes,
  handoverItems: JSON.parse(row.handover_items ?? '[]'),
  createdAt: row.created_at,
})

const mapProject = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  createdAt: row.created_at,
})

const mapBR = (row) => {
  let projectIds = []
  try { projectIds = JSON.parse(row.project_ids ?? '[]') } catch {}
  return { id: row.id, reference: row.reference, title: row.title, color: row.color, projectIds, sprintId: row.sprint_id ?? null, createdAt: row.created_at }
}

const mapBRTracker = (row) => ({
  id: row.id,
  brId: row.br_id,
  resourceId: row.resource_id,
  timelineDays: row.timeline_days,
  executionOrder: row.execution_order,
  createdAt: row.created_at,
})

const mapSprint = (row) => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  startDate: row.start_date,
  testingDate: row.testing_date,
  pilotDate: row.pilot_date,
  productionDate: row.production_date,
  createdAt: row.created_at,
})

const hasGlobalAccess = (user) => user?.role === 'Admin' || user?.role === 'SuperUser'

const getAccessibleResources = (user) => {
  if (hasGlobalAccess(user)) {
    return db.prepare('SELECT * FROM resources ORDER BY created_at').all()
  }
  return db.prepare('SELECT * FROM resources WHERE role = ? ORDER BY created_at').all(user.role)
}

const getAccessibleResourceIds = (user) => new Set(getAccessibleResources(user).map((resource) => resource.id))

const ensureResourceAccess = (user, resourceId) => {
  if (hasGlobalAccess(user)) return true
  const row = db.prepare('SELECT id FROM resources WHERE id = ? AND role = ?').get(resourceId, user.role)
  return Boolean(row)
}

const getAccessibleProjects = () => db.prepare('SELECT * FROM projects ORDER BY created_at').all()

const getAccessibleLeaves = (user) => {
  const accessibleResourceIds = getAccessibleResourceIds(user)
  return db.prepare('SELECT * FROM leaves ORDER BY created_at DESC').all().filter((leave) => accessibleResourceIds.has(leave.resource_id))
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express()
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map((origin) => origin.trim()),
}))
app.use(express.json())

app.get('/api/health', (_, res) => res.json({ ok: true }))

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {}
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user || !verifyPassword(password ?? '', user.password_hash, user.password_salt)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = genToken()
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS)
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(token, user.id, now.toISOString(), expiresAt.toISOString())
  res.json({ token, user: mapUser(user) })
})

app.get('/api/session', (req, res) => {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const user = getSessionUser(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  res.json({ user })
})

app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.json({ ok: true })
})

app.use('/api', (req, res, next) => {
  const publicPaths = new Set(['/health', '/login', '/seed'])
  if (publicPaths.has(req.path)) return next()

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const user = getSessionUser(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
})

// ── Projects ──────────────────────────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  res.json(getAccessibleProjects().map(mapProject))
})

app.post('/api/projects', (req, res) => {
  const { name, description = '', color = '#3B82F6' } = req.body
  const id = genId()
  db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run(id, name, description, color, new Date().toISOString())
  res.status(201).json(mapProject(db.prepare('SELECT * FROM projects WHERE id=?').get(id)))
})

app.put('/api/projects/:id', (req, res) => {
  const { name, description = '', color = '#3B82F6' } = req.body
  db.prepare('UPDATE projects SET name=?, description=?, color=? WHERE id=?').run(name, description, color, req.params.id)
  const row = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapProject(row))
})

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Business Requirements ──────────────────────────────────────────────────────
app.get('/api/brs', (req, res) => {
  res.json(db.prepare('SELECT * FROM business_requirements ORDER BY created_at').all().map(mapBR))
})

app.post('/api/brs', (req, res) => {
  const { reference, title, color = '#3B82F6', projectIds = [], sprintId = null } = req.body
  const id = genId()
  db.prepare('INSERT INTO business_requirements (id, reference, title, color, project_ids, sprint_id, created_at) VALUES (?,?,?,?,?,?,?)').run(id, reference, title, color, JSON.stringify(projectIds), sprintId, new Date().toISOString())
  res.status(201).json(mapBR(db.prepare('SELECT * FROM business_requirements WHERE id=?').get(id)))
})

app.put('/api/brs/:id', (req, res) => {
  const { reference, title, color = '#3B82F6', projectIds = [], sprintId = null } = req.body
  db.prepare('UPDATE business_requirements SET reference=?, title=?, color=?, project_ids=?, sprint_id=? WHERE id=?').run(reference, title, color, JSON.stringify(projectIds), sprintId, req.params.id)
  const row = db.prepare('SELECT * FROM business_requirements WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapBR(row))
})

app.delete('/api/brs/:id', (req, res) => {
  db.prepare('DELETE FROM business_requirements WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── BR Tracker ────────────────────────────────────────────────────────────────
app.get('/api/br-tracker', (req, res) => {
  res.json(db.prepare('SELECT * FROM br_tracker ORDER BY execution_order, created_at').all().map(mapBRTracker))
})

app.post('/api/br-tracker', (req, res) => {
  const { brId, resourceId, timelineDays = 1, executionOrder = 1 } = req.body
  const id = genId()
  db.prepare('INSERT INTO br_tracker VALUES (?,?,?,?,?,?)').run(id, brId, resourceId, timelineDays, executionOrder, new Date().toISOString())
  res.status(201).json(mapBRTracker(db.prepare('SELECT * FROM br_tracker WHERE id=?').get(id)))
})

app.put('/api/br-tracker/:id', (req, res) => {
  const { brId, resourceId, timelineDays = 1, executionOrder = 1 } = req.body
  db.prepare('UPDATE br_tracker SET br_id=?, resource_id=?, timeline_days=?, execution_order=? WHERE id=?').run(brId, resourceId, timelineDays, executionOrder, req.params.id)
  const row = db.prepare('SELECT * FROM br_tracker WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapBRTracker(row))
})

app.delete('/api/br-tracker/:id', (req, res) => {
  db.prepare('DELETE FROM br_tracker WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Sprints ───────────────────────────────────────────────────────────────────
app.get('/api/sprints', (req, res) => {
  res.json(db.prepare('SELECT * FROM sprints ORDER BY start_date, created_at').all().map(mapSprint))
})

app.post('/api/sprints', (req, res) => {
  const { title, projectId, startDate, testingDate, pilotDate, productionDate } = req.body
  if (!title || !projectId || !startDate || !testingDate || !pilotDate || !productionDate) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const id = genId()
  db.prepare('INSERT INTO sprints (id, title, project_id, start_date, testing_date, pilot_date, production_date, created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, title, projectId, startDate, testingDate, pilotDate, productionDate, new Date().toISOString())
  res.status(201).json(mapSprint(db.prepare('SELECT * FROM sprints WHERE id=?').get(id)))
})

app.put('/api/sprints/:id', (req, res) => {
  const { title, projectId, startDate, testingDate, pilotDate, productionDate } = req.body
  const existing = db.prepare('SELECT * FROM sprints WHERE id=?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  db.prepare('UPDATE sprints SET title=?, project_id=?, start_date=?, testing_date=?, pilot_date=?, production_date=? WHERE id=?').run(title, projectId, startDate, testingDate, pilotDate, productionDate, req.params.id)
  res.json(mapSprint(db.prepare('SELECT * FROM sprints WHERE id=?').get(req.params.id)))
})

app.delete('/api/sprints/:id', (req, res) => {
  db.prepare('DELETE FROM sprints WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Resources ─────────────────────────────────────────────────────────────────
app.get('/api/resources/all', (req, res) => {
  res.json(db.prepare('SELECT * FROM resources ORDER BY created_at').all().map(mapResource))
})

app.get('/api/resources', (req, res) => {
  res.json(getAccessibleResources(req.user).map(mapResource))
})

app.post('/api/resources', (req, res) => {
  const { name, email = '', role = '', projectIds = [], annualLeaveBalance = 21 } = req.body
  if (!hasGlobalAccess(req.user) && role !== req.user.role) {
    return res.status(403).json({ error: `Only ${req.user.role} resources are allowed for your account` })
  }
  const id = genId()
  db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(id, name, email, role, JSON.stringify(projectIds), annualLeaveBalance, new Date().toISOString())
  res.status(201).json(mapResource(db.prepare('SELECT * FROM resources WHERE id=?').get(id)))
})

app.put('/api/resources/:id', (req, res) => {
  const { name, email = '', role = '', projectIds = [], annualLeaveBalance = 21 } = req.body
  if (!ensureResourceAccess(req.user, req.params.id)) {
    return res.status(403).json({ error: 'You are not allowed to modify this resource' })
  }
  if (!hasGlobalAccess(req.user) && role !== req.user.role) {
    return res.status(403).json({ error: `Only ${req.user.role} resources are allowed for your account` })
  }
  db.prepare('UPDATE resources SET name=?, email=?, role=?, project_ids=?, annual_leave_balance=? WHERE id=?').run(name, email, role, JSON.stringify(projectIds), annualLeaveBalance, req.params.id)
  const row = db.prepare('SELECT * FROM resources WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapResource(row))
})

app.delete('/api/resources/:id', (req, res) => {
  if (!ensureResourceAccess(req.user, req.params.id)) {
    return res.status(403).json({ error: 'You are not allowed to remove this resource' })
  }
  db.prepare('DELETE FROM resources WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Leaves ────────────────────────────────────────────────────────────────────
app.get('/api/leaves', (req, res) => {
  res.json(getAccessibleLeaves(req.user).map(mapLeave))
})

app.post('/api/leaves', (req, res) => {
  const { resourceId, type, otherLabel, startDate, endDate, status = 'pending', deputyId, notes = '', handoverItems = [] } = req.body
  if (!ensureResourceAccess(req.user, resourceId)) {
    return res.status(403).json({ error: 'You are not allowed to create a leave for this team member' })
  }
  if (deputyId && !ensureResourceAccess(req.user, deputyId)) {
    return res.status(403).json({ error: 'Deputy must belong to your scoped role' })
  }
  const id = genId()
  db.prepare('INSERT INTO leaves (id,resource_id,type,other_label,start_date,end_date,status,deputy_id,notes,handover_items,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, resourceId, type, otherLabel ?? null, startDate, endDate, status, deputyId ?? null, notes, JSON.stringify(handoverItems), new Date().toISOString())
  res.status(201).json(mapLeave(db.prepare('SELECT * FROM leaves WHERE id=?').get(id)))
})

app.put('/api/leaves/:id', (req, res) => {
  const { resourceId, type, otherLabel, startDate, endDate, status, deputyId, notes = '', handoverItems = [] } = req.body
  const existing = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (!ensureResourceAccess(req.user, existing.resource_id) || !ensureResourceAccess(req.user, resourceId)) {
    return res.status(403).json({ error: 'You are not allowed to modify this leave' })
  }
  if (deputyId && !ensureResourceAccess(req.user, deputyId)) {
    return res.status(403).json({ error: 'Deputy must belong to your scoped role' })
  }
  db.prepare('UPDATE leaves SET resource_id=?, type=?, other_label=?, start_date=?, end_date=?, status=?, deputy_id=?, notes=?, handover_items=? WHERE id=?').run(resourceId, type, otherLabel ?? null, startDate, endDate, status, deputyId ?? null, notes, JSON.stringify(handoverItems), req.params.id)
  const row = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id)
  res.json(mapLeave(row))
})

app.delete('/api/leaves/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (!ensureResourceAccess(req.user, existing.resource_id)) {
    return res.status(403).json({ error: 'You are not allowed to remove this leave' })
  }
  db.prepare('DELETE FROM leaves WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', (_, res) => {
  const row = db.prepare('SELECT * FROM settings WHERE id=1').get()
  res.json({ leaveTypes: JSON.parse(row.leave_types), defaultAnnualQuota: row.default_annual_quota, publicHolidays: JSON.parse(row.public_holidays) })
})

app.put('/api/settings', (req, res) => {
  const { leaveTypes, defaultAnnualQuota, publicHolidays } = req.body
  db.prepare('UPDATE settings SET leave_types=?, default_annual_quota=?, public_holidays=? WHERE id=1').run(JSON.stringify(leaveTypes), defaultAnnualQuota, JSON.stringify(publicHolidays))
  res.json({ ok: true })
})

// ── Seed (idempotent) ─────────────────────────────────────────────────────────
app.post('/api/seed', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM projects').get().n
  if (count > 0) return res.json({ skipped: true })

  const insert = db.transaction(() => {
    const now = new Date().toISOString()
    const fmt = (d) => d.toISOString().split('T')[0]
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
    const today = new Date()

    const p1 = genId(), p2 = genId(), p3 = genId(), p4 = genId()
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run(p1, 'Weyay', 'DVO banking group', '#3B82F6', now)
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run(p2, 'CBG', 'NBK banking group', '#10B981', now)
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run(p3, 'IBG', 'International banking group', '#F59E0B', now)
    db.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run(p4, 'Chapter', 'Chapter cosmetics', '#d47217', now)

    const r1 = genId(), r2 = genId(), r3 = genId(), r4 = genId(), r5 = genId()
    db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(r1, 'Mohammed', 'wadih@example.com', 'Project Manager', JSON.stringify([p1, p2]), 21, now)
    db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(r2, 'Mahmoud', 'sara@example.com', 'Senior Developer', JSON.stringify([p1]), 18, now)
    db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(r3, 'Khaled', 'omar@example.com', 'Business Analyst', JSON.stringify([p2, p3]), 21, now)
    db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(r4, 'Fahad', 'lina@example.com', 'QA Engineer', JSON.stringify([p1, p3]), 15, now)
    db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(r5, 'Ahmad Nasser', 'ahmad@example.com', 'Developer', JSON.stringify([p2]), 21, now)

    const l1 = genId(), l2 = genId(), l3 = genId(), l4 = genId()
    const emptyItems = '[]'
    const sampleItems = JSON.stringify([{ id: '1', text: 'Hand off API integration docs', done: true }, { id: '2', text: 'Complete sprint review tasks', done: false }])
    const insertLeave = db.prepare('INSERT INTO leaves (id,resource_id,type,other_label,start_date,end_date,status,deputy_id,notes,handover_items,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    insertLeave.run(l1, r2, 'annual', null, fmt(today), fmt(addDays(today, 2)), 'approved', r1, 'Family trip', sampleItems, now)
    insertLeave.run(l2, r3, 'sick', null, fmt(today), fmt(today), 'approved', r5, '', emptyItems, now)
    insertLeave.run(l3, r4, 'annual', null, fmt(addDays(today, 5)), fmt(addDays(today, 9)), 'pending', null, 'Vacation', sampleItems, now)
    insertLeave.run(l4, r5, 'annual', null, fmt(addDays(today, -10)), fmt(addDays(today, -7)), 'approved', r2, '', emptyItems, now)

    db.prepare('UPDATE settings SET leave_types=?, public_holidays=? WHERE id=1').run(
      JSON.stringify(['Annual', 'Sick', 'Emergency', 'Other']),
      JSON.stringify([
        { startDate: '2026-01-01', endDate: '2026-01-01', label: 'New Year\'s Day' },
        { startDate: '2026-01-16', endDate: '2026-01-16', label: 'Isra and Mi\'raj' },
        { startDate: '2026-02-25', endDate: '2026-02-25', label: 'National Day' },
        { startDate: '2026-02-26', endDate: '2026-02-26', label: 'Liberation Day' },
        { startDate: '2026-03-20', endDate: '2026-03-22', label: 'Eid al-Fitr (tentative)' },
        { startDate: '2026-05-26', endDate: '2026-05-26', label: 'Waqfat Arafat Day (tentative)' },
        { startDate: '2026-05-27', endDate: '2026-05-29', label: 'Eid al-Adha (tentative)' },
        { startDate: '2026-06-16', endDate: '2026-06-16', label: 'Islamic New Year (tentative)' },
        { startDate: '2026-08-27', endDate: '2026-08-27', label: 'The Prophet\'s Birthday (tentative)' }
      ])
    )
  })

  insert()
  res.json({ seeded: true })
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, '0.0.0.0', () => console.log(`Attendance API running on port ${PORT}`))
