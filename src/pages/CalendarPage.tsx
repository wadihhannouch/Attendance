import { useState, useEffect, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, parseISO, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { leavesApi, resourcesApi, projectsApi, settingsApi } from '../store/api'
import { Leave, Resource, Project, Settings } from '../types'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
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

    const holidayEvents: CalEvent[] = settings.publicHolidays.map((h) => ({
      id: `holiday-${h.date}`,
      title: `🏖️ ${h.label}`,
      start: parseISO(h.date),
      end: addDays(parseISO(h.date), 1),
      color: '#EF4444',
      isHoliday: true,
    }))

    return [...leaveEvents, ...holidayEvents]
  }, [leaves, resources, projects, settings])

  const eventStyleGetter = (event: CalEvent) => ({
    style: {
      backgroundColor: event.color,
      borderRadius: '4px',
      opacity: 0.9,
      border: 'none',
      color: '#fff',
      fontSize: '12px',
    },
  })

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

      <div className="bg-white border border-gray-200 rounded-xl p-4" style={{ height: 620 }}>
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventStyleGetter}
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
                <p className="text-sm text-gray-500">{format(selected.start, 'dd MMM yyyy')}</p>
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
