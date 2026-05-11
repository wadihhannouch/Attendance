import { useState, useEffect } from 'react'
import { settingsApi } from '../store/api'
import { Settings as SettingsType, PublicHoliday } from '../types'

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType>({ leaveTypes: [], defaultAnnualQuota: 21, publicHolidays: [] })
  const [newType, setNewType] = useState('')
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayLabel, setNewHolidayLabel] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { settingsApi.get().then(setSettings) }, [])

  const save = async (updated: SettingsType) => {
    await settingsApi.save(updated)
    setSettings(updated)
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
    if (!newHolidayDate || !newHolidayLabel.trim()) return
    const holiday: PublicHoliday = { date: newHolidayDate, label: newHolidayLabel.trim() }
    save({ ...settings, publicHolidays: [...settings.publicHolidays, holiday].sort((a, b) => a.date.localeCompare(b.date)) })
    setNewHolidayDate('')
    setNewHolidayLabel('')
  }

  const removeHoliday = (date: string) => {
    save({ ...settings, publicHolidays: settings.publicHolidays.filter((h) => h.date !== date) })
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
        {settings.publicHolidays.length === 0 ? (
          <p className="text-sm text-gray-400">No public holidays configured.</p>
        ) : (
          <ul className="space-y-2">
            {settings.publicHolidays.map((h) => (
              <li key={h.date} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-800">{h.label}</span>
                  <span className="ml-2 text-gray-500">{h.date}</span>
                </div>
                <button onClick={() => removeHoliday(h.date)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input type="date" className="input w-auto" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} />
          <input className="input" placeholder="Holiday name…" value={newHolidayLabel} onChange={(e) => setNewHolidayLabel(e.target.value)} />
          <button onClick={addHoliday} className="btn-primary">Add</button>
        </div>
      </section>
    </div>
  )
}
