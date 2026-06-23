import { useState, useEffect } from 'react'
import { brTrackerApi, brsApi, resourcesApi, projectsApi } from '../store/api'
import { BRTrackerEntry, BusinessRequirement, Resource, Project } from '../types'

const EMPTY_FORM = {
  brId: '',
  resourceId: '',
  timelineDays: 1,
  executionOrder: 1,
}

export default function BRTracker() {
  const [entries, setEntries] = useState<BRTrackerEntry[]>([])
  const [brs, setBRs] = useState<BusinessRequirement[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BRTrackerEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      brTrackerApi.getAll(),
      brsApi.getAll(),
      resourcesApi.getAll(),
      projectsApi.getAll(),
    ]).then(([e, b, r, p]) => {
      setEntries(e)
      setBRs(b)
      setResources(r)
      setProjects(p)
    })
  }, [])

  const nextOrder = () =>
    entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.executionOrder)) + 1

  const openCreate = () => {
    setEditing(null)
    setProjectFilter('')
    setForm({ ...EMPTY_FORM, executionOrder: nextOrder() })
    setShowModal(true)
  }

  const openEdit = (entry: BRTrackerEntry) => {
    setEditing(entry)
    setProjectFilter('')
    setForm({
      brId: entry.brId,
      resourceId: entry.resourceId,
      timelineDays: entry.timelineDays,
      executionOrder: entry.executionOrder,
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.brId || !form.resourceId) return
    if (editing) {
      await brTrackerApi.update(editing.id, form)
    } else {
      await brTrackerApi.create(form)
    }
    setEntries(await brTrackerApi.getAll())
    setShowModal(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await brTrackerApi.remove(deleteId)
    setEntries(await brTrackerApi.getAll())
    setDeleteId(null)
  }

  const selectedBR = brs.find((b) => b.id === form.brId)
  const brProjectIds = selectedBR?.projectIds ?? []

  // Auto-filter by BR's projects; then optionally narrow by project pill
  const brFilteredResources = brProjectIds.length > 0
    ? resources.filter((r) => r.projectIds.some((pid) => brProjectIds.includes(pid)))
    : resources

  const filteredResources = projectFilter
    ? brFilteredResources.filter((r) => r.projectIds.includes(projectFilter))
    : brFilteredResources

  // Only show pills for projects the selected BR is assigned to
  const brProjects = projects.filter((p) => brProjectIds.includes(p.id))

  const getBR = (id: string) => brs.find((b) => b.id === id)
  const getResource = (id: string) => resources.find((r) => r.id === id)
  const getProject = (id: string) => projects.find((p) => p.id === id)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">BR Tracker</h2>
        <button onClick={openCreate} className="btn-primary">+ Add Assignment</button>
      </div>

      {entries.length === 0 ? (
        <p className="text-gray-400 text-sm">No assignments yet. Add one to get started.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-center w-16">#</th>
                <th className="px-4 py-3 text-left">Business Requirement</th>
                <th className="px-4 py-3 text-left">Developer</th>
                <th className="px-4 py-3 text-left">Projects</th>
                <th className="px-4 py-3 text-center w-28">Timeline</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => {
                const br = getBR(entry.brId)
                const resource = getResource(entry.resourceId)
                const assignedProjects = (resource?.projectIds ?? [])
                  .map(getProject)
                  .filter(Boolean) as Project[]
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 font-semibold text-xs">
                        {entry.executionOrder}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {br ? (
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: br.color }} />
                          <div>
                            <span className="font-mono text-xs text-gray-400 uppercase">{br.reference}</span>
                            <p className="font-medium text-gray-800 leading-tight">{br.title}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Deleted BR</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {resource ? (
                        <div>
                          <p className="font-medium text-gray-800">{resource.name}</p>
                          <p className="text-xs text-gray-400">{resource.role}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Deleted developer</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {assignedProjects.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.name}
                          </span>
                        ))}
                        {assignedProjects.length === 0 && <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">
                        {entry.timelineDays} {entry.timelineDays === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(entry)} className="text-gray-500 hover:text-gray-700 mr-3">Edit</button>
                      <button onClick={() => setDeleteId(entry.id)} className="text-red-400 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Assignment' : 'New Assignment'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* BR selector */}
            <div>
              <label className="label">Business Requirement *</label>
              <div className="mt-1 max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                {brs.length === 0 && <p className="text-xs text-gray-400 p-1">No BRs available.</p>}
                {brs.map((br) => (
                  <button
                    key={br.id}
                    type="button"
                    onClick={() => {
                      const newBrProjectIds = br.projectIds ?? []
                      setProjectFilter('')
                      setForm((f) => {
                        const res = resources.find((r) => r.id === f.resourceId)
                        const stillValid = res && (
                          newBrProjectIds.length === 0 ||
                          res.projectIds.some((pid) => newBrProjectIds.includes(pid))
                        )
                        return { ...f, brId: br.id, resourceId: stillValid ? f.resourceId : '' }
                      })
                    }}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      form.brId === br.id
                        ? 'bg-blue-50 border border-blue-200 text-blue-800'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: br.color }} />
                    <span className="font-mono text-xs text-gray-400 w-16 flex-shrink-0">{br.reference}</span>
                    <span className="truncate">{br.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Project filter → developer selector */}
            <div>
              <label className="label">Developer *</label>
              {brProjects.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setProjectFilter('')}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      projectFilter === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </button>
                  {brProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProjectFilter(p.id)}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        projectFilter === p.id
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {!form.brId && (
                <p className="text-xs text-gray-400 mb-2 mt-1">Select a BR above to see its assigned developers.</p>
              )}
              <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                {filteredResources.length === 0 && (
                  <p className="text-xs text-gray-400 p-1">No developers in this project.</p>
                )}
                {filteredResources.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, resourceId: r.id }))}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      form.resourceId === r.id
                        ? 'bg-blue-50 border border-blue-200 text-blue-800'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
                      {r.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline + Execution Order */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Timeline (days) *</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  required
                  value={form.timelineDays}
                  onChange={(e) => setForm((f) => ({ ...f, timelineDays: Math.max(1, Number(e.target.value)) }))}
                />
              </div>
              <div>
                <label className="label">Execution Order</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  required
                  value={form.executionOrder}
                  onChange={(e) => setForm((f) => ({ ...f, executionOrder: Math.max(1, Number(e.target.value)) }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button
                type="submit"
                disabled={!form.brId || !form.resourceId}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Remove Assignment?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-4">This will permanently remove this tracker entry.</p>
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
