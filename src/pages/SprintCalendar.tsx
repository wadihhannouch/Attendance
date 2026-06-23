import { useState, useEffect, useMemo } from 'react'
import { sprintsApi, brsApi, brTrackerApi, allResourcesApi, resourcesApi, leavesApi } from '../store/api'
import { Sprint, BusinessRequirement, BRTrackerEntry, Resource, Leave } from '../types'

// ─── Date utilities ───────────────────────────────────────────────────────────

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Friday (5) and Saturday (6) are weekend days (Gulf work week)
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 5 || day === 6
}

function getWorkingDays(startIso: string, endIso: string): Date[] {
  const days: Date[] = []
  const cur = parseLocal(startIso)
  const end = parseLocal(endIso)
  while (cur <= end) {
    if (!isWeekend(cur)) days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function buildVacationSet(
  leaves: Leave[],
  resourceId: string,
  workingDayStrs: Set<string>
): Set<string> {
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

// Returns day → brId, allocated consecutively skipping vacation days
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

export default function SprintCalendar() {
  const [sprints, setSprints]               = useState<Sprint[]>([])
  const [brs, setBRs]                       = useState<BusinessRequirement[]>([])
  const [trackerEntries, setTrackerEntries] = useState<BRTrackerEntry[]>([])
  const [resources, setResources]           = useState<Resource[]>([])
  const [leaves, setLeaves]                 = useState<Leave[]>([])
  const [selectedId, setSelectedId]         = useState('')

  useEffect(() => {
    sprintsApi.getAll().then(setSprints).catch(() => {})
    brsApi.getAll().then(setBRs).catch(() => {})
    brTrackerApi.getAll().then(setTrackerEntries).catch(() => {})
    // Fall back to role-scoped endpoint if /resources/all isn't available yet
    allResourcesApi.getAll().then(setResources).catch(() => resourcesApi.getAll().then(setResources).catch(() => {}))
    leavesApi.getAll().then(setLeaves).catch(() => {})
  }, [])

  const sprint = sprints.find(s => s.id === selectedId)

  const workingDays = useMemo(
    () => (sprint ? getWorkingDays(sprint.startDate, sprint.pilotDate) : []),
    [sprint]
  )

  const workingDayStrs = useMemo(() => new Set(workingDays.map(toIso)), [workingDays])

  const sprintResources = useMemo(
    () => (sprint ? resources.filter(r => r.projectIds.includes(sprint.projectId)) : []),
    [sprint, resources]
  )

  const vacationSets = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const r of sprintResources) {
      map.set(r.id, buildVacationSet(leaves, r.id, workingDayStrs))
    }
    return map
  }, [sprintResources, leaves, workingDayStrs])

  const allocations = useMemo(() => {
    const map = new Map<string, Map<string, string>>()
    for (const r of sprintResources) {
      map.set(r.id, buildAllocation(r.id, trackerEntries, vacationSets.get(r.id) ?? new Set(), workingDays))
    }
    return map
  }, [sprintResources, trackerEntries, vacationSets, workingDays])

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

  const usedBRIds = useMemo(() => {
    const ids = new Set<string>()
    for (const a of allocations.values()) for (const id of a.values()) ids.add(id)
    return ids
  }, [allocations])

  const getBR = (id: string) => brs.find(b => b.id === id)
  const todayStr = toIso(new Date())

  return (
    <div className="space-y-5">
      {/* Page header */}
      <h2 className="text-2xl font-bold text-gray-800">Sprint Calendar</h2>

      {/* Sprint selector */}
      {sprints.length === 0 ? (
        <p className="text-gray-400 text-sm">No sprints found. Create one in the Sprints page first.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sprints.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                selectedId === s.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              🏃 {s.title}
            </button>
          ))}
        </div>
      )}

      {!sprint ? (
        sprints.length > 0 && <p className="text-gray-400 text-sm">Select a sprint above to view the calendar.</p>
      ) : (
        <>
          {/* Milestone bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs">
            <span className="font-semibold text-gray-700 mr-1">{sprint.title}</span>
            {MILESTONES.map(m => (
              <span key={m.key} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                <span className="font-medium" style={{ color: m.color }}>{m.label}</span>
                <span className="text-gray-500">{sprint[m.key]}</span>
              </span>
            ))}
            <span className="ml-auto text-gray-400 font-medium">{workingDays.length} working days</span>
          </div>

          {/* BR legend */}
          {usedBRIds.size > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-400 font-medium">Legend:</span>
              {[...usedBRIds].map(id => {
                const br = getBR(id)
                if (!br) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium text-white"
                    style={{ backgroundColor: br.color }}
                  >
                    {br.reference}
                    <span className="opacity-75 font-normal truncate max-w-[120px]">— {br.title}</span>
                  </span>
                )
              })}
              <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border border-orange-200 text-orange-600 bg-orange-50">
                ✕ On leave
              </span>
            </div>
          )}

          {sprintResources.length === 0 ? (
            <p className="text-gray-400 text-sm">No developers are assigned to this sprint's project.</p>
          ) : workingDays.length === 0 ? (
            <p className="text-gray-400 text-sm">No working days found between the start date and pilot date.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '180px' }} />
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
                      const isToday    = ds === todayStr
                      const isTesting  = ds === sprint.testingDate
                      const isPilot    = ds === sprint.pilotDate

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
                            <span
                              className="absolute inset-x-0 top-0 h-0.5"
                              style={{ backgroundColor: milestoneColor }}
                            />
                          )}
                          <div className="font-bold leading-tight">{day.getDate()}</div>
                          <div className="opacity-60 leading-tight">{DAY_ABBR[day.getDay()]}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                <tbody>
                  {sprintResources.map((resource, ri) => {
                    const alloc   = allocations.get(resource.id) ?? new Map<string, string>()
                    const vacation = vacationSets.get(resource.id) ?? new Set<string>()
                    const isLast  = ri === sprintResources.length - 1

                    // Track which brId is active to detect first-day-of-block for showing label
                    let prevBrId: string | undefined

                    return (
                      <tr key={resource.id}>
                        {/* Sticky developer cell */}
                        <td className={`sticky left-0 z-20 bg-white px-3 py-2 border-r border-gray-200 ${!isLast ? 'border-b' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
                              {resource.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 text-xs truncate leading-tight">{resource.name}</p>
                              <p className="text-[10px] text-gray-400 truncate">{resource.role}</p>
                            </div>
                          </div>
                        </td>

                        {/* Day cells */}
                        {workingDays.map((day, di) => {
                          const ds        = toIso(day)
                          const isVacation = vacation.has(ds)
                          const brId      = alloc.get(ds)
                          const br        = brId ? getBR(brId) : undefined
                          const isFirst   = brId !== prevBrId  // first day of this BR block
                          prevBrId = brId

                          const borderClasses = `border-r border-gray-200 ${!isLast ? 'border-b' : ''} ${di === workingDays.length - 1 ? 'border-r-0' : ''}`

                          if (isVacation) {
                            return (
                              <td key={ds} className={`p-0 ${borderClasses}`} title={`${resource.name}: On leave`}>
                                <div
                                  className="h-10"
                                  style={{ background: 'repeating-linear-gradient(45deg,#fff7ed,#fff7ed 4px,#fed7aa 4px,#fed7aa 8px)' }}
                                />
                              </td>
                            )
                          }

                          if (br) {
                            return (
                              <td key={ds} className={`p-0 ${borderClasses}`} title={`${br.reference}: ${br.title}`}>
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
                            <td key={ds} className={`p-0 ${borderClasses}`}>
                              <div className="h-10 bg-white" />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
