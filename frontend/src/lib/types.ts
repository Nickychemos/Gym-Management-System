/**
 * Shared types. Hand-written for now (per the plan: start hand-written, add a
 * DocType-JSON generator at ~week 6 if drift becomes painful). Shapes here
 * mirror the backend whitelisted endpoints in gym_management/dashboard.py and
 * gym_management/members.py — keep them in sync with those return dicts.
 */

// ---- Status enums (mirror the DocType Select options) ----

export type SubscriptionStatus =
  | 'Draft'
  | 'Active'
  | 'Frozen'
  | 'Lapsed'
  | 'Cancelled'
  | 'Expired'

export type MemberStatus = 'Active' | 'Inactive' | 'Anonymised' | 'Deceased'

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Refunded'

export type MpesaStatus =
  | 'Pending'
  | 'Success'
  | 'Failed'
  | 'Timeout'
  | 'Reversed'

// ---- Dashboard (gym_management.dashboard.summary) ----

export interface DashboardKpis {
  active_members: number
  new_this_month: number
  renewals_due: number
  todays_revenue: number
  todays_payment_count: number
  mtd_revenue: number
}

export interface DashboardClass {
  name: string
  class_type: string
  trainer: string | null
  start_time: string
  booked: number
  capacity: number
  status: string
}

export interface DashboardPayment {
  name: string
  customer: string | null
  customer_name: string | null
  amount: number
  status: MpesaStatus
  at: string
}

export interface DashboardAlert {
  kind: 'danger' | 'warning' | 'info'
  text: string
  link: string
  ref: string
}

export interface NpsResult {
  survey: string
  window_days: number
  total_responses: number
  promoters: number
  passives: number
  detractors: number
  nps_score: number | null
}

export interface DashboardSummary {
  as_of: string
  branch: string | null
  kpis: DashboardKpis
  todays_classes: DashboardClass[]
  recent_payments: DashboardPayment[]
  alerts: DashboardAlert[]
  nps: NpsResult | null
}

// ---- Members (gym_management.members.*) ----

export interface MemberRow {
  member: string
  customer: string | null
  full_name: string
  phone: string | null
  email: string | null
  branch: string | null
  profile_photo: string | null
  member_status: MemberStatus | null
  last_visit: string | null
  total_visits: number
  plan: string | null
  sub_status: SubscriptionStatus | null
  end_date: string | null
  balance: number
}

export interface MemberListResult {
  rows: MemberRow[]
  total: number
  limit_start: number
  limit_page_length: number
}

export interface MemberSubscriptionSummary {
  name: string
  membership_plan: string
  status: SubscriptionStatus
  start_date: string | null
  end_date: string | null
  price: number
  auto_renew: 0 | 1
  next_renewal_date: string | null
  payment_status: PaymentStatus
}

export interface MemberAtAGlance {
  total_visits: number
  visits_this_month: number
  last_visit: string | null
  avg_per_week: number | null
  lifetime_spend: number
}

export interface MemberOverview {
  member: string
  customer: string
  full_name: string
  phone: string | null
  email: string | null
  profile_photo: string | null
  branch: string | null
  member_status: MemberStatus | null
  joined_on: string | null
  gender: string | null
  date_of_birth: string | null
  subscription: MemberSubscriptionSummary | null
  at_a_glance: MemberAtAGlance
}

export type ActivityType =
  | 'visit'
  | 'payment'
  | 'booking'
  | 'survey'
  | 'pt'
  | 'subscription'

export interface ActivityItem {
  type: ActivityType
  title: string
  at: string
  ref_doctype: string
  ref_name: string
}

// ---- Schedule + bookings (gym_management.schedule.*) ----

export type SessionStatus =
  | 'Scheduled'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled'

export type BookingStatus =
  | 'Booked'
  | 'Waitlisted'
  | 'Checked-In'
  | 'Cancelled'
  | 'No-Show'

export interface ScheduleSession {
  name: string
  class_type: string
  color: string
  trainer: string | null
  start_time: string
  time_label: string
  day_index: number
  booked: number
  capacity: number
  waitlist: number
  spots_remaining: number
  status: SessionStatus
}

export interface ScheduleDay {
  date: string
  label: string
  weekday: number
}

export interface WeekSchedule {
  week_start: string
  week_end: string
  days: ScheduleDay[]
  sessions: ScheduleSession[]
}

export interface SessionInfo {
  name: string
  class_type: string
  trainer: string | null
  trainer_name?: string
  branch: string | null
  room: string | null
  start_time: string
  end_time: string | null
  capacity: number
  bookings_count: number
  waitlist_count: number
  spots_remaining: number
  status: SessionStatus
}

export interface SessionBooking {
  name: string
  customer: string
  customer_name: string
  status: BookingStatus
  waitlist_position: number | null
  check_in_time: string | null
  payment_required: 0 | 1
}

export interface SessionDetail {
  session: SessionInfo
  bookings: SessionBooking[]
}

// ---- Class catalog (Class Type DocType, via REST) ----

export interface ClassType {
  name: string
  class_type_name: string
  short_code: string | null
  default_duration_minutes: number
  default_capacity: number
  is_active: 0 | 1
  display_color: string | null
  intensity_level: string | null
  description: string | null
  equipment_required: string | null
}
