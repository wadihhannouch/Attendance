import { format, isValid, parseISO } from 'date-fns'

export const DISPLAY_DATE_FORMAT = 'dd-MM-yyyy'

export function formatDisplayDate(value: string | Date): string {
  const parsed = typeof value === 'string' ? parseISO(value) : value
  return isValid(parsed) ? format(parsed, DISPLAY_DATE_FORMAT) : '—'
}

export function formatDisplayDateRange(start: string | Date, end: string | Date): string {
  const startLabel = formatDisplayDate(start)
  const endLabel = formatDisplayDate(end)
  return startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`
}
