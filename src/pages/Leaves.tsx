import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { leavesApi, resourcesApi, projectsApi } from '../store/api'
import { Leave, LeaveStatus, Resource, Project, HandoverItem } from '../types'
import { differenceInBusinessDays, parseISO, addDays, format } from 'date-fns'

type FilterStatus = 'all' | LeaveStatus

export default function Leaves() {
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    leavesApi.getAll().then(setLeaves)
    resourcesApi.getAll().then(setResources)
    projectsApi.getAll().then(setProjects)
  }, [])

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterResource, setFilterResource] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const getResource = (id: string) => resources.find((r) => r.id === id)
  const getProjectNames = (resourceId: string) => {
    const resource = getResource(resourceId)
    if (!resource) return '—'
    const names = resource.projectIds
      .map((projectId) => projects.find((project) => project.id === projectId)?.name)
      .filter(Boolean)
    return names.length > 0 ? names.join(' | ') : '—'
  }

  const filtered = leaves.filter((l) => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false
    if (filterResource && l.resourceId !== filterResource) return false
    if (filterProject) {
      const res = getResource(l.resourceId)
      if (!res?.projectIds.includes(filterProject)) return false
    }
    return true
  })

  const handleDelete = async () => {
    if (!deleteId) return
    await leavesApi.remove(deleteId)
    setLeaves(await leavesApi.getAll())
    setDeleteId(null)
  }

  const csvEscape = (value: string | number) => {
    const text = String(value)
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }

  const downloadCsv = (filename: string, rows: Array<Record<string, string | number>>) => {
    if (rows.length === 0) return
    const headers = Object.keys(rows[0])
    const body = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
    const csv = [headers.join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const buildExportRows = (data: Leave[]) =>
    data
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((leave) => {
        const member = getResource(leave.resourceId)
        const deputy = leave.deputyId ? getResource(leave.deputyId) : undefined
        const handoverItems = leave.handoverItems ?? []
        const done = handoverItems.filter((item) => item.done).length
        return {
          leaveId: leave.id,
          memberName: member?.name ?? '—',
          memberRole: member?.role ?? '—',
          projects: getProjectNames(leave.resourceId),
          leaveType: leave.type === 'other' && leave.otherLabel ? leave.otherLabel : leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          businessDays: businessDays(leave.startDate, leave.endDate),
          status: leave.status,
          deputy: deputy?.name ?? '—',
          handoverDone: `${done}/${handoverItems.length}`,
          notes: leave.notes ?? '',
          createdAt: leave.createdAt,
        }
      })

  const exportAllLeaves = () => {
    const rows = buildExportRows(leaves)
    downloadCsv(`leaves-all-${Date.now()}.csv`, rows)
  }

  const statusBadge = (s: LeaveStatus) => {
    const cls = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    }[s]
    return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{s}</span>
  }

  const handoverPill = (items: HandoverItem[]) => {
    if (items.length === 0) return <span className="text-xs text-gray-300">—</span>
    const done = items.filter((i) => i.done).length
    const all = done === items.length
    const cls = all ? 'bg-green-100 text-green-700' : done > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-600'
    return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{done} / {items.length}</span>
  }

  const businessDays = (start: string, end: string) => {
    try {
      return differenceInBusinessDays(addDays(parseISO(end), 1), parseISO(start))
    } catch {
      return '—'
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Leave Requests</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportAllLeaves} className="btn-secondary">Export All CSV</button>
          <Link to="/leaves/new" className="btn-primary">+ New Leave</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className="input w-auto" value={filterResource} onChange={(e) => setFilterResource(e.target.value)}>
          <option value="">All Members</option>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="input w-auto" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No leaves match the selected filters.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-center">Days</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Deputy</th>
                <th className="px-4 py-3 text-left">Handover</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((l) => {
                  const res = getResource(l.resourceId)
                  const deputy = l.deputyId ? getResource(l.deputyId) : undefined
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{res?.name ?? '—'}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{l.type === 'other' && l.otherLabel ? l.otherLabel : l.type}</td>
                      <td className="px-4 py-3 text-gray-600">{format(parseISO(l.startDate), 'dd MMM yyyy')}</td>
                      <td className="px-4 py-3 text-gray-600">{format(parseISO(l.endDate), 'dd MMM yyyy')}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{businessDays(l.startDate, l.endDate)}</td>
                      <td className="px-4 py-3">{statusBadge(l.status)}</td>
                      <td className="px-4 py-3 text-gray-500">{deputy?.name ?? '—'}</td>
                      <td className="px-4 py-3">{handoverPill(l.handoverItems ?? [])}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/leaves/${l.id}/edit`} className="text-gray-500 hover:text-gray-700 mr-3">Edit</Link>
                        <button onClick={() => setDeleteId(l.id)} className="text-red-400 hover:text-red-600">Delete</button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Delete Leave Record?</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
                <button onClick={handleDelete} className="btn-danger">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
