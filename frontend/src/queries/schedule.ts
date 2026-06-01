import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'
import {
  type ClassType,
  type SessionDetail,
  type WeekSchedule,
} from '@/lib/types'

const CB = 'gym_management.gym_management.doctype.class_booking.class_booking'

/** Weekly grid of sessions. weekStart is any date in the desired Mon–Sun week. */
export function useWeekSchedule(weekStart?: string, branch?: string) {
  return useQuery({
    queryKey: ['schedule', 'week', weekStart ?? 'current', branch ?? null],
    queryFn: () =>
      api.callMethodGet<WeekSchedule>('gym_management.schedule.week', {
        week_start: weekStart,
        branch,
      }),
    placeholderData: keepPreviousData,
  })
}

/** One session + its active bookings (drives the booking modal). */
export function useSessionDetail(session: string | undefined) {
  return useQuery({
    queryKey: ['schedule', 'session', session],
    queryFn: () =>
      api.callMethodGet<SessionDetail>(
        'gym_management.schedule.session_detail',
        { class_session: session },
      ),
    enabled: !!session,
  })
}

/** Invalidate the week grid + a specific session after a booking change. */
function useBookingInvalidation() {
  const qc = useQueryClient()
  return (session?: string) => {
    qc.invalidateQueries({ queryKey: ['schedule', 'week'] })
    if (session)
      qc.invalidateQueries({ queryKey: ['schedule', 'session', session] })
  }
}

export function useBookClass(session?: string) {
  const invalidate = useBookingInvalidation()
  return useMutation({
    mutationFn: (vars: { customer: string; payment_required?: boolean }) =>
      api.callMethod<{ ok: boolean; booking: string; status: string }>(
        'gym_management.schedule.book_class',
        {
          class_session: session,
          customer: vars.customer,
          payment_required: vars.payment_required ? 1 : 0,
        },
      ),
    onSuccess: () => invalidate(session),
  })
}

export function useCancelBooking(session?: string) {
  const invalidate = useBookingInvalidation()
  return useMutation({
    mutationFn: (vars: { booking: string; reason?: string }) =>
      api.callMethod('gym_management.schedule.cancel_booking', {
        class_booking: vars.booking,
        reason: vars.reason,
      }),
    onSuccess: () => invalidate(session),
  })
}

export function useCheckIn(session?: string) {
  const invalidate = useBookingInvalidation()
  return useMutation({
    mutationFn: (booking: string) =>
      api.callMethod(`${CB}.mark_checked_in`, { class_booking: booking }),
    onSuccess: () => invalidate(session),
  })
}

export function useNoShow(session?: string) {
  const invalidate = useBookingInvalidation()
  return useMutation({
    mutationFn: (booking: string) =>
      api.callMethod(`${CB}.mark_no_show`, { class_booking: booking }),
    onSuccess: () => invalidate(session),
  })
}

/** Class Type catalog, via the generic REST list endpoint. */
export function useClassTypes() {
  return useQuery({
    queryKey: ['class-types'],
    queryFn: () =>
      api.getList<ClassType>('Class Type', {
        fields: [
          'name',
          'class_type_name',
          'short_code',
          'default_duration_minutes',
          'default_capacity',
          'is_active',
          'display_color',
          'intensity_level',
          'description',
          'equipment_required',
        ],
        order_by: 'class_type_name asc',
        limit_page_length: 0,
      }),
  })
}
