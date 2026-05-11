import { useState, useEffect, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, parseISO, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { leavesApi, resourcesApi, projectsApi, settingsApi } from '../store/api'
import { Leave, Resource, Project, Settings, PublicHoliday } from '../types'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS },
})

interface CalEvent {
  id: string
  title: string
  start: Date
  end: Date
  color: string
  leave?: Leave
  isHoliday?: boolean
  isTentativeHoliday?: boolean
}

export default function CalendarPage() {
  const [view, setView] = useState<View>(Views.MONTH)
  const [date, setDate] = useState(new Date())
  const [selected, setSelected] = useState<CalEvent | null>(null)

  const [leaves, setLeaves] = useState<Leave[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [settings, setSettings] = useState<Settings>({ leaveTypes: [], defaultAnnualQuota: 21, publicHolidays: [] })

  useEffect(() => {
    leavesApi.getAll().then(setLeaves)
    resourcesApi.getAll().then(setResources)
    projectsApi.getAll().then(setProjects)
    settingsApi.get().then(setSettings)
  }, [])

  const getResource = (id: string) => resources.find((r) => r.id === id)
  const getProjectColor = (resourceId: string): string => {
    const res = getResource(resourceId)
    if (!res || res.projectIds.length === 0) return '#6B7280'
    return projects.find((p) => p.id === res.projectIds[0])?.color ?? '#6B7280'
  }

  const normalizeHoliday = (holiday: PublicHoliday): PublicHoliday => ({
    label: holiday.label,
    startDate: holiday.startDate ?? holiday.date ?? '',
    endDate: holiday.endDate ?? holiday.startDate ?? holiday.date ?? '',
  })

  const isNonWorkingDay = (day: Date) => {
    const weekDay = getDay(day)
    return weekDay === 5 || weekDay === 6
  }

  const isTentativeHolidayLabel = (label: string) => label.toLowerCase().includes('(tentative)')
  const cleanHolidayLabel = (label: string) => label.replace(/\s*\(tentative\)$/i, '')

  const events: CalEvent[] = useMemo(() => {
    const leaveEvents: CalEvent[] = leaves
      .filter((l) => l.status !== 'rejected')
      .map((l) => {
        const res = getResource(l.resourceId)
        return {
          id: l.id,
          title: `${res?.name ?? '?'} (${l.type})`,
          start: parseISO(l.startDate),
          end: addDays(parseISO(l.endDate), 1), // big-calendar end is exclusive
          color: getProjectColor(l.resourceId),
          leave: l,
        }
      })

    const holidayEvents: CalEvent[] = settings.publicHolidays.map(normalizeHoliday).map((h) => {
      const isTentativeHoliday = isTentativeHolidayLabel(h.label)
      const displayLabel = cleanHolidayLabel(h.label)
      return {
        id: `holiday-${h.startDate}-${h.endDate}-${displayLabel}`,
        title: `${isTentativeHoliday ? '⏳' : '🏖️'} ${displayLabel}`,
        start: parseISO(h.startDate),
        end: addDays(parseISO(h.endDate), 1),
        color: isTentativeHoliday ? '#F59E0B' : '#EF4444',
        isHoliday: true,
        isTentativeHoliday,
      }
    })

    return [...leaveEvents, ...holidayEvents]
  }, [leaves, resources, projects, settings])

  const eventStyleGetter = (event: CalEvent) => ({
    style: {
      backgroundColor: event.color,
      borderRadius: '4px',
      opacity: 0.9,
      border: event.isTentativeHoliday ? '1px dashed rgba(255,255,255,0.9)' : 'none',
      color: '#fff',
      fontSize: '12px',
    },
  })

  const dayStyleGetter = (day: Date) => {
    if (!isNonWorkingDay(day)) return {}
    return {
      style: {
        backgroundColor: '#F8FAFC',
        opacity: 0.65,
        pointerEvents: 'none' as const,
        filter: 'grayscale(0.15)',
      },
      className: 'non-working-day',
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Calendar</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView(Views.MONTH)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${view === Views.MONTH ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setView(Views.WEEK)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${view === Views.WEEK ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            Weekly
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
        <span className="font-semibold text-gray-700">Legend</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-red-500" />
          Confirmed holiday
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-dashed border-amber-600 bg-amber-500" />
          Tentative holiday
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-slate-200" />
          Friday / Saturday non-working days
        </span>
        <span className="text-gray-400">Working days: Sunday to Thursday</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4" style={{ height: 620 }}>
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventStyleGetter}
          dayPropGetter={dayStyleGetter}
          onSelectEvent={(e) => setSelected(e as CalEvent)}
          popup
        />
      </div>

      {/* Event detail popover */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {selected.isHoliday ? (
              <>
                <h3 className="font-semibold text-gray-800 text-lg mb-1">{selected.title}</h3>
                <p className="text-sm text-gray-500">
                  {format(selected.start, 'dd MMM yyyy') === format(addDays(selected.end, -1), 'dd MMM yyyy')
                    ? format(selected.start, 'dd MMM yyyy')
                    : `${format(selected.start, 'dd MMM yyyy')} → ${format(addDays(selected.end, -1), 'dd MMM yyyy')}`}
                </p>
                {selected.isTentativeHoliday && (
                  <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Tentative date
                  </p>
                )}
              </>
            ) : selected.leave ? (
              <>
                <h3 className="font-semibold text-gray-800 text-lg mb-3">{getResource(selected.leave.resourceId)?.name ?? '—'}</h3>
                <dl className="text-sm space-y-2">
                  <Row label="Type" value={selected.leave.type === 'other' && selected.leave.otherLabel ? selected.leave.otherLabel : selected.leave.type} />
                  <Row label="From" value={format(parseISO(selected.leave.startDate), 'dd MMM yyyy')} />
                  <Row label="To" value={format(parseISO(selected.leave.endDate), 'dd MMM yyyy')} />
                  <Row label="Status" value={selected.leave.status} />
                  {selected.leave.deputyId && <Row label="Deputy" value={getResource(selected.leave.deputyId)?.name ?? '—'} />}
                  {selected.leave.notes && <Row label="Notes" value={selected.leave.notes} />}
                </dl>
              </>
            ) : null}
            <button onClick={() => setSelected(null)} className="mt-4 w-full btn-secondary">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800 capitalize">{value}</dd>
    </div>
  )
}
