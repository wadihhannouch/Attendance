import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { leavesApi, resourcesApi, projectsApi, settingsApi, sprintsApi, brsApi, brTrackerApi } from '../store/api'
import { Leave, Resource, Project, Settings, PublicHoliday, Sprint, BusinessRequirement, BRTrackerEntry } from '../types'
import { isWithinInterval, parseISO, addDays, format, differenceInCalendarDays, differenceInBusinessDays } from 'date-fns'

// Gulf work week: Friday (5) and Saturday (6) are weekends
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getSprintWorkingDays(startIso: string, endIso: string): Date[] {
  const days: Date[] = []
  const cur = parseLocal(startIso)
  const end = parseLocal(endIso)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 5 && dow !== 6) days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

interface IdleSlot {
  resourceId: string
  resourceName: string
  resourceRole: string
  projectId: string
  projectName: string
  projectColor: string
  sprintId: string
  sprintTitle: string
  idleDays: number
  totalWorkingDays: number
  vacationDays: number
  allocatedDays: number
}

export default function Dashboard() {
  const today = useMemo(() => new Date(), [])
  const todayStr = format(today, 'yyyy-MM-dd')
  const in30days = format(addDays(today, 30), 'yyyy-MM-dd')

  const [leaves, setLeaves] = useState<Leave[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [settings, setSettings] = useState<Settings>({ leaveTypes: [], defaultAnnualQuota: 21, publicHolidays: [] })
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [brs, setBRs] = useState<BusinessRequirement[]>([])
  const [trackerEntries, setTrackerEntries] = useState<BRTrackerEntry[]>([])
  const [idleProjectFilter, setIdleProjectFilter] = useState('all')
  const [idleExpanded, setIdleExpanded] = useState(true)

  useEffect(() => {
    leavesApi.getAll().then(setLeaves)
    resourcesApi.getAll().then(setResources)
    projectsApi.getAll().then(setProjects)
    settingsApi.get().then(setSettings)
    sprintsApi.getAll().then(setSprints).catch(() => {})
    brsApi.getAll().then(setBRs).catch(() => {})
    brTrackerApi.getAll().then(setTrackerEntries).catch(() => {})
  }, [])

  const getResource = (id: string) => resources.find((r) => r.id === id)
  const normalizeHoliday = (holiday: PublicHoliday): PublicHoliday => ({
    label: holiday.label,
    startDate: holiday.startDate ?? holiday.date ?? '',
    endDate: holiday.endDate ?? holiday.startDate ?? holiday.date ?? '',
  })

  const handleToggleTask = (leaveId: string, itemId: string) => {
    const leave = leaves.find((l) => l.id === leaveId)
    if (!leave) return
    const updatedItems = leave.handoverItems.map((i) => i.id === itemId ? { ...i, done: !i.done } : i)
    const updated = { ...leave, handoverItems: updatedItems }
    setLeaves((prev) => prev.map((l) => l.id === leaveId ? updated : l))
    leavesApi.update(leaveId, {
      resourceId: leave.resourceId,
      type: leave.type,
      otherLabel: leave.otherLabel,
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      deputyId: leave.deputyId,
      notes: leave.notes,
      handoverItems: updatedItems,
    })
  }

  const isOutToday = (l: Leave) =>
    l.status === 'approved' &&
    isWithinInterval(today, { start: parseISO(l.startDate), end: parseISO(l.endDate) })

  const isUpcoming = (l: Leave) =>
    l.status !== 'rejected' && l.startDate > todayStr && l.startDate <= in30days

  const totalOut = leaves.filter(isOutToday).length
  const totalPending = leaves.filter((l) => l.status === 'pending').length
  const nextHoliday = settings.publicHolidays
    .map(normalizeHoliday)
    .filter((holiday) => holiday.startDate && holiday.endDate && holiday.endDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const holidayCountdown = nextHoliday ? Math.max(0, differenceInCalendarDays(parseISO(nextHoliday.startDate), today)) : null

  const idleSlots = useMemo<IdleSlot[]>(() => {
    if (!sprints.length || !resources.length) return []
    const slots: IdleSlot[] = []
    for (const sprint of sprints) {
      const project = projects.find(p => p.id === sprint.projectId)
      if (!project) continue
      const sprintBRIds = new Set(brs.filter(b => b.sprintId === sprint.id).map(b => b.id))
      if (!sprintBRIds.size) continue
      const workingDays = getSprintWorkingDays(sprint.startDate, sprint.pilotDate)
      if (!workingDays.length) continue
      const workingDayStrs = new Set(workingDays.map(toIso))
      const sprintResources = resources.filter(r => r.projectIds.includes(sprint.projectId))
      for (const resource of sprintResources) {
        let vacationCount = 0
        for (const leave of leaves) {
          if (leave.resourceId !== resource.id || leave.status !== 'approved') continue
          const cur = parseLocal(leave.startDate)
          const end = parseLocal(leave.endDate)
          while (cur <= end) {
            if (workingDayStrs.has(toIso(cur))) vacationCount++
            cur.setDate(cur.getDate() + 1)
          }
        }
        const availableDays = workingDays.length - vacationCount
        const rawAllocated = trackerEntries
          .filter(e => e.resourceId === resource.id && sprintBRIds.has(e.brId))
          .reduce((sum, e) => sum + e.timelineDays, 0)
        const allocatedDays = Math.min(rawAllocated, availableDays)
        const idleDays = Math.max(0, availableDays - allocatedDays)
        if (idleDays > 0) {
          slots.push({
            resourceId: resource.id,
            resourceName: resource.name,
            resourceRole: resource.role,
            projectId: project.id,
            projectName: project.name,
            projectColor: project.color,
            sprintId: sprint.id,
            sprintTitle: sprint.title,
            idleDays,
            totalWorkingDays: workingDays.length,
            vacationDays: vacationCount,
            allocatedDays,
          })
        }
      }
    }
    return slots.sort((a, b) => b.idleDays - a.idleDays)
  }, [sprints, brs, trackerEntries, resources, projects, leaves])

  const filteredIdleSlots = idleProjectFilter === 'all'
    ? idleSlots
    : idleSlots.filter(s => s.projectId === idleProjectFilter)

  const idleFilterProjects = projects.filter(p => idleSlots.some(s => s.projectId === p.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <span className="text-sm text-gray-400">{format(today, 'EEEE, d MMMM yyyy')}</span>
      </div>

      {/* Global summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Projects" value={projects.length} color="blue" to="/projects" />
        <StatCard label="Team Members" value={resources.length} color="green" to="/resources" />
        <StatCard label="Out Today" value={totalOut} color="red" to="/leaves" />
        <StatCard label="Pending Leaves" value={totalPending} color="yellow" to="/leaves" />
      </div>

      {nextHoliday && holidayCountdown !== null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Upcoming Holiday</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-800">{nextHoliday.label}</h3>
              <p className="text-sm text-gray-600">
                {format(parseISO(nextHoliday.startDate), 'dd MMM yyyy')}
                {nextHoliday.startDate !== nextHoliday.endDate && ` → ${format(parseISO(nextHoliday.endDate), 'dd MMM yyyy')}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white px-4 py-2 text-center shadow-sm ring-1 ring-amber-200">
                <p className="text-xs uppercase tracking-wide text-gray-400">Countdown</p>
                <p className="text-lg font-bold text-amber-700">
                  {holidayCountdown === 0 ? 'Today' : `${holidayCountdown} day${holidayCountdown === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Idle Time Slots per Sprint */}
      {idleSlots.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Developer Idle Time per Sprint</h3>
              <p className="text-xs text-gray-400 mt-0.5">Developers with unallocated working days in active sprints</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {idleExpanded && (
                <>
                  <button
                    type="button"
                    onClick={() => setIdleProjectFilter('all')}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      idleProjectFilter === 'all'
                        ? 'bg-gray-800 border-gray-800 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    All Projects
                  </button>
                  {idleFilterProjects.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setIdleProjectFilter(p.id)}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        idleProjectFilter === p.id
                          ? 'bg-gray-800 border-gray-800 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={() => setIdleExpanded(v => !v)}
                className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                {idleExpanded ? 'Collapse ↑' : `Expand ↓ · ${idleSlots.length} slot${idleSlots.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
          {idleExpanded && (
            <div className="p-4">
              {filteredIdleSlots.length === 0 ? (
                <p className="text-sm text-gray-400">No idle time for the selected project.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredIdleSlots.map(slot => (
                    <IdleSlotCard key={`${slot.resourceId}-${slot.sprintId}`} slot={slot} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Per-project cards */}
      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">No projects yet. <Link to="/projects" className="text-blue-600 hover:underline">Create one</Link>.</p>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              resources={resources}
              leaves={leaves}
              today={today}
              isOutToday={isOutToday}
              isUpcoming={isUpcoming}
              getResource={getResource}
              onToggleTask={handleToggleTask}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ProjectCardProps {
  project: Project
  resources: Resource[]
  leaves: Leave[]
  today: Date
  isOutToday: (l: Leave) => boolean
  isUpcoming: (l: Leave) => boolean
  getResource: (id: string) => Resource | undefined
  onToggleTask: (leaveId: string, itemId: string) => void
}

function ProjectCard({ project, resources, leaves, today, isOutToday, isUpcoming, getResource, onToggleTask }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(true)
  const members = resources.filter((r) => r.projectIds.includes(project.id))
  const memberIds = new Set(members.map((r) => r.id))

  const projectLeaves = leaves.filter((l) => memberIds.has(l.resourceId))
  const outToday = projectLeaves.filter(isOutToday)
  const upcoming = projectLeaves.filter(isUpcoming).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const pending = projectLeaves.filter((l) => l.status === 'pending')

  const available = members.filter((m) => !outToday.some((l) => l.resourceId === m.id))

  // Nearest upcoming leave per member (list already sorted by startDate)
  const nearestUpcoming = Array.from(
    upcoming.reduce((map, l) => {
      if (!map.has(l.resourceId)) map.set(l.resourceId, l)
      return map
    }, new Map<string, Leave>()).values()
  )

  const daysUntilStart = (startDateStr: string) =>
    differenceInCalendarDays(parseISO(startDateStr), today)

  const workingDaysUntilReturn = (endDateStr: string) =>
    Math.max(0, differenceInBusinessDays(addDays(parseISO(endDateStr), 1), today))

  const csvEscape = (value: string | number) => {
    const text = String(value)
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }

  const exportProjectLeaves = () => {
    if (projectLeaves.length === 0) return

    const rows = projectLeaves
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((leave) => {
        const member = getResource(leave.resourceId)
        const deputy = leave.deputyId ? getResource(leave.deputyId) : undefined
        const handoverItems = leave.handoverItems ?? []
        const handoverDone = handoverItems.filter((item) => item.done).length
        const doneTasks = handoverItems.filter((item) => item.done).map((item) => item.text).join(' | ')
        const pendingTasks = handoverItems.filter((item) => !item.done).map((item) => item.text).join(' | ')
        const allTasks = handoverItems.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`).join(' | ')
        return {
          leaveId: leave.id,
          project: project.name,
          memberName: member?.name ?? '—',
          memberRole: member?.role ?? '—',
          leaveType: leave.type === 'other' && leave.otherLabel ? leave.otherLabel : leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          status: leave.status,
          deputy: deputy?.name ?? '—',
          handoverDone: `${handoverDone}/${handoverItems.length}`,
          handoverTasks: allTasks,
          handoverDoneTasks: doneTasks,
          handoverPendingTasks: pendingTasks,
          notes: leave.notes ?? '',
          createdAt: leave.createdAt,
        }
      })

    const headers = Object.keys(rows[0])
    const body = rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(','))
    const csv = [headers.join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const fileName = `leaves-${project.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Project header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ borderLeftColor: project.color, borderLeftWidth: 4 }}>
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
          <div>
            <h3 className="font-semibold text-gray-800">{project.name}</h3>
            {project.description && <p className="text-xs text-gray-400">{project.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span><span className="font-semibold text-gray-700">{members.length}</span> members</span>
          {outToday.length > 0 && (
            <span className="bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">{outToday.length} out today</span>
          )}
          {pending.length > 0 && (
            <span className="bg-yellow-100 text-yellow-600 font-semibold px-2 py-0.5 rounded-full">{pending.length} pending</span>
          )}
          <button
            type="button"
            onClick={exportProjectLeaves}
            disabled={projectLeaves.length === 0}
            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
          <Link to={`/projects/${project.id}`} className="text-blue-600 hover:underline">Manage →</Link>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
          >
            {expanded ? 'Collapse ↑' : 'Expand ↓'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Members & availability */}
        <div className="p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Team</p>
          <ul className="space-y-3">
            {members.map((m) => {
              const out = outToday.find((l) => l.resourceId === m.id)
              const deputy = out?.deputyId ? getResource(out.deputyId) : undefined
              const coveringFor = outToday.find((l) => l.deputyId === m.id)
              const coveringResource = coveringFor ? getResource(coveringFor.resourceId) : undefined
              return (
                <li key={m.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${out ? 'bg-red-400' : coveringFor ? 'bg-blue-400' : 'bg-green-400'}`} />
                      <Link to={`/resources/${m.id}`} className="font-medium text-gray-800 hover:text-blue-600 hover:underline">{m.name}</Link>
                      <span className="text-gray-400 text-xs">{m.role}</span>
                    </div>
                    <div className="text-right">
                      {out && (
                        <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded capitalize">
                          {out.type} leave
                        </span>
                      )}
                      {coveringFor && !out && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          Acting deputy
                        </span>
                      )}
                      {!out && !coveringFor && (
                        <span className="text-xs text-green-500">Available</span>
                      )}
                    </div>
                  </div>
                  {/* Deputy relationship line */}
                  {out && deputy && (
                    <p className="text-xs text-gray-400 ml-4 mt-0.5">
                      Covered by <span className="font-medium text-blue-600">{deputy.name}</span>
                    </p>
                  )}
                  {out && !deputy && (
                    <p className="text-xs text-gray-400 ml-4 mt-0.5 italic">No deputy assigned</p>
                  )}
                  {coveringFor && !out && coveringResource && (
                    <p className="text-xs text-gray-400 ml-4 mt-0.5">
                      Covering <span className="font-medium text-gray-600">{coveringResource.name}</span>
                    </p>
                  )}
                  {/* Return countdown for on-leave members */}
                  {out && (() => {
                    const wdays = workingDaysUntilReturn(out.endDate)
                    return (
                      <p className="text-xs text-amber-600 ml-4 mt-1 font-medium">
                        Returns in {wdays} working day{wdays === 1 ? '' : 's'}
                      </p>
                    )
                  })()}
                  {/* Handover tasks for on-leave members */}
                  {out && (out.handoverItems ?? []).length > 0 && (
                    <ul className="ml-4 mt-1.5 space-y-1">
                      {(out.handoverItems ?? []).map((item) => (
                        <li key={item.id} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => onToggleTask(out.id, item.id)}
                            className="accent-blue-600 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                          />
                          <span className={item.done ? 'line-through text-gray-400' : 'text-gray-600'}>
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
            {members.length === 0 && <li className="text-xs text-gray-400">No members allocated</li>}
          </ul>
        </div>

        {/* Next Leaves */}
        <div className="p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Next Leaves</p>
          {nearestUpcoming.length === 0 ? (
            <p className="text-xs text-gray-400">No upcoming leaves</p>
          ) : (
            <ul className="space-y-3">
              {nearestUpcoming.map((l) => {
                const res = getResource(l.resourceId)
                const deputy = l.deputyId ? getResource(l.deputyId) : undefined
                const daysLeft = daysUntilStart(l.startDate)
                const countdownCls =
                  daysLeft === 1 ? 'bg-red-100 text-red-600' :
                  daysLeft <= 3 ? 'bg-orange-100 text-orange-600' :
                  'bg-blue-100 text-blue-600'
                const items = l.handoverItems ?? []
                return (
                  <li key={l.id} className="border border-gray-100 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-gray-800 text-sm">{res?.name ?? '—'}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${countdownCls}`}>
                        {daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {format(parseISO(l.startDate), 'dd MMM')} → {format(parseISO(l.endDate), 'dd MMM yyyy')}
                      <span className={`ml-2 font-medium ${l.status === 'pending' ? 'text-yellow-600' : 'text-green-600'}`}>· {l.status}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {deputy ? (
                        <>Deputy: <span className="font-medium text-blue-600">{deputy.name}</span></>
                      ) : (
                        <span className="italic text-gray-300">No deputy assigned</span>
                      )}
                    </p>
                    {items.length > 0 && (
                      <ul className="space-y-1 pt-1.5 border-t border-gray-100">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => onToggleTask(l.id, item.id)}
                              className="accent-blue-600 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                            />
                            <span className={item.done ? 'line-through text-gray-400' : 'text-gray-600'}>
                              {item.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pending approvals */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending Approvals</p>
            {pending.length > 0 && (
              <Link to="/leaves" className="text-xs text-blue-600 hover:underline">View all</Link>
            )}
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-gray-400">No pending requests</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((l) => {
                const res = getResource(l.resourceId)
                const items = l.handoverItems ?? []
                const done = items.filter((i) => i.done).length
                return (
                  <li key={l.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{res?.name ?? '—'}</span>
                      <Link to={`/leaves/${l.id}/edit`} className="text-xs text-blue-600 hover:underline">Review</Link>
                    </div>
                    <p className="text-xs text-gray-400 capitalize">{l.type} · {l.startDate} → {l.endDate}</p>
                    {items.length > 0 ? (
                      <p className={`text-xs mt-0.5 font-medium ${done === items.length ? 'text-green-600' : 'text-orange-500'}`}>
                        Handover: {done} / {items.length} done
                      </p>
                    ) : (
                      <p className="text-xs mt-0.5 text-gray-300 italic">No handover items</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {available.length > 0 && pending.length === 0 && (
            <Link to="/leaves/new" className="mt-3 inline-block text-xs text-blue-600 hover:underline">+ New leave request</Link>
          )}
        </div>
        </div>
      )}
    </div>
  )
}

function IdleSlotCard({ slot }: { slot: IdleSlot }) {
  return (
    <Link to={`/resources/${slot.resourceId}`} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 block hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
          {slot.resourceName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{slot.resourceName}</p>
          <p className="text-xs text-gray-400 truncate">{slot.resourceRole}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: slot.projectColor }} />
        <span className="font-medium truncate">{slot.projectName}</span>
      </div>

      <p className="text-xs text-gray-500 truncate">
        Sprint: <span className="font-medium text-gray-700">{slot.sprintTitle}</span>
      </p>

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Idle Duration</p>
        <p className="text-2xl font-bold text-orange-500 leading-none">
          {slot.idleDays}
          <span className="text-sm font-medium text-gray-400 ml-1">day{slot.idleDays === 1 ? '' : 's'}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1.5">
          {slot.totalWorkingDays}d sprint · {slot.vacationDays}d leave · {slot.allocatedDays}d assigned
        </p>
      </div>
    </Link>
  )
}

function StatCard({ label, value, color, to }: { label: string; value: number; color: 'blue' | 'green' | 'red' | 'yellow'; to?: string }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  }
  const content = (
    <>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm font-medium mt-0.5 opacity-80">{label}</p>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={`rounded-xl border p-4 block transition-opacity hover:opacity-80 ${colors[color]}`}>
        {content}
      </Link>
    )
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      {content}
    </div>
  )
}
