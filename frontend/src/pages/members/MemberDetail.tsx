import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CreditCard,
  Dumbbell,
  type LucideIcon,
  MessageSquare,
  Pencil,
  Smile,
  Wallet,
} from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, type TabDef } from '@/components/ui/tabs'
import { dateTime, fullDate, ksh, monthYear, relativeDay } from '@/lib/format'
import { bookingVariant, paymentVariant, subscriptionVariant } from '@/lib/status'
import { type ActivityType } from '@/lib/types'
import {
  useMemberActivity,
  useMemberClasses,
  useMemberOverview,
  useMemberSubscriptions,
} from '@/queries/members'
import { useMemberPayments } from '@/queries/payments'
import {
  useCoachingNotes,
  useDietPlans,
  useTrainingPlans,
} from '@/queries/coaching'
import { EditMemberDrawer } from './EditMemberDrawer'
import { SubscribeButton, SubscriptionLifecycle } from './SubscriptionActions'

// Charts (Recharts) load only when the Analytics tab is opened, keeping them
// out of the main bundle.
const MemberAnalyticsTab = lazy(() => import('./MemberAnalyticsTab'))

const TABS: TabDef[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'classes', label: 'Classes' },
  { value: 'payments', label: 'Payments' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'notes', label: 'Notes' },
]

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const [editOpen, setEditOpen] = useState(false)

  const { data, isLoading, isError, error, refetch } = useMemberOverview(id)

  function setTab(value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'overview') next.delete('tab')
        else next.set('tab', value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div>
      <Link
        to="/members"
        className="inline-flex items-center gap-1.5 text-small text-neutral-500 hover:text-neutral-900 transition-colors mb-4"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        Members
      </Link>

      {isError ? (
        <Card>
          <EmptyState
            title="Couldn't load this member"
            description={error instanceof Error ? error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : isLoading || !data ? (
        <HeaderSkeleton />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <Avatar name={data.full_name} src={data.profile_photo} size="size-14" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-h2 font-semibold tracking-tight text-neutral-900">
                  {data.full_name}
                </h1>
                {data.subscription && (
                  <Badge variant={subscriptionVariant(data.subscription.status)}>
                    {data.subscription.status}
                  </Badge>
                )}
              </div>
              <p className="text-small text-neutral-500 mt-0.5">
                {data.subscription?.membership_plan ?? 'No active plan'}
                {' · '}
                <span className="font-mono">{data.member}</span>
              </p>
              <p className="text-small text-neutral-500 mt-0.5">
                {[data.phone, data.email].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="text-tiny text-neutral-400 mt-0.5">
                Member since {monthYear(data.joined_on)}
                {data.branch ? ` · ${data.branch}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" strokeWidth={2} />
                Edit
              </Button>
              <Button onClick={() => navigate('/payments')}>
                <Wallet className="size-4" strokeWidth={2} />
                Record Payment
              </Button>
            </div>
          </div>

          <Tabs tabs={TABS} value={tab} onValueChange={setTab} className="mb-6" />

          {tab === 'overview' ? (
            <OverviewTab member={id!} overview={data} />
          ) : tab === 'analytics' ? (
            <Suspense fallback={<TabLoading />}>
              <MemberAnalyticsTab member={id!} />
            </Suspense>
          ) : tab === 'subscriptions' ? (
            <SubscriptionsTab member={id!} />
          ) : tab === 'classes' ? (
            <ClassesTab member={id!} />
          ) : tab === 'payments' ? (
            <PaymentsTab member={id!} />
          ) : tab === 'coaching' ? (
            <CoachingTab member={id!} />
          ) : (
            <TabComingSoon tab={tab} />
          )}

          {editOpen && (
            <EditMemberDrawer member={data} onClose={() => setEditOpen(false)} />
          )}
        </>
      )}
    </div>
  )
}

function OverviewTab({
  member,
  overview,
}: {
  member: string
  overview: NonNullable<ReturnType<typeof useMemberOverview>['data']>
}) {
  const sub = overview.subscription
  const g = overview.at_a_glance

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Current subscription */}
        <Card>
          <CardHeader>
            <CardTitle>Current Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            {sub ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-h3 font-semibold text-neutral-900">
                    {sub.membership_plan}
                  </span>
                  <Badge variant={subscriptionVariant(sub.status)}>
                    {sub.status}
                  </Badge>
                </div>
                <p className="text-small text-neutral-500 mt-1">
                  {sub.end_date ? `Ends ${fullDate(sub.end_date)}` : 'No end date'}
                  {sub.auto_renew ? ' · auto-renew' : ''}
                </p>
                <p className="text-body text-neutral-900 tabular-nums mt-2">
                  {ksh(sub.price)}
                </p>
                <div className="mt-4">
                  <SubscriptionLifecycle
                    subscription={sub.name}
                    status={sub.status}
                    member={member}
                  />
                </div>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-small text-neutral-500 mb-3">
                  No subscription on file.
                </p>
                <SubscribeButton member={member} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* At a glance */}
        <Card>
          <CardHeader>
            <CardTitle>At a Glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Stat label="Total visits" value={String(g.total_visits)} />
            <Stat label="This month" value={String(g.visits_this_month)} />
            <Stat label="Last visit" value={dateTime(g.last_visit)} />
            <Stat
              label="Avg / week"
              value={g.avg_per_week != null ? String(g.avg_per_week) : '—'}
            />
            <Stat label="Lifetime spend" value={ksh(g.lifetime_spend)} />
          </CardContent>
        </Card>
      </div>

      <ActivityCard member={member} />
    </div>
  )
}

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  visit: Dumbbell,
  payment: CreditCard,
  booking: CalendarClock,
  survey: Smile,
  pt: Dumbbell,
  subscription: Wallet,
}

function ActivityCard({ member }: { member: string }) {
  const { data, isLoading } = useMemberActivity(member)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Check-ins, payments, bookings and surveys will show up here."
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((item, i) => {
              const Icon = ACTIVITY_ICON[item.type] ?? CalendarClock
              return (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 shrink-0">
                    <Icon className="size-3.5" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-small text-neutral-800">
                    {item.title}
                  </span>
                  <span className="text-tiny text-neutral-400 tabular-nums whitespace-nowrap">
                    {dateTime(item.at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-small text-neutral-500">{label}</span>
      <span className="text-small font-medium text-neutral-900 tabular-nums">
        {value}
      </span>
    </div>
  )
}

function PaymentsTab({ member }: { member: string }) {
  const { data, isLoading } = useMemberPayments(member)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        {data && data.length > 0 && (
          <span className="text-small text-neutral-500">
            {data.length} transaction{data.length === 1 ? '' : 's'}
          </span>
        )}
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments yet"
            description="M-Pesa transactions for this member will appear here."
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((p) => (
              <li key={p.name} className="flex items-center gap-4 px-5 py-3">
                <Badge variant={paymentVariant(p.status)}>{p.status}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-small text-neutral-900">
                    {p.transaction_type}
                    <span className="text-tiny text-neutral-400 ml-1.5">
                      {p.direction === 'Outbound' ? '↑ out' : '↓ in'}
                    </span>
                  </div>
                  <div className="text-tiny text-neutral-400 font-mono">
                    {p.mpesa_receipt_number ?? p.account_reference ?? '—'}
                  </div>
                </div>
                <span className="text-tiny text-neutral-400 tabular-nums whitespace-nowrap">
                  {dateTime(p.at)}
                </span>
                <span className="text-small font-medium tabular-nums text-neutral-900">
                  {ksh(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SubscriptionsTab({ member }: { member: string }) {
  const { data, isLoading } = useMemberSubscriptions(member)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriptions</CardTitle>
        <SubscribeButton member={member} />
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No subscriptions"
            description="Start this member on a membership plan."
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((s) => {
              const live = s.status === 'Active' || s.status === 'Frozen'
              return (
                <li key={s.name} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-body font-medium text-neutral-900">
                          {s.membership_plan}
                        </span>
                        <Badge variant={subscriptionVariant(s.status)}>
                          {s.status}
                        </Badge>
                      </div>
                      <div className="text-tiny text-neutral-500 mt-0.5">
                        {fullDate(s.start_date)} – {fullDate(s.end_date)} ·{' '}
                        <span className="tabular-nums">{ksh(s.price)}</span>
                        {s.auto_renew ? ' · auto-renew' : ''}
                      </div>
                    </div>
                    {live && (
                      <SubscriptionLifecycle
                        subscription={s.name}
                        status={s.status}
                        member={member}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ClassesTab({ member }: { member: string }) {
  const { data, isLoading } = useMemberClasses(member)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class Bookings</CardTitle>
        {data && data.length > 0 && (
          <span className="text-small text-neutral-500">{data.length}</span>
        )}
      </CardHeader>
      <CardContent className="px-0 py-0">
        {isLoading ? (
          <div className="px-5 py-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No class bookings"
            description="Bookings show up here once this member books a class."
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-small text-neutral-900">
                    {c.class_type ?? 'Class'}
                  </div>
                  <div className="text-tiny text-neutral-400">
                    {c.start_time ? dateTime(c.start_time) : relativeDay(c.booked_at)}
                  </div>
                </div>
                <Badge variant={bookingVariant(c.status)}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CoachingTab({ member }: { member: string }) {
  const diet = useDietPlans(member)
  const training = useTrainingPlans(member)
  const notes = useCoachingNotes(member)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Diet Plans</CardTitle>
            <Link to="/coaching/diet/new" className="text-small text-brand-600 hover:text-brand-700">New</Link>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {diet.isLoading ? (
              <div className="px-5 py-4"><Skeleton className="h-8 w-full" /></div>
            ) : !diet.data || diet.data.length === 0 ? (
              <EmptyState title="No diet plans" />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {diet.data.map((p) => (
                  <li key={p.name}>
                    <Link to={`/coaching/diet/${encodeURIComponent(p.name)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
                      <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{p.plan_name}</span>
                      <Badge variant={subscriptionVariant(p.status)}>{p.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Training Plans</CardTitle>
            <Link to="/coaching/training/new" className="text-small text-brand-600 hover:text-brand-700">New</Link>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {training.isLoading ? (
              <div className="px-5 py-4"><Skeleton className="h-8 w-full" /></div>
            ) : !training.data || training.data.length === 0 ? (
              <EmptyState title="No training plans" />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {training.data.map((p) => (
                  <li key={p.name}>
                    <Link to={`/coaching/training/${encodeURIComponent(p.name)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors">
                      <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">{p.plan_name}</span>
                      <span className="text-tiny text-neutral-400">{p.goal}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Coaching Notes</CardTitle></CardHeader>
        <CardContent className="px-0 py-0">
          {notes.isLoading ? (
            <div className="px-5 py-4 space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          ) : !notes.data || notes.data.length === 0 ? (
            <EmptyState title="No notes yet" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {notes.data.map((n) => (
                <li key={n.name} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{n.category}</Badge>
                    <span className="text-tiny text-neutral-400 ml-auto">{dateTime(n.note_date)}</span>
                  </div>
                  <p className="text-small text-neutral-700 mt-1">{n.note_text}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const TAB_ICON: Record<string, LucideIcon> = {
  analytics: BarChart3,
  subscriptions: Wallet,
  classes: CalendarClock,
  payments: CreditCard,
  coaching: MessageSquare,
  notes: MessageSquare,
}

function TabLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-lg" />
    </div>
  )
}

function TabComingSoon({ tab }: { tab: string }) {
  const Icon = TAB_ICON[tab] ?? CalendarClock
  const label = TABS.find((t) => t.value === tab)?.label ?? tab
  return (
    <Card>
      <EmptyState
        icon={Icon}
        title={`${label} — coming soon`}
        description="This tab lands as the corresponding module is built out."
      />
    </Card>
  )
}

function HeaderSkeleton() {
  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-md mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </div>
  )
}
