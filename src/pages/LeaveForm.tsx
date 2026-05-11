import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { leavesApi, resourcesApi, settingsApi } from '../store/api'
import { Leave, LeaveStatus, LeaveType, Resource, Settings, HandoverItem } from '../types'
import DeputyPicker from '../components/DeputyPicker'

const EMPTY_FORM = {
  resourceId: '',
  type: 'annual' as LeaveType,
  otherLabel: '',
  startDate: '',
  endDate: '',
  status: 'pending' as LeaveStatus,
  deputyId: '',
  notes: '',
  handoverItems: [] as HandoverItem[],
}

export default function LeaveForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [resources, setResources] = useState<Resource[]>([])
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [settings, setSettings] = useState<Settings>({ leaveTypes: ['Annual', 'Sick', 'Other'], defaultAnnualQuota: 21, publicHolidays: [] })
  const [form, setForm] = useState(EMPTY_FORM)
  const [newItemText, setNewItemText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    resourcesApi.getAll().then(setResources)
    settingsApi.get().then(setSettings)
    leavesApi.getAll().then(setLeaves)
  }, [])

  useEffect(() => {
    if (id) {
      leavesApi.getById(id).then((leave) => {
        if (leave) {
          setForm({
            resourceId: leave.resourceId,
            type: leave.type,
            otherLabel: leave.otherLabel ?? '',
            startDate: leave.startDate,
            endDate: leave.endDate,
            status: leave.status,
            deputyId: leave.deputyId ?? '',
            notes: leave.notes,
            handoverItems: leave.handoverItems ?? [],
          })
        }
      })
    }
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.resourceId) { setError('Please select a team member.'); return }
    if (!form.startDate || !form.endDate) { setError('Please select both start and end dates.'); return }
    if (form.startDate > form.endDate) { setError('End date must be on or after start date.'); return }
    if (form.status === 'approved' && !form.deputyId) { setError('An approved leave must have a deputy assigned.'); return }

    const data: Omit<Leave, 'id' | 'createdAt'> = {
      resourceId: form.resourceId,
      type: form.type,
      otherLabel: form.type === 'other' ? form.otherLabel : undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      deputyId: form.deputyId || undefined,
      notes: form.notes,
      handoverItems: form.handoverItems,
    }

    if (isEditing && id) {
      await leavesApi.update(id, data)
    } else {
      await leavesApi.create(data)
    }

    navigate('/leaves')
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/leaves')} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <h2 className="text-2xl font-bold text-gray-800">{isEditing ? 'Edit Leave' : 'New Leave Request'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="label">Team Member *</label>
          <select className="input" required value={form.resourceId} onChange={(e) => { setForm({ ...form, resourceId: e.target.value }); setError('') }}>
            <option value="">Select a team member…</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.role}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date *</label>
            <input type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date *</label>
            <input type="date" className="input" required value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label">Leave Type *</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
            {settings.leaveTypes.map((t) => (
              <option key={t} value={t.toLowerCase() === 'annual' ? 'annual' : t.toLowerCase() === 'sick' ? 'sick' : 'other'}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {form.type === 'other' && (
          <div>
            <label className="label">Specify Leave Type</label>
            <input className="input" placeholder="e.g. Emergency, Study leave…" value={form.otherLabel} onChange={(e) => setForm({ ...form, otherLabel: e.target.value })} />
          </div>
        )}

        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={(e) => { setForm({ ...form, status: e.target.value as LeaveStatus }); setError('') }}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {form.status === 'approved' && (
          <div>
            <label className="label">Deputy {form.status === 'approved' ? '*' : ''}</label>
            <DeputyPicker
              resources={resources}
              leaves={leaves}
              startDate={form.startDate}
              endDate={form.endDate}
              excludeResourceId={form.resourceId}
              value={form.deputyId}
              onChange={(id) => setForm({ ...form, deputyId: id })}
            />
            <p className="text-xs text-gray-400 mt-1">Members already on leave during these dates are shown as unavailable.</p>
          </div>
        )}

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        {/* Handover Checklist */}
        <div>
          <label className="label">Handover Checklist</label>
          <p className="text-xs text-gray-400 mb-2">List tasks / features that must be completed before the leave starts.</p>

          {form.handoverItems.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {form.handoverItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      setForm({
                        ...form,
                        handoverItems: form.handoverItems.map((i) =>
                          i.id === item.id ? { ...i, done: !i.done } : i
                        ),
                      })
                    }
                    className="accent-blue-600 w-4 h-4 flex-shrink-0"
                  />
                  <span className={`flex-1 text-sm ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        handoverItems: form.handoverItems.filter((i) => i.id !== item.id),
                      })
                    }
                    className="text-gray-300 hover:text-red-500 text-base leading-none"
                    aria-label="Remove item"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="e.g. Finish login page, Write unit tests…"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const text = newItemText.trim()
                  if (!text) return
                  setForm({
                    ...form,
                    handoverItems: [...form.handoverItems, { id: crypto.randomUUID(), text, done: false }],
                  })
                  setNewItemText('')
                }
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const text = newItemText.trim()
                if (!text) return
                setForm({
                  ...form,
                  handoverItems: [...form.handoverItems, { id: crypto.randomUUID(), text, done: false }],
                })
                setNewItemText('')
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => navigate('/leaves')} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary">{isEditing ? 'Save Changes' : 'Create Leave'}</button>
        </div>
      </form>
    </div>
  )
}
