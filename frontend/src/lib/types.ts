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

// ---- Payments (gym_management.payments.*) ----

export type TransactionType =
  | 'STK Push'
  | 'C2B Paybill'
  | 'B2C Refund'
  | 'Reversal'

export type Direction = 'Inbound' | 'Outbound'

export interface PaymentRow {
  name: string
  transaction_type: TransactionType
  direction: Direction
  status: MpesaStatus
  amount: number
  phone_number: string | null
  customer: string | null
  customer_name: string | null
  account_reference: string | null
  mpesa_receipt_number: string | null
  reconciled: 0 | 1
  at: string
}

export interface PaymentStreamResult {
  rows: PaymentRow[]
  total: number
  limit_start: number
  limit_page_length: number
}

export interface PaymentSummary {
  today_collected: number
  today_success_count: number
  today_pending_count: number
  today_failed_count: number
  mtd_collected: number
}

export interface MemberPayment {
  name: string
  transaction_type: TransactionType
  direction: Direction
  status: MpesaStatus
  amount: number
  account_reference: string | null
  mpesa_receipt_number: string | null
  at: string
}

export interface StkPushResult {
  ok: boolean
  sent: boolean
  transaction: string
  status: string
  reason?: string
}

// ---- Refunds (gym_management.refunds.*) ----

export type RefundStatus =
  | 'Draft'
  | 'Pending Manager'
  | 'Pending Owner'
  | 'Approved'
  | 'Rejected'
  | 'Refund Initiated'
  | 'Refunded'
  | 'Failed'

export interface RefundRow {
  name: string
  customer: string
  customer_name: string
  status: RefundStatus
  refund_reason: string
  source_type: string
  refund_method: string
  requested_refund_amount: number
  original_amount_paid: number
  requested_on: string | null
  branch: string | null
}

export interface RefundListResult {
  rows: RefundRow[]
  total: number
  limit_start: number
  limit_page_length: number
}

export interface RefundSummary {
  by_status: Record<string, number>
  awaiting_approval: number
  awaiting_payout: number
  refunded_total: number
  require_dual_control: 0 | 1
}

// ---- PT packages (gym_management.pt.*) ----

export type PtStatus =
  | 'Draft'
  | 'Active'
  | 'Completed'
  | 'Expired'
  | 'Cancelled'
  | 'Refunded'

export type PtSessionStatus =
  | 'Scheduled'
  | 'Completed'
  | 'No-Show'
  | 'Cancelled'
  | 'Rescheduled'

export interface PtPackageRow {
  name: string
  customer: string
  customer_name: string
  trainer: string | null
  trainer_name: string | null
  branch: string | null
  status: PtStatus
  start_date: string | null
  expiry_date: string | null
  price: number
  sessions_purchased: number
  sessions_used: number
  sessions_remaining: number
  payment_status: PaymentStatus | null
}

export interface PtPackageListResult {
  rows: PtPackageRow[]
  total: number
  limit_start: number
  limit_page_length: number
}

export interface PtSession {
  name: string
  scheduled_at: string | null
  status: PtSessionStatus
  room: string | null
  workout_focus: string | null
  rating: number | null
}

export interface PtPackageDetail {
  package: PtPackageRow & { goals: string | null }
  sessions: PtSession[]
}

export interface PtFormOptions {
  trainers: { value: string; label: string }[]
  plans: { name: string; price: number; sessions: number }[]
}

// ---- Equipment maintenance (gym_management.equipment.*) ----

export type TicketStatus =
  | 'Open'
  | 'Acknowledged'
  | 'In Progress'
  | 'Awaiting Parts'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled'

export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical'

export interface TicketRow {
  name: string
  title: string
  asset: string | null
  branch: string | null
  priority: TicketPriority
  status: TicketStatus
  out_of_service: 0 | 1
  ticket_type: string | null
  assigned_to: string | null
  reported_at: string | null
  target_resolution_date: string | null
  cost: number
}

export interface TicketListResult {
  rows: TicketRow[]
  total: number
  limit_start: number
  limit_page_length: number
}

export interface TicketSummary {
  open: number
  out_of_service: number
  critical: number
}

export interface AssetOption {
  name: string
  asset_name: string
  location: string | null
}

// ---- Compliance + certifications (gym_management.compliance.*) ----

export type Severity = 'expired' | 'soon' | 'ok'

export interface ComplianceRow {
  name: string
  compliance_name: string
  authority: string | null
  category: string | null
  branch: string | null
  issued_on: string | null
  expires_on: string | null
  days_to_expiry: number | null
  severity: Severity
  reference_number: string | null
  cost: number
}

export interface ComplianceListResult {
  rows: ComplianceRow[]
  total: number
}

export interface CertRow {
  name: string
  employee: string
  employee_name: string
  certification_name: string
  issuing_body: string | null
  certification_number: string | null
  issued_on: string | null
  expires_on: string | null
  days_to_expiry: number | null
  severity: Severity
  verified_by_hr: 0 | 1
}

export interface ComplianceSummary {
  compliance_soon: number
  compliance_expired: number
  cert_soon: number
  cert_expired: number
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
