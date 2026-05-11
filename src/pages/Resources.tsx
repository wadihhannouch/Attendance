import { useState, useEffect } from 'react'
import { resourcesApi, projectsApi, settingsApi } from '../store/api'
import { Resource, Project } from '../types'

const EMPTY_FORM = {
  name: '',
  email: '',
  role: '',
  projectIds: [] as string[],
  annualLeaveBalance: 21,
}

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [defaultQuota, setDefaultQuota] = useState(21)

  useEffect(() => {
    resourcesApi.getAll().then(setResources)
    projectsApi.getAll().then(setProjects)
    settingsApi.get().then((s) => setDefaultQuota(s.defaultAnnualQuota))
  }, [])

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Resource | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, annualLeaveBalance: defaultQuota })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, annualLeaveBalance: defaultQuota })
    setShowModal(true)
  }

  const openEdit = (r: Resource) => {
    setEditing(r)
    setForm({ name: r.name, email: r.email, role: r.role, projectIds: [...r.projectIds], annualLeaveBalance: r.annualLeaveBalance })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) {
      await resourcesApi.update(editing.id, form)
    } else {
      await resourcesApi.create(form)
    }
    setResources(await resourcesApi.getAll())
    setShowModal(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await resourcesApi.remove(deleteId)
    setResources(await resourcesApi.getAll())
    setDeleteId(null)
  }

  const toggleProject = (pid: string) => {
    setForm((f) => ({
      ...f,
      projectIds: f.projectIds.includes(pid) ? f.projectIds.filter((x) => x !== pid) : [...f.projectIds, pid],
    }))
  }

  const getProjectNames = (ids: string[]) =>
    ids.map((id) => projects.find((p) => p.id === id)?.name ?? '').filter(Boolean).join(', ')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Team Members</h2>
        <button onClick={openCreate} className="btn-primary">+ Add Member</button>
      </div>

      {resources.length === 0 ? (
        <p className="text-gray-400 text-sm">No team members yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Projects</th>
                <th className="px-4 py-3 text-center">Annual Balance</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resources.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <div>{r.name}</div>
                    <div className="text-xs text-gray-400">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.role}</td>
                  <td className="px-4 py-3 text-gray-500">{getProjectNames(r.projectIds) || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">{r.annualLeaveBalance} days</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(r)} className="text-gray-500 hover:text-gray-700 mr-3">Edit</button>
                    <button onClick={() => setDeleteId(r.id)} className="text-red-400 hover:text-red-600">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Team Member' : 'Add Team Member'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Full Name *</label>
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">Role / Title</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="">— Select role —</option>
                  <option value="Android">Android</option>
                  <option value="iOS">iOS</option>
                  <option value="MAS">MAS</option>
                </select>
              </div>
              <div>
                <label className="label">Annual Leave Balance (days)</label>
                <input className="input" type="number" min={0} value={form.annualLeaveBalance} onChange={(e) => setForm({ ...form, annualLeaveBalance: Number(e.target.value) })} />
              </div>
            </div>
            {projects.length > 0 && (
              <div>
                <label className="label">Assigned Projects</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {projects.map((p) => (
                    <button key={p.id} type="button" onClick={() => toggleProject(p.id)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${form.projectIds.includes(p.id) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editing ? 'Save' : 'Add'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Modal title="Remove Team Member?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-4">This will remove the team member. Leave records will be retained.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} className="btn-danger">Remove</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}
