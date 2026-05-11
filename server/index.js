import express from 'express'
import Database from 'better-sqlite3'
import cors from 'cors'
import { randomBytes } from 'crypto'
import { mkdirSync } from 'fs'

const DATA_DIR = process.env.DATA_DIR ?? './data'
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

  INSERT OR IGNORE INTO settings (id) VALUES (1);
`)

// ─── Migrations ───────────────────────────────────────────────────────────────
const leafCols = db.prepare(`SELECT name FROM pragma_table_info('leaves')`).all().map((r) => r.name)
if (!leafCols.includes('handover_items')) {
  db.exec(`ALTER TABLE leaves ADD COLUMN handover_items TEXT NOT NULL DEFAULT '[]'`)
}

const genId = () => randomBytes(8).toString('hex')

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

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_, res) => res.json({ ok: true }))

// ── Projects ──────────────────────────────────────────────────────────────────
app.get('/api/projects', (_, res) => {
  res.json(db.prepare('SELECT * FROM projects ORDER BY created_at').all().map(mapProject))
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

// ── Resources ─────────────────────────────────────────────────────────────────
app.get('/api/resources', (_, res) => {
  res.json(db.prepare('SELECT * FROM resources ORDER BY created_at').all().map(mapResource))
})

app.post('/api/resources', (req, res) => {
  const { name, email = '', role = '', projectIds = [], annualLeaveBalance = 21 } = req.body
  const id = genId()
  db.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)').run(id, name, email, role, JSON.stringify(projectIds), annualLeaveBalance, new Date().toISOString())
  res.status(201).json(mapResource(db.prepare('SELECT * FROM resources WHERE id=?').get(id)))
})

app.put('/api/resources/:id', (req, res) => {
  const { name, email = '', role = '', projectIds = [], annualLeaveBalance = 21 } = req.body
  db.prepare('UPDATE resources SET name=?, email=?, role=?, project_ids=?, annual_leave_balance=? WHERE id=?').run(name, email, role, JSON.stringify(projectIds), annualLeaveBalance, req.params.id)
  const row = db.prepare('SELECT * FROM resources WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapResource(row))
})

app.delete('/api/resources/:id', (req, res) => {
  db.prepare('DELETE FROM resources WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── Leaves ────────────────────────────────────────────────────────────────────
app.get('/api/leaves', (_, res) => {
  res.json(db.prepare('SELECT * FROM leaves ORDER BY created_at DESC').all().map(mapLeave))
})

app.post('/api/leaves', (req, res) => {
  const { resourceId, type, otherLabel, startDate, endDate, status = 'pending', deputyId, notes = '', handoverItems = [] } = req.body
  const id = genId()
  db.prepare('INSERT INTO leaves (id,resource_id,type,other_label,start_date,end_date,status,deputy_id,notes,handover_items,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, resourceId, type, otherLabel ?? null, startDate, endDate, status, deputyId ?? null, notes, JSON.stringify(handoverItems), new Date().toISOString())
  res.status(201).json(mapLeave(db.prepare('SELECT * FROM leaves WHERE id=?').get(id)))
})

app.put('/api/leaves/:id', (req, res) => {
  const { resourceId, type, otherLabel, startDate, endDate, status, deputyId, notes = '', handoverItems = [] } = req.body
  db.prepare('UPDATE leaves SET resource_id=?, type=?, other_label=?, start_date=?, end_date=?, status=?, deputy_id=?, notes=?, handover_items=? WHERE id=?').run(resourceId, type, otherLabel ?? null, startDate, endDate, status, deputyId ?? null, notes, JSON.stringify(handoverItems), req.params.id)
  const row = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(mapLeave(row))
})

app.delete('/api/leaves/:id', (req, res) => {
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
        { date: '2026-01-01', label: 'New Year\'s Day' },
        { date: '2026-02-25', label: 'National Day' },
        { date: '2026-02-26', label: 'Liberation Day' },
        { date: '2026-04-02', label: 'Eid al-Fitr (estimated)' },
        { date: '2026-04-03', label: 'Eid al-Fitr Holiday (estimated)' },
        { date: '2026-06-15', label: 'Arafat Day' },
        { date: '2026-06-16', label: 'Eid al-Adha (estimated)' },
        { date: '2026-06-17', label: 'Eid al-Adha Holiday (estimated)' }
      ])
    )
  })

  insert()
  res.json({ seeded: true })
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, '0.0.0.0', () => console.log(`Attendance API running on port ${PORT}`))
