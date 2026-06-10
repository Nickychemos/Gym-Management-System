import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { MiniBars, TrendChart } from '@/components/charts/ChartKit'
import { useBranch } from '@/context/BranchContext'
import { useToast } from '@/context/ToastContext'
import { dateTime, ksh } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  type ReportChart,
  type ReportEnvelope,
  type ReportKpi,
  type ReportTable,
  type ReportValueFormat,
} from '@/lib/types'
import { downloadReport, useReportList, useRunReport } from '@/queries/reports'

const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
]

function fmt(v: unknown, format: ReportValueFormat): string {
  if (v == null || v === '') return '—'
  switch (format) {
    case 'ksh':
      return ksh(Number(v))
    case 'percent':
      return `${v}%`
    case 'number':
      return Number(v).toLocaleString()
    case 'date':
      return dateTime(String(v))
    default:
      return String(v)
  }
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const report = params.get('report') ?? undefined

  function setParam(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-h2 font-semibold tracking-tight text-neutral-900">
          Reports
        </h1>
        <p className="text-small text-neutral-500 mt-0.5">
          Aggregated insight across every part of your gym.
        </p>
      </div>

      {report ? (
        <ReportViewer
          report={report}
          period={params.get('period') ?? 'this_month'}
          onPeriod={(p) => setParam('period', p)}
          onBack={() => {
            setParam('report', null)
            setParam('period', null)
          }}
        />
      ) : (
        <Catalogue onOpen={(key) => setParam('report', key)} />
      )}
    </div>
  )
}

function Catalogue({ onOpen }: { onOpen: (key: string) => void }) {
  const { data, isLoading } = useReportList()

  const grouped = useMemo(() => {
    const g: Record<string, typeof data> = {}
    for (const r of data ?? []) (g[r.category] ??= []).push(r)
    return g
  }, [data])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, reports]) => (
        <div key={category}>
          <h2 className="mb-2.5 text-tiny font-semibold uppercase tracking-wide text-neutral-400">
            {category}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(reports ?? []).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onOpen(r.key)}
                className="group flex flex-col rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-md bg-neutral-900 text-white">
                    <BarChart3 className="size-4" strokeWidth={2} />
                  </span>
                  <span className="text-body font-medium text-neutral-900">
                    {r.title}
                  </span>
                </div>
                <p className="mt-2 text-small text-neutral-500">{r.description}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ReportViewer({
  report,
  period,
  onPeriod,
  onBack,
}: {
  report: string
  period: string
  onPeriod: (p: string) => void
  onBack: () => void
}) {
  const { branchParam, selected, multiBranch } = useBranch()
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const { data, isLoading, isError, error } = useRunReport({
    report,
    period,
    branch: branchParam,
  })

  async function exportAs(format: 'pdf' | 'csv' | 'xlsx') {
    setBusy(format)
    try {
      await downloadReport({ report, format, period, branch: branchParam })
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Export failed',
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-small text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        All reports
      </button>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h3 font-semibold text-neutral-900">
            {data?.title ?? 'Report'}
          </h2>
          <p className="text-small text-neutral-500">
            {data ? data.period.label : '…'}
            {multiBranch ? ` · ${selected === '__all__' ? 'All branches' : selected}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Select value={period} onChange={(e) => onPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          {(['pdf', 'csv', 'xlsx'] as const).map((f) => (
            <Button
              key={f}
              variant="secondary"
              size="sm"
              disabled={!data || busy !== null}
              onClick={() => exportAs(f)}
            >
              <Download className="size-3.5" strokeWidth={2} />
              {busy === f ? '…' : f.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {isError ? (
        <Card>
          <EmptyState
            title="Couldn't run this report"
            description={error instanceof Error ? error.message : undefined}
          />
        </Card>
      ) : isLoading || !data ? (
        <ReportSkeleton />
      ) : (
        <ReportBody data={data} />
      )}
    </div>
  )
}

function ReportBody({ data }: { data: ReportEnvelope }) {
  return (
    <div className="space-y-5">
      {data.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {data.kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </div>
      )}
      {data.charts.map((c) => (
        <ChartCard key={c.key} chart={c} />
      ))}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.tables.map((t) => (
          <TableCard key={t.key} table={t} />
        ))}
      </div>
    </div>
  )
}

function KpiTile({ kpi }: { kpi: ReportKpi }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500">{kpi.label}</div>
        <div className="mt-1 text-h3 font-semibold tabular-nums text-neutral-900">
          {fmt(kpi.value, kpi.format)}
        </div>
        {kpi.delta != null ? (
          <div
            className={cn(
              'mt-1 inline-flex items-center gap-0.5 text-tiny font-medium',
              kpi.delta >= 0 ? 'text-success-600' : 'text-danger-600',
            )}
          >
            {kpi.delta >= 0 ? (
              <ArrowUpRight className="size-3" strokeWidth={2.5} />
            ) : (
              <ArrowDownRight className="size-3" strokeWidth={2.5} />
            )}
            {Math.abs(kpi.delta)}%
          </div>
        ) : kpi.hint ? (
          <div className="mt-1 text-tiny text-neutral-400">{kpi.hint}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ChartCard({ chart }: { chart: ReportChart }) {
  const hasData = chart.data.some((d) => d.value > 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{chart.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          chart.type === 'area' ? (
            <TrendChart
              data={chart.data}
              tickInterval={chart.data.length > 14 ? 2 : undefined}
              format={chart.format === 'ksh' ? (n) => ksh(n) : undefined}
            />
          ) : (
            <MiniBars
              data={chart.data}
              highlightMax
              format={chart.format === 'ksh' ? (n) => ksh(n) : undefined}
            />
          )
        ) : (
          <div className="grid h-[150px] place-items-center text-small text-neutral-400">
            No data for this period
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TableCard({ table }: { table: ReportTable }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{table.title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {table.rows.length === 0 ? (
          <EmptyState title="Nothing to show" />
        ) : (
          <Table>
            <THead>
              <TR>
                {table.columns.map((c) => (
                  <TH key={c.key}>{c.label}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {table.rows.map((row, i) => (
                <TR key={i}>
                  {table.columns.map((c) => (
                    <TD
                      key={c.key}
                      className={
                        c.format === 'ksh' || c.format === 'number'
                          ? 'tabular-nums'
                          : undefined
                      }
                    >
                      {fmt(row[c.key], c.format)}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}
