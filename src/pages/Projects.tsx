import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi } from '../store/api'
import { Project } from '../types'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

const EMPTY_FORM = { name: '', description: '', color: COLORS[0] }

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { projectsApi.getAll().then(setProjects) }, [])
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (p: Project) => {
    setEditing(p)
    setForm({ name: p.name, description: p.description, color: p.color })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) {
      await projectsApi.update(editing.id, form)
    } else {
      await projectsApi.create(form)
    }
    setProjects(await projectsApi.getAll())
    setShowModal(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await projectsApi.remove(deleteId)
    setProjects(await projectsApi.getAll())
    setDeleteId(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Projects</h2>
        <button onClick={openCreate} className="btn-primary">+ New Project</button>
      </div>

      {projects.length === 0 ? (
        <p className="text-gray-400 text-sm">No projects yet. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <h3 className="font-semibold text-gray-800 truncate">{p.name}</h3>
              </div>
              {p.description && <p className="text-sm text-gray-500 line-clamp-2">{p.description}</p>}
              <div className="flex items-center gap-3 mt-auto pt-2 border-t border-gray-100">
                <Link to={`/projects/${p.id}`} className="text-sm text-blue-600 hover:underline">Members</Link>
                <button onClick={() => openEdit(p)} className="text-sm text-gray-600 hover:text-gray-800">Edit</button>
                <button onClick={() => setDeleteId(p.id)} className="text-sm text-red-500 hover:text-red-700 ml-auto">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Project' : 'New Project'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Project Name *</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Modal title="Delete Project?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-gray-600 mb-4">This will permanently delete the project. Leave records are not affected.</p>
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
