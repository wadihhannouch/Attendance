import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { resourcesApi, projectsApi, leavesApi, sprintsApi, brsApi, brTrackerApi } from '../store/api'
import { Resource, Project, Leave, Sprint, BusinessRequirement, BRTrackerEntry } from '../types'
import { format, parseISO, isWithinInterval, differenceInCalendarDays } from 'date-fns'

// ─── Calendar utilities (Gulf work week: Fri+Sat off) ────────────────────────

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getWorkingDays(startIso: string, endIso: string): Date[] {
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

function buildVacationSet(leaves: Leave[], resourceId: string, workingDayStrs: Set<string>): Set<string> {
  const vacation = new Set<string>()
  for (const leave of leaves) {
    if (leave.resourceId !== resourceId || leave.status !== 'approved') continue
    const cur = parseLocal(leave.startDate)
    const end = parseLocal(leave.endDate)
    while (cur <= end) {
      const ds = toIso(cur)
      if (workingDayStrs.has(ds)) vacation.add(ds)
      cur.setDate(cur.getDate() + 1)
    }
  }
  return vacation
}

function buildAllocation(
  resourceId: string,
  entries: BRTrackerEntry[],
  vacation: Set<string>,
  workingDays: Date[]
): Map<string, string> {
  const alloc = new Map<string, string>()
  const myEntries = entries
    .filter(e => e.resourceId === resourceId)
    .sort((a, b) => a.executionOrder - b.executionOrder)
  if (!myEntries.length) return alloc
  const available = workingDays.map(toIso).filter(d => !vacation.has(d))
  let idx = 0
  for (const entry of myEntries) {
    for (let i = 0; i < entry.timelineDays && idx < available.length; i++) {
      alloc.set(available[idx++], entry.brId)
    }
  }
  return alloc
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MILESTONES = [
  { key: 'startDate',      label: 'Start',      color: '#6B7280' },
  { key: 'testingDate',    label: 'Testing',    color: '#D97706' },
  { key: 'pilotDate',      label: 'Pilot',      color: '#2563EB' },
  { key: 'productionDate', label: 'Production', color: '#059669' },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [member, setMember] = useState<Resource | undefined>()
  const [projects, setProjects] = useState<Project[]>([])
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [allResources, setAllResources] = useState<Resource[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [brs, setBRs] = useState<BusinessRequirement[]>([])
  const [trackerEntries, setTrackerEntries] = useState<BRTrackerEntry[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [hiddenBRIds, setHiddenBRIds] = useState<Set<string>>(new Set())

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  useEffect(() => {
    resourcesApi.getAll().then((rs) => {
      setAllResources(rs)
      setMember(rs.find((r) => r.id === id))
    })
    projectsApi.getAll().then(setProjects)
    leavesApi.getAll().then(setLeaves)
    sprintsApi.getAll().then(setSprints).catch(() => {})
    brsApi.getAll().then(setBRs).catch(() => {})
    brTrackerApi.getAll().then(setTrackerEntries).catch(() => {})
  }, [id])

  const memberLeaves = useMemo(() => leaves.filter((l) => l.resourceId === id), [leaves, id])

  // ── Sprint calendar data ──────────────────────────────────────────────────

  const memberEntries = useMemo(
    () => trackerEntries.filter(e => e.resourceId === id),
    [trackerEntries, id]
  )

  const allocatedBRIds = useMemo(
    () => new Set(memberEntries.map(e => e.brId)),
    [memberEntries]
  )

  const relevantSprints = useMemo(() => {
    const sprintIdsWithAlloc = new Set(
      brs.filter(b => allocatedBRIds.has(b.id) && b.sprintId).map(b => b.sprintId as string)
    )
    return sprints.filter(s => sprintIdsWithAlloc.has(s.id))
  }, [sprints, brs, allocatedBRIds])

  const selectedSprint = sprints.find(s => s.id === selectedSprintId)

  const workingDays = useMemo(
    () => (selectedSprint ? getWorkingDays(selectedSprint.startDate, selectedSprint.pilotDate) : []),
    [selectedSprint]
  )

  const workingDayStrs = useMemo(() => new Set(workingDays.map(toIso)), [workingDays])

  const vacation = useMemo(
    () => (id ? buildVacationSet(leaves, id, workingDayStrs) : new Set<string>()),
    [leaves, id, workingDayStrs]
  )

  const sprintBRIds = useMemo(
    () => new Set(brs.filter(b => b.sprintId === selectedSprintId && allocatedBRIds.has(b.id)).map(b => b.id)),
    [brs, selectedSprintId, allocatedBRIds]
  )

  const sprintEntries = useMemo(
    () => trackerEntries.filter(e => sprintBRIds.has(e.brId) && e.resourceId === id),
    [trackerEntries, sprintBRIds, id]
  )

  const allocation = useMemo(
    () => (id ? buildAllocation(id, sprintEntries, vacation, workingDays) : new Map<string, string>()),
    [id, sprintEntries, vacation, workingDays]
  )

  const monthGroups = useMemo(() => {
    const groups: { label: string; count: number }[] = []
    for (const day of workingDays) {
      const label = day.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      if (!groups.length || groups[groups.length - 1].label !== label) {
        groups.push({ label, count: 1 })
      } else {
        groups[groups.length - 1].count++
      }
    }
    return groups
  }, [workingDays])

  const allocatedBRsInSprint = useMemo(
    () => brs.filter(b => sprintBRIds.has(b.id)),
    [brs, sprintBRIds]
  )

  const toggleBR = (brId: string) =>
    setHiddenBRIds(prev => {
      const next = new Set(prev)
      next.has(brId) ? next.delete(brId) : next.add(brId)
      return next
    })

  // ── Leave data ────────────────────────────────────────────────────────────

  const isOutToday = (l: Leave) =>
    l.status === 'approved' &&
    isWithinInterval(today, { start: parseISO(l.startDate), end: parseISO(l.endDate) })

  const currentLeave = memberLeaves.find(isOutToday)
  const pendingLeaves = memberLeaves.filter((l) => l.status === 'pending')
  const approvedLeaves = memberLeaves.filter((l) => l.status === 'approved')
  const upcomingLeaves = memberLeaves
    .filter((l) => l.status !== 'rejected' && l.startDate > todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const totalUsedDays = approvedLeaves.reduce((sum, l) => {
    return sum + differenceInCalendarDays(parseISO(l.endDate), parseISO(l.startDate)) + 1
  }, 0)

  const getResource = (rid: string) => allResources.find((r) => r.id === rid)

  const statusBadge = currentLeave
    ? { label: 'On Leave', cls: 'bg-red-100 text-red-700' }
    : pendingLeaves.length > 0
    ? { label: 'Has Pending', cls: 'bg-yellow-100 text-yellow-700' }
    : { label: 'Available', cls: 'bg-green-100 text-green-700' }

  const sortedLeaves = [...memberLeaves].sort((a, b) => b.startDate.localeCompare(a.startDate))

  const leaveStatusCls = (status: string) => {
    if (status === 'approved') return 'bg-green-50 text-green-700'
    if (status === 'pending') return 'bg-yellow-50 text-yellow-700'
    return 'bg-red-50 text-red-600'
  }

  const memberProjects = projects.filter((p) => member?.projectIds.includes(p.id))

  if (!member) {
    return (
      <div className="space-y-3">
        <p className="text-gray-500">Member not found or loading…</p>
        <Link to="/resources" className="text-blue-600 hover:underline text-sm">← Back to Team Members</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">←</button>
        <h2 className="text-2xl font-bold text-gray-800">Member Details</h2>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 flex-shrink-0">
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-bold text-gray-800">{member.name}</h3>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{member.role}</p>
            {member.email && <p className="text-sm text-gray-400 mt-0.5">{member.email}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Annual Balance</span>
            <span className="text-2xl font-bold text-blue-600">{member.annualLeaveBalance}</span>
            <span className="text-xs text-gray-400">days</span>
          </div>
        </div>

        {memberProjects.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Projects</p>
            <div className="flex flex-wrap gap-2">
              {memberProjects.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-800">{memberLeaves.length}</p>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Total Requests</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-green-600">{approvedLeaves.length}</p>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Approved</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-yellow-600">{pendingLeaves.length}</p>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Pending</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-blue-600">{totalUsedDays}</p>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Days Used</p>
        </div>
      </div>

      {/* Current leave alert */}
      {currentLeave && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1">Currently on Leave</p>
          <p className="text-sm font-medium text-gray-800 capitalize">
            {currentLeave.type === 'other' && currentLeave.otherLabel ? currentLeave.otherLabel : currentLeave.type} leave
          </p>
          <p className="text-sm text-gray-600">
            {format(parseISO(currentLeave.startDate), 'dd MMM yyyy')} → {format(parseISO(currentLeave.endDate), 'dd MMM yyyy')}
          </p>
          {currentLeave.deputyId && (
            <p className="text-sm text-gray-500 mt-1">
              Deputy: <span className="font-medium text-blue-600">{getResource(currentLeave.deputyId)?.name ?? '—'}</span>
            </p>
          )}
        </div>
      )}

      {/* Upcoming leaves */}
      {upcomingLeaves.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Upcoming Leaves</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {upcomingLeaves.map((l) => {
              const daysLeft = differenceInCalendarDays(parseISO(l.startDate), today)
              return (
                <li key={l.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-800 capitalize">
                      {l.type === 'other' && l.otherLabel ? l.otherLabel : l.type}
                    </span>
                    <span className="ml-2 text-gray-400 text-xs">
                      {format(parseISO(l.startDate), 'dd MMM')} → {format(parseISO(l.endDate), 'dd MMM yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${leaveStatusCls(l.status)}`}>
                      {l.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {daysLeft === 0 ? 'Tomorrow' : `In ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                    </span>
                    <Link to={`/leaves/${l.id}/edit`} className="text-xs text-blue-600 hover:underline">Review</Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Sprint Allocation Calendar ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Sprint Allocations</h3>
          <p className="text-xs text-gray-400 mt-0.5">BR allocation calendar — only sprints where this member has entries</p>
        </div>

        {relevantSprints.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No sprint allocations found for this member.</p>
        ) : (
          <div className="p-4 space-y-4">
            {/* Sprint selector */}
            <div className="flex flex-wrap gap-2">
              {relevantSprints.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedSprintId(s.id); setHiddenBRIds(new Set()) }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedSprintId === s.id
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>

            {selectedSprint && (
              <>
                {/* Milestone bar */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-xs">
                  <span className="font-semibold text-gray-700 mr-1">{selectedSprint.title}</span>
                  {MILESTONES.map(m => (
                    <span key={m.key} className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="font-medium" style={{ color: m.color }}>{m.label}</span>
                      <span className="text-gray-500">{selectedSprint[m.key]}</span>
                    </span>
                  ))}
                  <span className="ml-auto text-gray-400 font-medium">{workingDays.length} working days</span>
                </div>

                {/* BR filter */}
                {allocatedBRsInSprint.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-gray-400 font-medium">Filter BRs:</span>
                    {allocatedBRsInSprint.map(br => (
                      <button
                        key={br.id}
                        type="button"
                        onClick={() => toggleBR(br.id)}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                          hiddenBRIds.has(br.id)
                            ? 'bg-white border-gray-200 text-gray-400 line-through'
                            : 'text-white border-transparent'
                        }`}
                        style={hiddenBRIds.has(br.id) ? {} : { backgroundColor: br.color }}
                      >
                        {br.reference}
                        <span className={`font-normal truncate max-w-[100px] ${hiddenBRIds.has(br.id) ? '' : 'opacity-80'}`}>
                          — {br.title}
                        </span>
                      </button>
                    ))}
                    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-orange-200 text-orange-600 bg-orange-50">
                      ✕ On leave
                    </span>
                  </div>
                )}

                {/* Calendar grid */}
                {workingDays.length === 0 ? (
                  <p className="text-sm text-gray-400">No working days in this sprint range.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '160px' }} />
                        {workingDays.map(d => <col key={toIso(d)} style={{ width: '42px' }} />)}
                      </colgroup>

                      <thead>
                        {/* Month row */}
                        <tr>
                          <th
                            rowSpan={2}
                            className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-[11px] text-gray-500 font-medium"
                          >
                            Developer
                          </th>
                          {monthGroups.map((g, i) => (
                            <th
                              key={i}
                              colSpan={g.count}
                              className="border-b border-r border-gray-200 px-1 py-1.5 bg-gray-50 text-gray-600 font-semibold text-center text-[11px] whitespace-nowrap"
                            >
                              {g.label}
                            </th>
                          ))}
                        </tr>

                        {/* Day row */}
                        <tr>
                          {workingDays.map(day => {
                            const ds = toIso(day)
                            const isToday   = ds === todayStr
                            const isTesting = ds === selectedSprint.testingDate
                            const isPilot   = ds === selectedSprint.pilotDate
                            const bg = isToday
                              ? 'bg-blue-100 text-blue-700'
                              : isTesting
                              ? 'bg-yellow-50 text-yellow-700'
                              : isPilot
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-50 text-gray-500'
                            const milestoneColor = isTesting ? '#D97706' : isPilot ? '#2563EB' : null
                            return (
                              <th
                                key={ds}
                                className={`border-b border-r border-gray-200 py-1 text-center text-[10px] font-medium relative ${bg}`}
                                title={isTesting ? 'Testing Date' : isPilot ? 'Pilot Date' : undefined}
                              >
                                {milestoneColor && (
                                  <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: milestoneColor }} />
                                )}
                                <div className="font-bold leading-tight">{day.getDate()}</div>
                                <div className="opacity-60 leading-tight">{DAY_ABBR[day.getDay()]}</div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>

                      <tbody>
                        <tr>
                          {/* Sticky member cell */}
                          <td className="sticky left-0 z-20 bg-white px-3 py-2 border-r border-gray-200">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[11px] font-bold text-blue-600 flex-shrink-0">
                                {member.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-800 text-xs truncate leading-tight">{member.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{member.role}</p>
                              </div>
                            </div>
                          </td>

                          {/* Day cells */}
                          {(() => {
                            let prevBrId: string | undefined
                            return workingDays.map((day, di) => {
                              const ds = toIso(day)
                              const isVacation = vacation.has(ds)
                              const brId = allocation.get(ds)
                              const br = brId && !hiddenBRIds.has(brId) ? brs.find(b => b.id === brId) : undefined
                              const isFirst = brId !== prevBrId
                              prevBrId = brId
                              const borderR = di === workingDays.length - 1 ? '' : 'border-r border-gray-200'

                              if (isVacation) {
                                return (
                                  <td key={ds} className={`p-0 ${borderR}`} title={`${member.name}: On leave`}>
                                    <div
                                      className="h-10"
                                      style={{ background: 'repeating-linear-gradient(45deg,#fff7ed,#fff7ed 4px,#fed7aa 4px,#fed7aa 8px)' }}
                                    />
                                  </td>
                                )
                              }

                              if (br) {
                                return (
                                  <td key={ds} className={`p-0 ${borderR}`} title={`${br.reference}: ${br.title}`}>
                                    <div
                                      className="h-10 flex items-center justify-center overflow-hidden"
                                      style={{ backgroundColor: br.color, opacity: isFirst ? 1 : 0.82 }}
                                    >
                                      {isFirst && (
                                        <span className="text-white text-[10px] font-bold px-0.5 truncate leading-tight">
                                          {br.reference.length > 7 ? br.reference.slice(0, 6) + '…' : br.reference}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                )
                              }

                              return (
                                <td key={ds} className={`p-0 ${borderR}`}>
                                  <div className="h-10 bg-white" />
                                </td>
                              )
                            })
                          })()}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {!selectedSprint && relevantSprints.length > 0 && (
              <p className="text-sm text-gray-400">Select a sprint above to view the allocation calendar.</p>
            )}
          </div>
        )}
      </div>

      {/* Leave history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Leave History</h3>
          <Link to="/leaves/new" className="text-xs text-blue-600 hover:underline">+ New Request</Link>
        </div>
        {sortedLeaves.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No leave records yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-left">From</th>
                <th className="px-5 py-3 text-left">To</th>
                <th className="px-5 py-3 text-left">Duration</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Deputy</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedLeaves.map((l) => {
                const duration = differenceInCalendarDays(parseISO(l.endDate), parseISO(l.startDate)) + 1
                const deputy = l.deputyId ? getResource(l.deputyId) : undefined
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800 capitalize">
                      {l.type === 'other' && l.otherLabel ? l.otherLabel : l.type}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{format(parseISO(l.startDate), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3 text-gray-600">{format(parseISO(l.endDate), 'dd MMM yyyy')}</td>
                    <td className="px-5 py-3 text-gray-500">{duration} day{duration === 1 ? '' : 's'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${leaveStatusCls(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{deputy?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/leaves/${l.id}/edit`} className="text-xs text-blue-600 hover:underline">Edit</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
