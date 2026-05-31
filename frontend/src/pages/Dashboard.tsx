import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KPI {
  label: string
  value: string
  delta?: { value: string; direction: 'up' | 'down' | 'flat' }
  hint?: string
}

const kpis: KPI[] = [
  { label: 'Active Members', value: '1,247', delta: { value: '+2.3%', direction: 'up' } },
  { label: 'New This Month', value: '86', delta: { value: '+11%', direction: 'up' } },
  { label: 'Renewals Due', value: '31', hint: 'Next 7 days' },
  { label: "Today's Revenue", value: 'KSh 142k', hint: '19 paid' },
  { label: 'MTD Revenue', value: 'KSh 3.8M', delta: { value: '-3%', direction: 'down' } },
]

const todaysClasses = [
  { time: '06:00', name: 'Spin', trainer: 'Sarah K.', booked: 14, capacity: 20 },
  { time: '07:00', name: 'HIIT', trainer: 'Sarah K.', booked: 6, capacity: 15 },
  { time: '18:00', name: 'Yoga', trainer: 'Mary W.', booked: 11, capacity: 12 },
  { time: '19:00', name: 'CrossFit', trainer: 'James A.', booked: 4, capacity: 20 },
]

const payments = [
  { time: '08:14', name: 'Jane M.', amount: 'KSh 6,000', status: 'success' as const },
  { time: '08:11', name: 'John A.', amount: 'KSh 6,000', status: 'success' as const },
  { time: '08:09', name: 'Mike R.', amount: 'KSh 3,500', status: 'pending' as const },
  { time: '08:02', name: 'Lucy K.', amount: 'KSh 6,000', status: 'success' as const },
]

const alerts = [
  { kind: 'warning' as const, text: 'Treadmill #4 service overdue by 2 days' },
  { kind: 'warning' as const, text: 'KRA monthly filing due May 20 (in 7 days)' },
  { kind: 'info' as const, text: '3 trainer certifications expire in <30 days' },
]

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">
          Dashboard
        </h1>
        <p className="text-body text-neutral-500">
          Today, {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="hover:shadow-[var(--shadow-card-hover)] transition-shadow">
            <CardContent className="py-4">
              <div className="text-small text-neutral-500 mb-1">{kpi.label}</div>
              <div className="text-h2 font-semibold tabular-nums text-neutral-900">
                {kpi.value}
              </div>
              {kpi.delta ? (
                <div
                  className={cn(
                    'mt-1 inline-flex items-center gap-0.5 text-tiny font-medium',
                    kpi.delta.direction === 'up' && 'text-success-700',
                    kpi.delta.direction === 'down' && 'text-danger-700',
                    kpi.delta.direction === 'flat' && 'text-neutral-500',
                  )}
                >
                  {kpi.delta.direction === 'up' ? (
                    <ArrowUpRight className="size-3" strokeWidth={2.5} />
                  ) : kpi.delta.direction === 'down' ? (
                    <ArrowDownRight className="size-3" strokeWidth={2.5} />
                  ) : null}
                  {kpi.delta.value}
                </div>
              ) : (
                <div className="mt-1 text-tiny text-neutral-400">{kpi.hint ?? '—'}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two-column: classes + payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle>Today's Classes</CardTitle>
            <span className="text-small text-neutral-500">{todaysClasses.length} scheduled</span>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-neutral-100">
              {todaysClasses.map((c) => {
                const pct = (c.booked / c.capacity) * 100
                return (
                  <li key={c.time} className="px-5 py-3 flex items-center gap-4 hover:bg-neutral-50 transition-colors">
                    <span className="font-mono text-small tabular-nums text-neutral-600 w-12">
                      {c.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-medium text-neutral-900">{c.name}</div>
                      <div className="text-tiny text-neutral-500">{c.trainer}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-small tabular-nums text-neutral-700">
                        {c.booked}/{c.capacity}
                      </div>
                      <div className="mt-1 h-1 w-16 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-all',
                            pct >= 100 ? 'bg-danger-500' : pct >= 75 ? 'bg-warning-500' : 'bg-brand-500',
                          )}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <span className="text-small text-neutral-500">Live</span>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-neutral-100">
              {payments.map((p, i) => (
                <li key={i} className="px-5 py-3 flex items-center gap-4 hover:bg-neutral-50 transition-colors">
                  <span
                    className={cn(
                      'size-2 rounded-full shrink-0',
                      p.status === 'success' ? 'bg-success-500' : 'bg-warning-500',
                    )}
                  />
                  <span className="font-mono text-small tabular-nums text-neutral-500 w-14">{p.time}</span>
                  <span className="flex-1 text-body text-neutral-900">{p.name}</span>
                  <span className="font-mono text-small tabular-nums text-neutral-900">{p.amount}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Alerts + NPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            <Badge variant="warning">{alerts.length} active</Badge>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-neutral-100">
              {alerts.map((a, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-1.5 size-2 rounded-full shrink-0',
                      a.kind === 'warning' ? 'bg-warning-500' : 'bg-info-500',
                    )}
                  />
                  <span className="text-small text-neutral-700">{a.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Promoter Score</CardTitle>
            <span className="text-small text-neutral-500">Rolling 30 days</span>
          </CardHeader>
          <CardContent className="text-center py-8">
            <div className="text-display font-semibold tabular-nums text-neutral-900">
              42
            </div>
            <div className="mt-1 inline-flex items-center gap-1 text-tiny font-medium text-success-700">
              <ArrowUpRight className="size-3" strokeWidth={2.5} />
              +6 vs prior period
            </div>
            <div className="mt-4 text-small text-neutral-500">
              23 Promoters · 12 Passives · 7 Detractors
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
