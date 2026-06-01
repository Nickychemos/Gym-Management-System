import { useState } from 'react'
import { Check, Search, UserX, X } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { bookingVariant } from '@/lib/status'
import { useDebounce } from '@/hooks/useDebounce'
import { useMembers } from '@/queries/members'
import {
  useBookClass,
  useCancelBooking,
  useCheckIn,
  useNoShow,
  useSessionDetail,
} from '@/queries/schedule'

interface Props {
  session: string | null
  onClose: () => void
}

export function BookingModal({ session, onClose }: Props) {
  const { data, isLoading } = useSessionDetail(session ?? undefined)
  const s = data?.session

  return (
    <Dialog
      open={!!session}
      onClose={onClose}
      widthClassName="max-w-xl"
      title={s ? s.class_type : 'Class'}
      description={
        s
          ? `${dateTime(s.start_time)}${s.trainer_name ? ` · ${s.trainer_name}` : ''}${s.room ? ` · ${s.room}` : ''}`
          : undefined
      }
    >
      {isLoading || !data || !s ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Capacity summary */}
          <div className="flex items-center gap-4 text-small">
            <CapacityPill
              booked={s.bookings_count}
              capacity={s.capacity}
              waitlist={s.waitlist_count}
            />
            <span className="text-neutral-500">
              {s.spots_remaining > 0
                ? `${s.spots_remaining} spot${s.spots_remaining === 1 ? '' : 's'} left`
                : 'Full — new bookings will waitlist'}
            </span>
          </div>

          {/* Roster */}
          <div>
            <h3 className="text-tiny font-medium uppercase tracking-wide text-neutral-400 mb-2">
              Roster ({data.bookings.length})
            </h3>
            {data.bookings.length === 0 ? (
              <p className="text-small text-neutral-500 py-2">
                No bookings yet.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
                {data.bookings.map((b) => (
                  <RosterRow key={b.name} booking={b} session={session!} />
                ))}
              </ul>
            )}
          </div>

          {/* Add booking */}
          <AddBooking session={session!} full={s.spots_remaining <= 0} />
        </div>
      )}
    </Dialog>
  )
}

function CapacityPill({
  booked,
  capacity,
  waitlist,
}: {
  booked: number
  capacity: number
  waitlist: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-neutral-900">
      {booked}/{capacity}
      {waitlist > 0 && (
        <Badge variant="warning">{waitlist} waitlisted</Badge>
      )}
    </span>
  )
}

function RosterRow({
  booking,
  session,
}: {
  booking: import('@/lib/types').SessionBooking
  session: string
}) {
  const { toast } = useToast()
  const checkIn = useCheckIn(session)
  const noShow = useNoShow(session)
  const cancel = useCancelBooking(session)

  const onErr = (err: unknown) =>
    toast({
      variant: 'error',
      title: 'Action failed',
      description: err instanceof ApiError ? err.message : undefined,
    })

  const busy = checkIn.isPending || noShow.isPending || cancel.isPending

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Avatar name={booking.customer_name} size="size-7" />
      <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">
        {booking.customer_name}
        {booking.waitlist_position ? (
          <span className="text-neutral-400"> · #{booking.waitlist_position}</span>
        ) : null}
      </span>
      <Badge variant={bookingVariant(booking.status)}>{booking.status}</Badge>
      {booking.status === 'Booked' && (
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label="Check in"
            onClick={() =>
              checkIn.mutate(booking.name, {
                onSuccess: () =>
                  toast({ variant: 'success', title: 'Checked in' }),
                onError: onErr,
              })
            }
          >
            <Check className="size-3.5" strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label="No-show"
            onClick={() =>
              noShow.mutate(booking.name, {
                onSuccess: () => toast({ title: 'Marked no-show' }),
                onError: onErr,
              })
            }
          >
            <UserX className="size-3.5" strokeWidth={2} />
          </Button>
        </>
      )}
      {booking.status !== 'Checked-In' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label="Cancel booking"
          onClick={() =>
            cancel.mutate(
              { booking: booking.name },
              {
                onSuccess: () => toast({ title: 'Booking cancelled' }),
                onError: onErr,
              },
            )
          }
        >
          <X className="size-3.5" strokeWidth={2} />
        </Button>
      )}
    </li>
  )
}

function AddBooking({ session, full }: { session: string; full: boolean }) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [dropIn, setDropIn] = useState(false)
  const debounced = useDebounce(search, 250)
  const book = useBookClass(session)

  const { data } = useMembers({
    search: debounced || undefined,
    pageLength: 6,
  })
  const results = debounced ? (data?.rows ?? []) : []

  function bookMember(customer: string | null, name: string) {
    if (!customer) return
    book.mutate(
      { customer, payment_required: dropIn },
      {
        onSuccess: (res) => {
          toast({
            variant: 'success',
            title: res.status === 'Waitlisted' ? 'Added to waitlist' : 'Booked',
            description: name,
          })
          setSearch('')
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not book',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <div className="border-t border-neutral-100 pt-4">
      <h3 className="text-tiny font-medium uppercase tracking-wide text-neutral-400 mb-2">
        Book a member {full && '(waitlist)'}
      </h3>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
          strokeWidth={2}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members by name, phone or ID…"
          className="pl-9"
        />
      </div>

      {results.length > 0 && (
        <ul className="mt-2 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-52 overflow-y-auto">
          {results.map((m) => (
            <li key={m.member}>
              <button
                type="button"
                disabled={book.isPending}
                onClick={() => bookMember(m.customer, m.full_name)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                <Avatar name={m.full_name} size="size-7" />
                <span className="flex-1 min-w-0">
                  <span className="block text-small text-neutral-900 truncate">
                    {m.full_name}
                  </span>
                  <span className="block text-tiny text-neutral-500 font-mono">
                    {m.member}
                  </span>
                </span>
                {m.sub_status === 'Active' ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="neutral">No sub</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-3 flex items-center gap-2 text-small text-neutral-600">
        <Checkbox
          checked={dropIn}
          onChange={(e) => setDropIn(e.target.checked)}
        />
        Drop-in payment (no subscription required)
      </label>
    </div>
  )
}
