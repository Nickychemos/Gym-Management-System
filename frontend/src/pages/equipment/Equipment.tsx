import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Wrench } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { relativeDay } from '@/lib/format'
import { priorityVariant, ticketVariant } from '@/lib/status'
import { cn } from '@/lib/utils'
import { type TicketRow } from '@/lib/types'
import {
  useResolveTicket,
  useSetTicketStatus,
  useTicketSummary,
  useTickets,
} from '@/queries/equipment'
import { CreateTicketDrawer } from './CreateTicketDrawer'

const STATUSES = [
  'Open',
  'Acknowledged',
  'In Progress',
  'Awaiting Parts',
  'Resolved',
  'Closed',
  'Cancelled',
]

export default function EquipmentPage() {
  const [params, setParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)

  const status = params.get('status') ?? 'Open'
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = useDebounce(searchInput, 250)

  const summary = useTicketSummary()
  const { data, isLoading, isError, error, refetch } = useTickets({
    status: status === 'All' ? undefined : status,
    search: search || undefined,
  })
  const rows = data?.rows ?? []
  const s = summary.data

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
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
          <p className="text-body text-neutral-500">Maintenance tickets</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" strokeWidth={2} />
          Report Issue
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Kpi label="Open tickets" value={s?.open} loading={summary.isLoading} />
        <Kpi label="Out of service" value={s?.out_of_service} loading={summary.isLoading} tone={s && s.out_of_service > 0 ? 'danger' : undefined} />
        <Kpi label="Critical" value={s?.critical} loading={summary.isLoading} tone={s && s.critical > 0 ? 'danger' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
          <Input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setParam('q', e.target.value) }}
            placeholder="Search tickets…"
            className="pl-9"
          />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="Open">Open (all active)</option>
            <option value="All">All statuses</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState icon={Wrench} title="Couldn't load tickets" description={error instanceof Error ? error.message : undefined} action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>} />
        ) : isLoading ? (
          <div className="divide-y divide-neutral-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-3.5 w-48 flex-1" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={search ? 'No matching tickets' : 'No open tickets'}
            description={search ? 'Try a different search.' : 'Raise a ticket when a machine needs attention.'}
            action={!search ? <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" strokeWidth={2} />Report Issue</Button> : undefined}
          />
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
                      {t.out_of_service ? (
                        <span className="size-2 rounded-full bg-danger-500 shrink-0" title="Out of service" />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-neutral-900 truncate">{t.title}</div>
                        <div className="text-tiny text-neutral-400">{t.asset ?? '—'}</div>
                      </div>
                    </div>
                  </TD>
                  <TD><Badge variant={priorityVariant(t.priority)}>{t.priority}</Badge></TD>
                  <TD><Badge variant={ticketVariant(t.status)}>{t.status}</Badge></TD>
                  <TD className="text-neutral-500 whitespace-nowrap">{relativeDay(t.reported_at)}</TD>
                  <TD className="text-right">
                    <TicketActions ticket={t} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <CreateTicketDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

/** Buttons offered for the ticket's current state. */
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

function TicketActions({ ticket }: { ticket: TicketRow }) {
  const { toast } = useToast()
  const setStatus = useSetTicketStatus()
  const resolve = useResolveTicket()
  const busy = setStatus.isPending || resolve.isPending
  const transitions = nextStatus(ticket.status)
  const canResolve = ['Acknowledged', 'In Progress', 'Awaiting Parts'].includes(ticket.status)

  const onErr = (err: unknown) =>
    toast({ variant: 'error', title: 'Action failed', description: err instanceof ApiError ? err.message : undefined })

  if (transitions.length === 0 && !canResolve) {
    return <span className="text-tiny text-neutral-400">—</span>
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      {transitions.map((tr) => (
        <Button
          key={tr.status}
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            setStatus.mutate(
              { ticket: ticket.name, status: tr.status },
              { onSuccess: () => toast({ title: tr.label + 'd' }), onError: onErr },
            )
          }
        >
          {tr.label}
        </Button>
      ))}
      {canResolve && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            resolve.mutate(
              { ticket: ticket.name },
              { onSuccess: () => toast({ variant: 'success', title: 'Resolved' }), onError: onErr },
            )
          }
        >
          Resolve
        </Button>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  loading,
  tone,
}: {
  label: string
  value: number | undefined
  loading?: boolean
  tone?: 'danger'
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={cn('text-h2 font-semibold tabular-nums', tone === 'danger' ? 'text-danger-700' : 'text-neutral-900')}>
            {value ?? '—'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
