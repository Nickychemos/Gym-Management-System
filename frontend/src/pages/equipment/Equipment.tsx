import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Boxes, Plus, Search, Wrench } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { useBranch } from '@/context/BranchContext'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { fullDate, relativeDay } from '@/lib/format'
import { opStatusVariant, priorityVariant, ticketVariant } from '@/lib/status'
import { cn } from '@/lib/utils'
import {
  useEquipment,
  useEquipmentCategories,
  useEquipmentSummary,
  useResolveTicket,
  useSetTicketStatus,
  useTickets,
} from '@/queries/equipment'
import { AddEquipmentDrawer } from './AddEquipmentDrawer'
import { CreateTicketDrawer } from './CreateTicketDrawer'

const TABS = [
  { value: 'register', label: 'Equipment' },
  { value: 'tickets', label: 'Maintenance Tickets' },
]

export default function EquipmentPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab') ?? 'register'
  const [addEquip, setAddEquip] = useState(false)
  const [reportIssue, setReportIssue] = useState(false)

  const { branchParam } = useBranch()
  const summary = useEquipmentSummary(branchParam)
  const s = summary.data

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key === 'tab') {
        next.delete('q')
        next.delete('status')
        next.delete('category')
      }
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">
            Equipment
          </h1>
          <p className="text-body text-neutral-500">
            Inventory & maintenance
          </p>
        </div>
        {tab === 'register' ? (
          <Button onClick={() => setAddEquip(true)}>
            <Plus className="size-4" strokeWidth={2} />
            Add Equipment
          </Button>
        ) : (
          <Button onClick={() => setReportIssue(true)}>
            <Plus className="size-4" strokeWidth={2} />
            Report Issue
          </Button>
        )}
      </div>

      {/* KPI strip — machine fleet health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Machines" value={s?.total} loading={summary.isLoading} />
        <Kpi label="Operational" value={s?.operational} loading={summary.isLoading} tone={s && s.operational > 0 ? 'success' : undefined} />
        <Kpi label="Maintenance due" value={s?.maintenance_due} loading={summary.isLoading} tone={s && s.maintenance_due > 0 ? 'warning' : undefined} />
        <Kpi label="Out of service" value={s?.out_of_service} loading={summary.isLoading} tone={s && s.out_of_service > 0 ? 'danger' : undefined} />
      </div>

      <div className="mb-4">
        <Tabs tabs={TABS} value={tab} onValueChange={(v) => setParam('tab', v)} />
      </div>

      {tab === 'register' ? (
        <RegisterTab
          params={params}
          setParam={setParam}
          onRow={(asset) => navigate(`/equipment/${encodeURIComponent(asset)}`)}
          onAdd={() => setAddEquip(true)}
        />
      ) : (
        <TicketsTab params={params} setParam={setParam} onReport={() => setReportIssue(true)} />
      )}

      <AddEquipmentDrawer
        open={addEquip}
        onClose={() => setAddEquip(false)}
        onCreated={(asset) => { setAddEquip(false); navigate(`/equipment/${encodeURIComponent(asset)}`) }}
      />
      <CreateTicketDrawer open={reportIssue} onClose={() => setReportIssue(false)} />
    </div>
  )
}

// ---------------- Register tab ----------------

function RegisterTab({
  params,
  setParam,
  onRow,
  onAdd,
}: {
  params: URLSearchParams
  setParam: (k: string, v: string) => void
  onRow: (asset: string) => void
  onAdd: () => void
}) {
  const status = params.get('status') ?? ''
  const category = params.get('category') ?? ''
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = useDebounce(searchInput, 250)
  const { branchParam } = useBranch()
  const { data: categories } = useEquipmentCategories()

  const { data, isLoading, isError, refetch } = useEquipment({
    search: search || undefined,
    op_status: status || undefined,
    category: category || undefined,
    branch: branchParam,
  })
  const rows = data?.rows ?? []

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
          <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setParam('q', e.target.value) }} placeholder="Search equipment…" className="pl-9" />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option>Operational</option>
            <option>Maintenance Due</option>
            <option>Out of Service</option>
          </Select>
        </div>
        <div className="w-40">
          <Select value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState icon={Boxes} title="Couldn't load equipment" action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} />
        ) : isLoading ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={search || status || category ? 'No matching equipment' : 'No equipment registered'}
            description={search || status || category ? 'Try clearing the filters.' : 'Add your machines to start tracking maintenance.'}
            action={!search && !status && !category ? <Button onClick={onAdd}><Plus className="size-4" strokeWidth={2} />Add Equipment</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Equipment</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Next service</TH>
                <TH className="text-right">Open issues</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR key={m.name} clickable onClick={() => onRow(m.name)}>
                  <TD>
                    <div className="text-neutral-900">{m.asset_name}</div>
                    <div className="text-tiny text-neutral-400">{m.branch ?? '—'}</div>
                  </TD>
                  <TD>{m.category ?? '—'}</TD>
                  <TD><Badge variant={opStatusVariant(m.op_status)}>{m.op_status}</Badge></TD>
                  <TD className="whitespace-nowrap text-neutral-600">{m.next_service ? fullDate(m.next_service) : '—'}</TD>
                  <TD className="text-right tabular-nums">
                    {m.open_tickets > 0 ? <span className="text-warning-700 font-medium">{m.open_tickets}</span> : <span className="text-neutral-400">0</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}

// ---------------- Tickets tab ----------------

const TICKET_STATUSES = ['Open', 'Acknowledged', 'In Progress', 'Awaiting Parts', 'Resolved', 'Closed', 'Cancelled']

function TicketsTab({
  params,
  setParam,
  onReport,
}: {
  params: URLSearchParams
  setParam: (k: string, v: string) => void
  onReport: () => void
}) {
  const status = params.get('status') ?? 'Open'
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = useDebounce(searchInput, 250)
  const { branchParam } = useBranch()
  const { data, isLoading, isError, refetch } = useTickets({
    status: status === 'All' ? undefined : status,
    search: search || undefined,
    branch: branchParam,
  })
  const rows = data?.rows ?? []

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
          <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setParam('q', e.target.value) }} placeholder="Search tickets…" className="pl-9" />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="Open">Open (all active)</option>
            <option value="All">All statuses</option>
            {TICKET_STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState icon={Wrench} title="Couldn't load tickets" action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} />
        ) : isLoading ? (
          <RowsSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={Wrench} title={search ? 'No matching tickets' : 'No open tickets'} description={search ? 'Try a different search.' : 'Raise a ticket when a machine needs attention.'} action={!search ? <Button onClick={onReport}><Plus className="size-4" strokeWidth={2} />Report Issue</Button> : undefined} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Issue</TH>
                <TH>Priority</TH>
                <TH>Status</TH>
                <TH>Reported</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((t) => (
                <TR key={t.name}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {t.out_of_service ? <span className="size-2 rounded-full bg-danger-500 shrink-0" title="Out of service" /> : null}
                      <div className="min-w-0">
                        <div className="text-neutral-900 truncate">{t.title}</div>
                        <div className="text-tiny text-neutral-400">{t.asset ?? '—'}</div>
                      </div>
                    </div>
                  </TD>
                  <TD><Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge></TD>
                  <TD><Badge variant={ticketVariant(t.status)}>{t.status}</Badge></TD>
                  <TD className="text-neutral-500 whitespace-nowrap">{relativeDay(t.reported_at)}</TD>
                  <TD className="text-right"><TicketActions ticket={t} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}

function nextStatus(status: string): { label: string; status: string }[] {
  switch (status) {
    case 'Open':
      return [{ label: 'Acknowledge', status: 'Acknowledged' }]
    case 'Acknowledged':
      return [{ label: 'Start', status: 'In Progress' }]
    case 'In Progress':
      return [{ label: 'Awaiting parts', status: 'Awaiting Parts' }]
    case 'Awaiting Parts':
      return [{ label: 'Resume', status: 'In Progress' }]
    default:
      return []
  }
}

export function TicketActions({ ticket }: { ticket: { name: string; status: string } }) {
  const { toast } = useToast()
  const setStatus = useSetTicketStatus()
  const resolve = useResolveTicket()
  const busy = setStatus.isPending || resolve.isPending
  const transitions = nextStatus(ticket.status)
  const canResolve = ['Acknowledged', 'In Progress', 'Awaiting Parts'].includes(ticket.status)
  const onErr = (err: unknown) =>
    toast({ variant: 'error', title: 'Action failed', description: err instanceof ApiError ? err.message : undefined })

  if (transitions.length === 0 && !canResolve) return <span className="text-tiny text-neutral-400">—</span>

  return (
    <div className="inline-flex items-center gap-1.5">
      {transitions.map((tr) => (
        <Button key={tr.status} variant="secondary" size="sm" disabled={busy}
          onClick={() => setStatus.mutate({ ticket: ticket.name, status: tr.status }, { onSuccess: () => toast({ title: tr.label + 'd' }), onError: onErr })}>
          {tr.label}
        </Button>
      ))}
      {canResolve && (
        <Button size="sm" disabled={busy}
          onClick={() => resolve.mutate({ ticket: ticket.name }, { onSuccess: () => toast({ variant: 'success', title: 'Resolved' }), onError: onErr })}>
          Resolve
        </Button>
      )}
    </div>
  )
}

function Kpi({ label, value, loading, tone }: { label: string; value: number | undefined; loading?: boolean; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={cn('text-h2 font-semibold tabular-nums', tone === 'success' && 'text-success-700', tone === 'warning' && 'text-warning-700', tone === 'danger' && 'text-danger-700', !tone && 'text-neutral-900')}>
            {value ?? '—'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-neutral-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-3.5 w-48 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      ))}
    </div>
  )
}
