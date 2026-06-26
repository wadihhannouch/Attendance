import { useState, useEffect } from 'react'
import { sprintsApi, projectsApi } from '../store/api'
import { Sprint, Project } from '../types'

const EMPTY_FORM = {
  title: '',
  projectId: '',
  startDate: '',
  testingDate: '',
  pilotDate: '',
  productionDate: '',
}

const fmt = (iso: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function Sprints() {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Sprint | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState('')

  useEffect(() => {
    Promise.all([sprintsApi.getAll(), projectsApi.getAll()]).then(([s, p]) => {
      setSprints(s)
      setProjects(p)
    })
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  const openEdit = (sprint: Sprint) => {
    setEditing(sprint)
    setForm({
      title: sprint.title,
      projectId: sprint.projectId,
      startDate: sprint.startDate,
      testingDate: sprint.testingDate,
      pilotDate: sprint.pilotDate,
      productionDate: sprint.productionDate,
    })
    setFormError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    try {
      if (editing) {
        await sprintsApi.update(editing.id, form)
      } else {
        await sprintsApi.create(form)
      }
      setSprints(await sprintsApi.getAll())
      setShowModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await sprintsApi.remove(deleteId)
    setSprints(await sprintsApi.getAll())
    setDeleteId(null)
  }

  const getProject = (id: string) => projects.find((p) => p.id === id)

  const visibleSprints = projectFilter
    ? sprints.filter(s => s.projectId === projectFilter)
    : sprints

  const field = (key: keyof typeof EMPTY_FORM) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Sprints</h2>
        <button onClick={openCreate} className="btn-primary">+ New Sprint</button>
      </div>

      {/* Project filter */}
      {sprints.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-400 mr-0.5">Project:</span>
          <button
            type="button"
            onClick={() => setProjectFilter('')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              projectFilter === ''
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
              onClick={() => setProjectFilter(p.id)}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                projectFilter === p.id
                  ? 'bg-gray-800 border-gray-800 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {sprints.length === 0 ? (
        <p className="text-gray-400 text-sm">No sprints yet. Create one to get started.</p>
      ) : visibleSprints.length === 0 ? (
        <p className="text-gray-400 text-sm">No sprints match the selected project.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Sprint</th>
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Start</th>
                <th className="px-4 py-3 text-left">Testing</th>
                <th className="px-4 py-3 text-left">Pilot</th>
                <th className="px-4 py-3 text-left">Production</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleSprints.map((sprint) => {
                const project = getProject(sprint.projectId)
                return (
                  <tr key={sprint.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{sprint.title}</td>
                    <td className="px-4 py-3">
                      {project ? (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-600">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                          {project.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Deleted project</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(sprint.startDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block bg-yellow-50 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded">
                        {fmt(sprint.testingDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded">
                        {fmt(sprint.pilotDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-block bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded">
                        {fmt(sprint.productionDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(sprint)} className="text-gray-500 hover:text-gray-700 mr-3">Edit</button>
                      <button onClick={() => setDeleteId(sprint.id)} className="text-red-400 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Sprint' : 'New Sprint'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Sprint Title *</label>
              <input className="input" required placeholder="e.g. Sprint 1" {...field('title')} />
            </div>

            <div>
              <label className="label">Project *</label>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                {projects.length === 0 && <p className="text-xs text-gray-400 p-1">No projects available.</p>}
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, projectId: p.id }))}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      form.projectId === p.id
                        ? 'bg-blue-50 border border-blue-200 text-blue-800'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="font-medium">{p.name}</span>
                    {p.description && <span className="text-xs text-gray-400 truncate">{p.description}</span>}
                  </button>
                ))}
              </div>
              {/* hidden input keeps form validation working */}
              <input type="text" required className="sr-only" readOnly value={form.projectId} tabIndex={-1} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start Date *</label>
                <input className="input" type="date" required {...field('startDate')} />
              </div>
              <div>
                <label className="label">Testing Date *</label>
                <input className="input" type="date" required {...field('testingDate')} />
              </div>
              <div>
                <label className="label">Pilot Date *</label>
                <input className="input" type="date" required {...field('pilotDate')} />
              </div>
              <div>
                <label className="label">Production Date *</label>
                <input className="input" type="date" required {...field('productionDate')} />
              </div>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete Sprint?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-4">This will permanently delete the sprint.</p>
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
