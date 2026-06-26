import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { projectsApi, resourcesApi } from '../store/api'
import { Project, Resource } from '../types'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | undefined>(undefined)
  const [resources, setResources] = useState<Resource[]>([])

  useEffect(() => {
    if (id) projectsApi.getAll().then((ps) => setProject(ps.find((p) => p.id === id)))
    resourcesApi.getAll().then(setResources)
  }, [id])

  if (!project) {
    return (
      <div className="space-y-3">
        <p className="text-gray-500">Project not found or loading…</p>
        <Link to="/projects" className="text-blue-600 hover:underline text-sm">← Back to Projects</Link>
      </div>
    )
  }

  const members = resources.filter((r) => r.projectIds.includes(project.id))
  const nonMembers = resources.filter((r) => !r.projectIds.includes(project.id))

  const addMember = async (resourceId: string) => {
    const r = await resourcesApi.getById(resourceId)
    if (!r) return
    await resourcesApi.update(resourceId, { ...r, projectIds: [...r.projectIds, project.id] })
    setResources(await resourcesApi.getAll())
  }

  const removeMember = async (resourceId: string) => {
    const r = await resourcesApi.getById(resourceId)
    if (!r) return
    await resourcesApi.update(resourceId, { ...r, projectIds: r.projectIds.filter((pid) => pid !== project.id) })
    setResources(await resourcesApi.getAll())
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/projects')} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
        <h2 className="text-2xl font-bold text-gray-800">{project.name}</h2>
      </div>
      {project.description && <p className="text-gray-500 text-sm">{project.description}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Members */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Allocated Members ({members.length})</h3>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">No members allocated yet.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <Link to={`/resources/${r.id}`} className="font-medium text-gray-800 hover:text-blue-600 hover:underline">{r.name}</Link>
                    <span className="ml-2 text-gray-500">{r.role}</span>
                  </div>
                  <button onClick={() => removeMember(r.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Available to add */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Member</h3>
          {nonMembers.length === 0 ? (
            <p className="text-sm text-gray-400">All team members are already allocated.</p>
          ) : (
            <ul className="space-y-2">
              {nonMembers.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <Link to={`/resources/${r.id}`} className="font-medium text-gray-800 hover:text-blue-600 hover:underline">{r.name}</Link>
                    <span className="ml-2 text-gray-500">{r.role}</span>
                  </div>
                  <button onClick={() => addMember(r.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link to="/resources" className="text-xs text-gray-500 hover:text-gray-700">Manage all team members →</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
