import { useState, useEffect } from 'react'
import { brsApi, projectsApi, sprintsApi } from '../store/api'
import { BusinessRequirement, Project, Sprint } from '../types'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

const EMPTY_FORM = {
  reference: '',
  title: '',
  color: COLORS[0],
  projectIds: [] as string[],
  sprintId: null as string | null,
}

export default function BRs() {
  const [brs, setBRs] = useState<BusinessRequirement[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BusinessRequirement | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Table-level filters
  const [tableProjectFilter, setTableProjectFilter] = useState('')
  const [tableSprintFilter, setTableSprintFilter] = useState('')

  useEffect(() => {
    Promise.all([brsApi.getAll(), projectsApi.getAll(), sprintsApi.getAll()]).then(([b, p, s]) => {
      setBRs(b); setProjects(p); setSprints(s)
    })
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (br: BusinessRequirement) => {
    setEditing(br)
    setForm({
      reference: br.reference,
      title: br.title,
      color: br.color,
      projectIds: [...br.projectIds],
      sprintId: br.sprintId,
    })
    setFormError('')
    setShowModal(true)
  }

  const toggleProject = (pid: string) => {
    setForm((f) => {
      const newIds = f.projectIds.includes(pid)
        ? f.projectIds.filter((x) => x !== pid)
        : [...f.projectIds, pid]
      // Clear sprint if it no longer belongs to any of the new project set
      const sprintStillValid =
        f.sprintId && sprints.some(s => s.id === f.sprintId && newIds.includes(s.projectId))
      return { ...f, projectIds: newIds, sprintId: sprintStillValid ? f.sprintId : null }
    })
  }

  // Sprints available for the currently selected projects
  const availableSprints = sprints.filter(s => form.projectIds.includes(s.projectId))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    try {
      if (editing) {
        await brsApi.update(editing.id, form)
      } else {
        await brsApi.create(form)
      }
      setBRs(await brsApi.getAll())
      setShowModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await brsApi.remove(deleteId)
    setBRs(await brsApi.getAll())
    setDeleteId(null)
  }

  const getProjects = (ids: string[]) => ids.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as Project[]
  const getSprint = (id: string | null) => id ? sprints.find(s => s.id === id) : undefined

  const sprintOptions = tableProjectFilter
    ? sprints.filter(s => s.projectId === tableProjectFilter)
    : sprints

  const visibleBRs = brs.filter(br => {
    if (tableProjectFilter && !br.projectIds.includes(tableProjectFilter)) return false
    if (tableSprintFilter && br.sprintId !== tableSprintFilter) return false
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Business Requirements</h2>
        <button onClick={openCreate} className="btn-primary">+ New BR</button>
      </div>

      {/* Filters */}
      {brs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-gray-400 mr-0.5">Project:</span>
            <button
              type="button"
              onClick={() => { setTableProjectFilter(''); setTableSprintFilter('') }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                tableProjectFilter === ''
                  ? 'bg-gray-800 border-gray-800 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setTableProjectFilter(p.id); setTableSprintFilter('') }}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tableProjectFilter === p.id
                    ? 'bg-gray-800 border-gray-800 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
          </div>

          {sprintOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-gray-400 mr-0.5">Sprint:</span>
              <button
                type="button"
                onClick={() => setTableSprintFilter('')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tableSprintFilter === ''
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                All
              </button>
              {sprintOptions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTableSprintFilter(s.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    tableSprintFilter === s.id
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🏃 {s.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {brs.length === 0 ? (
        <p className="text-gray-400 text-sm">No business requirements yet. Create one to get started.</p>
      ) : visibleBRs.length === 0 ? (
        <p className="text-gray-400 text-sm">No BRs match the selected filters.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleBRs.map((br) => {
            const assignedProjects = getProjects(br.projectIds)
            const sprint = getSprint(br.sprintId)
            return (
              <div key={br.id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: br.color }} />
                  <span className="text-xs font-mono font-semibold text-gray-500 uppercase tracking-wide">{br.reference}</span>
                </div>
                <h3 className="font-semibold text-gray-800 leading-snug">{br.title}</h3>
                {assignedProjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedProjects.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
                {sprint && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 self-start">
                    🏃 {sprint.title}
                  </span>
                )}
                <div className="flex items-center gap-3 mt-auto pt-2 border-t border-gray-100">
                  <button onClick={() => openEdit(br)} className="text-sm text-gray-600 hover:text-gray-800">Edit</button>
                  <button onClick={() => setDeleteId(br.id)} className="text-sm text-red-500 hover:text-red-700 ml-auto">Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit BR' : 'New BR'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">BR Reference *</label>
              <input
                className="input"
                required
                placeholder="e.g. BR-001"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </div>
            <div>
              <label className="label">BR Title *</label>
              <input
                className="input"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {projects.length > 0 && (
              <div>
                <label className="label">Assigned Projects</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProject(p.id)}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${
                        form.projectIds.includes(p.id)
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sprint selector — only appears when at least one project is selected */}
            {availableSprints.length > 0 && (
              <div>
                <label className="label">Sprint <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                <div className="mt-1 max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, sprintId: null }))}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                      !form.sprintId ? 'bg-blue-50 border border-blue-200 text-blue-800' : 'hover:bg-gray-50 text-gray-400'
                    }`}
                  >
                    <span className="italic text-xs">No sprint assigned</span>
                  </button>
                  {availableSprints.map((s) => {
                    const proj = projects.find(p => p.id === s.projectId)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, sprintId: s.id }))}
                        className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          form.sprintId === s.id
                            ? 'bg-blue-50 border border-blue-200 text-blue-800'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        {proj && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />}
                        <span className="font-medium">{s.title}</span>
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{s.startDate} → {s.pilotDate}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete BR?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-4">This will permanently delete the business requirement.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} className="btn-danger">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}
