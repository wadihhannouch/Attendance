export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export interface Resource {
  id: string;
  name: string;
  email: string;
  role: string;
  projectIds: string[];
  annualLeaveBalance: number;
  createdAt: string;
}

export type LeaveType = 'annual' | 'sick' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface HandoverItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Leave {
  id: string;
  resourceId: string;
  type: LeaveType;
  otherLabel?: string;
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string;   // ISO date string YYYY-MM-DD
  status: LeaveStatus;
  deputyId?: string;
  notes: string;
  handoverItems: HandoverItem[];
  createdAt: string;
}

export interface PublicHoliday {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
  date?: string; // legacy single-day support
}

export interface BusinessRequirement {
  id: string;
  reference: string;
  title: string;
  color: string;
  projectIds: string[];
  sprintId: string | null;
  createdAt: string;
}

export interface BRTrackerEntry {
  id: string;
  brId: string;
  resourceId: string;
  timelineDays: number;
  executionOrder: number;
  createdAt: string;
}

export interface Sprint {
  id: string;
  title: string;
  projectId: string;
  startDate: string;
  testingDate: string;
  pilotDate: string;
  productionDate: string;
  createdAt: string;
}

export interface Settings {
  leaveTypes: string[];
  defaultAnnualQuota: number;
  publicHolidays: PublicHoliday[];
}
