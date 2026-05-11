import { useState, useEffect } from 'react'
import { settingsApi } from '../store/api'
import { Settings as SettingsType, PublicHoliday } from '../types'

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType>({ leaveTypes: [], defaultAnnualQuota: 21, publicHolidays: [] })
  const [newType, setNewType] = useState('')
  const [newHolidayStartDate, setNewHolidayStartDate] = useState('')
  const [newHolidayEndDate, setNewHolidayEndDate] = useState('')
  const [newHolidayLabel, setNewHolidayLabel] = useState('')
  const [saved, setSaved] = useState(false)

  const normalizeHoliday = (holiday: PublicHoliday): PublicHoliday => ({
    label: holiday.label,
    startDate: holiday.startDate ?? holiday.date ?? '',
    endDate: holiday.endDate ?? holiday.startDate ?? holiday.date ?? '',
  })

  const normalizeSettings = (value: SettingsType): SettingsType => ({
    ...value,
    publicHolidays: value.publicHolidays.map(normalizeHoliday),
  })

  useEffect(() => {
    settingsApi.get().then((value) => setSettings(normalizeSettings(value)))
  }, [])

  const save = async (updated: SettingsType) => {
    const normalized = normalizeSettings(updated)
    await settingsApi.save(normalized)
    setSettings(normalized)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addLeaveType = () => {
    const trimmed = newType.trim()
    if (!trimmed || settings.leaveTypes.includes(trimmed)) return
    save({ ...settings, leaveTypes: [...settings.leaveTypes, trimmed] })
    setNewType('')
  }

  const removeLeaveType = (t: string) => {
    save({ ...settings, leaveTypes: settings.leaveTypes.filter((x) => x !== t) })
  }

  const addHoliday = () => {
    if (!newHolidayStartDate || !newHolidayEndDate || !newHolidayLabel.trim()) return
    if (newHolidayEndDate < newHolidayStartDate) return
    const holiday: PublicHoliday = {
      startDate: newHolidayStartDate,
      endDate: newHolidayEndDate,
      label: newHolidayLabel.trim(),
    }
    save({
      ...settings,
      publicHolidays: [...settings.publicHolidays.map(normalizeHoliday), holiday].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    })
    setNewHolidayStartDate('')
    setNewHolidayEndDate('')
    setNewHolidayLabel('')
  }

  const removeHoliday = (holidayToRemove: PublicHoliday) => {
    save({
      ...settings,
      publicHolidays: settings.publicHolidays.filter(
        (holiday) => !(holiday.startDate === holidayToRemove.startDate && holiday.endDate === holidayToRemove.endDate && holiday.label === holidayToRemove.label)
      ),
    })
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
      </div>

      {/* Annual quota */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-700">Default Annual Leave Quota</h3>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            className="input w-28"
            value={settings.defaultAnnualQuota}
            onChange={(e) => save({ ...settings, defaultAnnualQuota: Number(e.target.value) })}
          />
          <span className="text-sm text-gray-500">days per year</span>
        </div>
        <p className="text-xs text-gray-400">Applied as default when adding new team members. Existing balances are not changed.</p>
      </section>

      {/* Leave types */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-700">Leave Types</h3>
        <div className="flex flex-wrap gap-2">
          {settings.leaveTypes.map((t) => (
            <span key={t} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
              {t}
              <button onClick={() => removeLeaveType(t)} className="text-gray-400 hover:text-red-500 leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="New leave type…"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLeaveType())}
          />
          <button onClick={addLeaveType} className="btn-primary">Add</button>
        </div>
      </section>

      {/* Public holidays */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-700">Public Holidays</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Holiday Name</th>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {settings.publicHolidays.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No public holidays configured.</td>
                </tr>
              ) : (
                settings.publicHolidays.map((h) => (
                  <tr key={`${h.startDate}-${h.endDate}-${h.label}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{h.label}</td>
                    <td className="px-4 py-3 text-gray-600">{h.startDate}</td>
                    <td className="px-4 py-3 text-gray-600">{h.endDate}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeHoliday(h)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-gray-50/60">
                <td className="px-4 py-3">
                  <input className="input" placeholder="Holiday name…" value={newHolidayLabel} onChange={(e) => setNewHolidayLabel(e.target.value)} />
                </td>
                <td className="px-4 py-3">
                  <input type="date" className="input w-full" value={newHolidayStartDate} onChange={(e) => setNewHolidayStartDate(e.target.value)} />
                </td>
                <td className="px-4 py-3">
                  <input type="date" className="input w-full" value={newHolidayEndDate} onChange={(e) => setNewHolidayEndDate(e.target.value)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={addHoliday} className="btn-primary">Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
