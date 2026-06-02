import { type BadgeProps } from '@/components/ui/badge'

type Variant = NonNullable<BadgeProps['variant']>

/** Subscription status → badge variant. Active is the calm "good" state. */
export function subscriptionVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Frozen':
      return 'info'
    case 'Draft':
      return 'neutral'
    case 'Lapsed':
    case 'Expired':
      return 'warning'
    case 'Cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Class booking status → badge variant. */
export function bookingVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Checked-In':
      return 'success'
    case 'Booked':
      return 'brand'
    case 'Waitlisted':
      return 'warning'
    case 'No-Show':
      return 'danger'
    case 'Cancelled':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** Refund Request workflow status → badge variant. */
export function refundVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Refunded':
      return 'success'
    case 'Pending Manager':
    case 'Pending Owner':
      return 'warning'
    case 'Approved':
    case 'Refund Initiated':
      return 'info'
    case 'Rejected':
    case 'Failed':
      return 'danger'
    case 'Draft':
    default:
      return 'neutral'
  }
}

/** PT Package status → badge variant. */
export function ptVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Completed':
      return 'info'
    case 'Expired':
      return 'warning'
    case 'Cancelled':
    case 'Refunded':
      return 'danger'
    case 'Draft':
    default:
      return 'neutral'
  }
}

/** PT Session status → badge variant. */
export function ptSessionVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Completed':
      return 'success'
    case 'Scheduled':
      return 'brand'
    case 'No-Show':
      return 'danger'
    case 'Rescheduled':
      return 'warning'
    case 'Cancelled':
    default:
      return 'neutral'
  }
}

/** Expiry severity (compliance / certs) → badge variant. */
export function severityVariant(severity: string | null | undefined): Variant {
  switch (severity) {
    case 'expired':
      return 'danger'
    case 'soon':
      return 'warning'
    case 'ok':
      return 'success'
    default:
      return 'neutral'
  }
}

/** Equipment operational status → badge variant. */
export function opStatusVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Operational':
      return 'success'
    case 'Maintenance Due':
      return 'warning'
    case 'Out of Service':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Maintenance ticket status → badge variant. */
export function ticketVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Resolved':
    case 'Closed':
      return 'success'
    case 'In Progress':
      return 'info'
    case 'Awaiting Parts':
      return 'warning'
    case 'Open':
    case 'Acknowledged':
      return 'brand'
    case 'Cancelled':
    default:
      return 'neutral'
  }
}

/** Ticket priority → badge variant. */
export function priorityVariant(priority: string | null | undefined): Variant {
  switch (priority) {
    case 'Critical':
      return 'danger'
    case 'High':
      return 'warning'
    case 'Medium':
      return 'info'
    case 'Low':
    default:
      return 'neutral'
  }
}

/** WhatsApp template status → badge variant. */
export function templateVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Pending':
      return 'warning'
    case 'Rejected':
    case 'Disabled':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Campaign status → badge variant. */
export function campaignVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Sent':
      return 'success'
    case 'Sending':
      return 'info'
    case 'Failed':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Referral status → badge variant. */
export function referralVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Reward Paid':
      return 'success'
    case 'Reward Earned':
    case 'First Payment':
      return 'info'
    case 'Signed Up':
      return 'brand'
    case 'Pending':
      return 'warning'
    default:
      return 'neutral'
  }
}

/** M-Pesa transaction status → badge variant. */
export function paymentVariant(status: string | null | undefined): Variant {
  switch (status) {
    case 'Success':
      return 'success'
    case 'Pending':
      return 'warning'
    case 'Failed':
    case 'Timeout':
    case 'Reversed':
      return 'danger'
    default:
      return 'neutral'
  }
}
