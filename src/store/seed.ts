import { projectsStorage, resourcesStorage, leavesStorage, settingsStorage } from './storage';

const SEEDED_KEY = 'att_seeded';

export function seedIfEmpty(): void {
  if (localStorage.getItem(SEEDED_KEY)) return;

  // Projects
  const p1 = projectsStorage.create({ name: 'Weyay', description: 'DVO banking group', color: '#3B82F6' });
  const p2 = projectsStorage.create({ name: 'CBG', description: 'NBK banking group', color: '#10B981' });
  const p3 = projectsStorage.create({ name: 'IBG', description: 'International banking group', color: '#F59E0B' });
  projectsStorage.create({ name: 'Chapter', description: 'Chapter cosmetics', color: '#d47217' });

  // Resources
  const r1 = resourcesStorage.create({ name: 'Mohammed', email: 'wadih@example.com', role: 'Project Manager', projectIds: [p1.id, p2.id], annualLeaveBalance: 21 });
  const r2 = resourcesStorage.create({ name: 'Mahmoud', email: 'sara@example.com', role: 'Senior Developer', projectIds: [p1.id], annualLeaveBalance: 18 });
  const r3 = resourcesStorage.create({ name: 'Khaled', email: 'omar@example.com', role: 'Business Analyst', projectIds: [p2.id, p3.id], annualLeaveBalance: 21 });
  const r4 = resourcesStorage.create({ name: 'Fahad', email: 'lina@example.com', role: 'QA Engineer', projectIds: [p1.id, p3.id], annualLeaveBalance: 15 });
  const r5 = resourcesStorage.create({ name: 'Ahmad Nasser', email: 'ahmad@example.com', role: 'Developer', projectIds: [p2.id], annualLeaveBalance: 21 });

  // Leaves (relative to today)
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  leavesStorage.create({ resourceId: r2.id, type: 'annual', startDate: fmt(today), endDate: fmt(addDays(today, 2)), status: 'approved', deputyId: r1.id, notes: 'Family trip' });
  leavesStorage.create({ resourceId: r3.id, type: 'sick', startDate: fmt(today), endDate: fmt(today), status: 'approved', deputyId: r5.id, notes: '' });
  leavesStorage.create({ resourceId: r4.id, type: 'annual', startDate: fmt(addDays(today, 5)), endDate: fmt(addDays(today, 9)), status: 'pending', notes: 'Vacation' });
  leavesStorage.create({ resourceId: r5.id, type: 'annual', startDate: fmt(addDays(today, -10)), endDate: fmt(addDays(today, -7)), status: 'approved', deputyId: r2.id, notes: '' });

  // Settings
  settingsStorage.save({ leaveTypes: ['Annual', 'Sick', 'Emergency', 'Other'], defaultAnnualQuota: 21, publicHolidays: [{ date: fmt(addDays(today, 14)), label: 'Public Holiday' }] });

  localStorage.setItem(SEEDED_KEY, '1');
}
