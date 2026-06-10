import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Download,
  Save,
  SlidersHorizontal,
  Star,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { MiniBars, TrendChart } from '@/components/charts/ChartKit'
import { useBranch } from '@/context/BranchContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { dateTime, ksh } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  type ReportChart,
  type ReportEnvelope,
  type ReportKpi,
  type ReportTable,
  type ReportValueFormat,
  type ReportVisibility,
  type SavedReport,
} from '@/lib/types'
import {
  downloadReport,
  useDeleteSavedReport,
  useReportList,
  useRunReport,
  useSaveSavedReport,
  useSavedReports,
} from '@/queries/reports'
import { ScheduleDialog, ScheduleManager } from './ScheduleManager'

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

/** Drop the sections/columns a visibility config hides (client mirror of the
 *  backend _apply_visibility, so customising is instant). */
function applyHidden(env: ReportEnvelope, h: ReportVisibility): ReportEnvelope {
  const hk = new Set(h.hidden_kpis ?? [])
  const hc = new Set(h.hidden_charts ?? [])
  const ht = new Set(h.hidden_tables ?? [])
  const hcol = h.hidden_columns ?? {}
  return {
    ...env,
    kpis: env.kpis.filter((k) => !hk.has(k.key)),
    charts: env.charts.filter((c) => !hc.has(c.key)),
    tables: env.tables
      .filter((t) => !ht.has(t.key))
      .map((t) => {
        const hidden = new Set(hcol[t.key] ?? [])
        return hidden.size
          ? { ...t, columns: t.columns.filter((c) => !hidden.has(c.key)) }
          : t
      }),
  }
}

function toggleIn(arr: string[] | undefined, key: string): string[] {
  const s = new Set(arr ?? [])
  if (s.has(key)) s.delete(key)
  else s.add(key)
  return [...s]
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const report = params.get('report') ?? undefined
  const savedName = params.get('saved') ?? undefined
  const view = params.get('view')
  const { data: savedList } = useSavedReports()
  const savedMeta = savedName
    ? savedList?.find((s) => s.name === savedName)
    : undefined

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

  const inViewer = !!report || !!savedName
  const reportKey = report ?? savedMeta?.report_key

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight text-neutral-900">
            Reports
          </h1>
          <p className="text-small text-neutral-500 mt-0.5">
            Aggregated insight across every part of your gym.
          </p>
        </div>
        {!inViewer && (
          <div className="inline-flex shrink-0 rounded-md border border-neutral-200 p-0.5">
            <ToggleBtn active={view !== 'schedules'} onClick={() => setParam('view', null)}>
              Reports
            </ToggleBtn>
            <ToggleBtn
              active={view === 'schedules'}
              onClick={() => setParam('view', 'schedules')}
            >
              Scheduled
            </ToggleBtn>
          </div>
        )}
      </div>

      {view === 'schedules' && !inViewer ? (
        <ScheduleManager />
      ) : inViewer && reportKey ? (
        <ReportViewer
          key={savedName ?? report}
          reportKey={reportKey}
          savedMeta={savedMeta}
          period={params.get('period') ?? savedMeta?.period ?? 'this_month'}
          onPeriod={(p) => setParam('period', p)}
          onBack={() => {
            setParam('report', null)
            setParam('saved', null)
            setParam('period', null)
          }}
          onSaved={(name) => {
            setParam('report', null)
            setParam('saved', name)
          }}
        />
      ) : inViewer ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <Catalogue
          onOpen={(key) => setParam('report', key)}
          onOpenSaved={(name) => setParam('saved', name)}
        />
      )}
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-3 py-1 text-small font-medium transition-colors',
        active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900',
      )}
    >
      {children}
    </button>
  )
}

function Catalogue({
  onOpen,
  onOpenSaved,
}: {
  onOpen: (key: string) => void
  onOpenSaved: (name: string) => void
}) {
  const { data, isLoading } = useReportList()
  const { data: saved } = useSavedReports()

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
      {saved && saved.length > 0 && (
        <div>
          <h2 className="mb-2.5 text-tiny font-semibold uppercase tracking-wide text-neutral-400">
            Saved reports
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {saved.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => onOpenSaved(s.name)}
                className="group flex flex-col rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-md bg-accent-500 text-white">
                    <Star className="size-4" strokeWidth={2} />
                  </span>
                  <span className="text-body font-medium text-neutral-900">{s.title}</span>
                </div>
                <p className="mt-2 text-small text-neutral-500">
                  {s.report_title} · {PERIODS.find((p) => p.value === s.period)?.label ?? s.period}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

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
                  <span className="text-body font-medium text-neutral-900">{r.title}</span>
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
  reportKey,
  savedMeta,
  period,
  onPeriod,
  onBack,
  onSaved,
}: {
  reportKey: string
  savedMeta?: SavedReport
  period: string
  onPeriod: (p: string) => void
  onBack: () => void
  onSaved: (name: string) => void
}) {
  const { branchParam, selected, multiBranch } = useBranch()
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [hidden, setHidden] = useState<ReportVisibility>(savedMeta?.config ?? {})

  const effBranch = savedMeta ? savedMeta.branch ?? undefined : branchParam
  const { data, isLoading, isError, error } = useRunReport({
    report: reportKey,
    period,
    branch: effBranch,
  })
  const saveView = useSaveSavedReport()
  const delView = useDeleteSavedReport()

  const filtered = data ? applyHidden(data, hidden) : undefined

  async function exportAs(format: 'pdf' | 'csv' | 'xlsx') {
    setBusy(format)
    try {
      await downloadReport({ report: reportKey, format, period, branch: effBranch, config: hidden })
    } catch (e) {
      toast({ variant: 'error', title: 'Export failed', description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  function persist(title: string) {
    saveView.mutate(
      {
        name: savedMeta?.name,
        title,
        report_key: reportKey,
        period,
        branch: effBranch ?? null,
        config: hidden,
      },
      {
        onSuccess: (r) => {
          toast({ variant: 'success', title: savedMeta ? 'View updated' : 'View saved' })
          setSaveOpen(false)
          if (!savedMeta) onSaved(r.name)
        },
        onError: (e) =>
          toast({ variant: 'error', title: 'Could not save', description: e instanceof ApiError ? e.message : undefined }),
      },
    )
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
            {savedMeta?.title ?? data?.title ?? 'Report'}
          </h2>
          <p className="text-small text-neutral-500">
            {data ? data.period.label : '…'}
            {multiBranch && !savedMeta
              ? ` · ${selected === '__all__' ? 'All branches' : selected}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!savedMeta && (
            <div className="w-40">
              <Select value={period} onChange={(e) => onPeriod(e.target.value)}>
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button
            variant={editing ? 'primary' : 'secondary'}
            size="sm"
            disabled={!data}
            onClick={() => setEditing((v) => !v)}
          >
            <SlidersHorizontal className="size-3.5" strokeWidth={2} />
            Customize
          </Button>
          {(['pdf', 'csv', 'xlsx'] as const).map((f) => (
            <Button key={f} variant="secondary" size="sm" disabled={!data || busy !== null} onClick={() => exportAs(f)}>
              <Download className="size-3.5" strokeWidth={2} />
              {busy === f ? '…' : f.toUpperCase()}
            </Button>
          ))}
          {savedMeta ? (
            <>
              <Button variant="secondary" size="sm" disabled={!data || saveView.isPending} onClick={() => persist(savedMeta.title)}>
                <Save className="size-3.5" strokeWidth={2} />
                Update view
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
                onClick={() =>
                  delView.mutate(savedMeta.name, {
                    onSuccess: () => {
                      toast({ variant: 'success', title: 'View deleted' })
                      onBack()
                    },
                  })
                }
              >
                <Trash2 className="size-4" strokeWidth={2} />
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" disabled={!data} onClick={() => setSaveOpen(true)}>
              <Save className="size-3.5" strokeWidth={2} />
              Save view
            </Button>
          )}
          <Button size="sm" disabled={!data} onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="size-3.5" strokeWidth={2} />
            Schedule
          </Button>
        </div>
      </div>

      {editing && data && (
        <CustomizePanel env={data} hidden={hidden} setHidden={setHidden} />
      )}

      {isError ? (
        <Card>
          <EmptyState
            title="Couldn't run this report"
            description={error instanceof Error ? error.message : undefined}
          />
        </Card>
      ) : isLoading || !filtered ? (
        <ReportSkeleton />
      ) : (
        <ReportBody data={filtered} />
      )}

      {scheduleOpen && (
        <ScheduleDialog
          preset={{
            report_key: reportKey,
            period,
            branch: effBranch ?? null,
            saved_report: savedMeta?.name,
          }}
          onClose={() => setScheduleOpen(false)}
        />
      )}
      {saveOpen && (
        <SaveViewDialog
          defaultTitle={data?.title ?? 'My report'}
          pending={saveView.isPending}
          onSave={persist}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  )
}

function SaveViewDialog({
  defaultTitle,
  pending,
  onSave,
  onClose,
}: {
  defaultTitle: string
  pending: boolean
  onSave: (title: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(defaultTitle)
  return (
    <Dialog
      open
      onClose={onClose}
      title="Save as a view"
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => title.trim() && onSave(title.trim())} disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : 'Save view'}
          </Button>
        </>
      }
    >
      <div>
        <Label>View name</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <p className="mt-2 text-tiny text-neutral-500">
          Saves the current period, branch and chosen sections as a reusable view
          you can re-run, export or schedule.
        </p>
      </div>
    </Dialog>
  )
}

function CustomizePanel({
  env,
  hidden,
  setHidden,
}: {
  env: ReportEnvelope
  hidden: ReportVisibility
  setHidden: React.Dispatch<React.SetStateAction<ReportVisibility>>
}) {
  const hk = new Set(hidden.hidden_kpis ?? [])
  const hc = new Set(hidden.hidden_charts ?? [])
  const ht = new Set(hidden.hidden_tables ?? [])

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>Customize</CardTitle>
        <span className="text-tiny text-neutral-400">Choose what appears</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {env.kpis.length > 0 && (
          <Group label="Metrics">
            {env.kpis.map((k) => (
              <Check
                key={k.key}
                checked={!hk.has(k.key)}
                onChange={() =>
                  setHidden((h) => ({ ...h, hidden_kpis: toggleIn(h.hidden_kpis, k.key) }))
                }
              >
                {k.label}
              </Check>
            ))}
          </Group>
        )}
        {env.charts.length > 0 && (
          <Group label="Charts">
            {env.charts.map((c) => (
              <Check
                key={c.key}
                checked={!hc.has(c.key)}
                onChange={() =>
                  setHidden((h) => ({ ...h, hidden_charts: toggleIn(h.hidden_charts, c.key) }))
                }
              >
                {c.title}
              </Check>
            ))}
          </Group>
        )}
        {env.tables.map((t) => (
          <Group key={t.key} label={t.title}>
            <Check
              checked={!ht.has(t.key)}
              onChange={() =>
                setHidden((h) => ({ ...h, hidden_tables: toggleIn(h.hidden_tables, t.key) }))
              }
            >
              Show table
            </Check>
            {!ht.has(t.key) &&
              t.columns.map((c) => (
                <Check
                  key={c.key}
                  checked={!(hidden.hidden_columns?.[t.key] ?? []).includes(c.key)}
                  onChange={() =>
                    setHidden((h) => ({
                      ...h,
                      hidden_columns: {
                        ...h.hidden_columns,
                        [t.key]: toggleIn(h.hidden_columns?.[t.key], c.key),
                      },
                    }))
                  }
                >
                  <span className="text-neutral-500">{c.label}</span>
                </Check>
              ))}
          </Group>
        ))}
      </CardContent>
    </Card>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-tiny font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">{children}</div>
    </div>
  )
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: () => void
  children: React.ReactNode
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-small text-neutral-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-3.5 rounded border-neutral-300 accent-neutral-900"
      />
      {children}
    </label>
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
                        c.format === 'ksh' || c.format === 'number' ? 'tabular-nums' : undefined
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
