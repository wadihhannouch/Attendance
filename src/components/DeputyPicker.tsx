import { Resource, Leave } from '../types'

interface Props {
  resources: Resource[]
  leaves: Leave[]
  startDate: string
  endDate: string
  excludeResourceId?: string
  value: string
  onChange: (id: string) => void
}

export default function DeputyPicker({ resources, leaves, startDate, endDate, excludeResourceId, value, onChange }: Props) {

  // A resource is unavailable if they have an approved leave overlapping the given range
  const isUnavailable = (rid: string): boolean => {
    if (!startDate || !endDate) return false
    return leaves.some(
      (l) =>
        l.resourceId === rid &&
        l.status === 'approved' &&
        l.startDate <= endDate &&
        l.endDate >= startDate
    )
  }

  const available = resources.filter((r) => r.id !== excludeResourceId && !isUnavailable(r.id))
  const onLeave = resources.filter((r) => r.id !== excludeResourceId && isUnavailable(r.id))

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— None —</option>
      {available.length > 0 && (
        <optgroup label="Available">
          {available.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
          ))}
        </optgroup>
      )}
      {onLeave.length > 0 && (
        <optgroup label="On Leave (unavailable)">
          {onLeave.map((r) => (
            <option key={r.id} value={r.id} disabled>{r.name} ({r.role}) — on leave</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
