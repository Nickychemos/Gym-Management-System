import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  CreditCard,
  Dumbbell,
  type LucideIcon,
  MessageSquare,
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
import { dateTime, fullDate, ksh, monthYear } from '@/lib/format'
import { subscriptionVariant } from '@/lib/status'
import { type ActivityType } from '@/lib/types'
import { useMemberActivity, useMemberOverview } from '@/queries/members'

const TABS: TabDef[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'classes', label: 'Classes' },
  { value: 'payments', label: 'Payments' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'notes', label: 'Notes' },
]

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'

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
            <Button variant="secondary">
              <Wallet className="size-4" strokeWidth={2} />
              Record Payment
            </Button>
          </div>

          <Tabs tabs={TABS} value={tab} onValueChange={setTab} className="mb-6" />

          {tab === 'overview' ? (
            <OverviewTab member={id!} overview={data} />
          ) : (
            <TabComingSoon tab={tab} />
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
                <div className="flex gap-2 mt-4">
                  <Button variant="secondary" size="sm" disabled>
                    Freeze
                  </Button>
                  <Button variant="secondary" size="sm" disabled>
                    Renew
                  </Button>
                  <Button variant="secondary" size="sm" disabled>
                    Upgrade
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-small text-neutral-500 py-2">
                No subscription on file.
              </p>
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

const TAB_ICON: Record<string, LucideIcon> = {
  subscriptions: Wallet,
  classes: CalendarClock,
  payments: CreditCard,
  coaching: MessageSquare,
  notes: MessageSquare,
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
