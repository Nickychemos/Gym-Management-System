import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Receipt, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { useDebounce } from '@/hooks/useDebounce'
import { fullDate, ksh, kshCompact } from '@/lib/format'
import { refundVariant } from '@/lib/status'
import { type RefundRow } from '@/lib/types'
import { useRefundSummary, useRefunds } from '@/queries/refunds'
import { NewRefundDrawer } from './NewRefundDrawer'
import { RefundDrawer } from './RefundDrawer'

const PAGE_LENGTH = 25
const STATUSES = [
  'Draft',
  'Pending Manager',
  'Pending Owner',
  'Approved',
  'Refund Initiated',
  'Refunded',
  'Rejected',
  'Failed',
]

export default function RefundsPage() {
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<RefundRow | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1'))
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = useDebounce(searchInput, 250)

  const summary = useRefundSummary()
  const { data, isLoading, isError, error, refetch } = useRefunds({
    status: status || undefined,
    search: search || undefined,
    page,
    pageLength: PAGE_LENGTH,
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_LENGTH))

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    })
  }

  const s = summary.data

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">
            Refunds
          </h1>
          <p className="text-body text-neutral-500">
            {s?.require_dual_control ? 'Dual-control approval' : 'Single approval'}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="size-4" strokeWidth={2} />
          New Refund
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Kpi
          label="Awaiting approval"
          value={s ? String(s.awaiting_approval) : '—'}
          loading={summary.isLoading}
          tone={s && s.awaiting_approval > 0 ? 'warning' : undefined}
        />
        <Kpi
          label="Awaiting payout"
          value={s ? String(s.awaiting_payout) : '—'}
          loading={summary.isLoading}
          tone={s && s.awaiting_payout > 0 ? 'info' : undefined}
        />
        <Kpi
          label="Refunded (total)"
          value={s ? kshCompact(s.refunded_total) : '—'}
          loading={summary.isLoading}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setParam('q', e.target.value)
            }}
            placeholder="Search refund # or member…"
            className="pl-9"
          />
        </div>
        <div className="w-48">
          <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </Select>
        </div>
        {(status || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); setParams({}, { replace: true }) }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState
            icon={Receipt}
            title="Couldn't load refunds"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <div className="divide-y divide-neutral-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-40 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={search || status ? 'No matching refunds' : 'No refunds yet'}
            description={search || status ? 'Try clearing the filters.' : 'Create a refund request to start the approval workflow.'}
            action={
              !search && !status ? (
                <Button onClick={() => setNewOpen(true)}>
                  <Plus className="size-4" strokeWidth={2} />
                  New Refund
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Refund #</TH>
                <TH>Member</TH>
                <TH>Reason</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.name} clickable onClick={() => setSelected(r)}>
                  <TD>
                    <span className="font-mono text-tiny text-neutral-600">{r.name}</span>
                    <div className="text-tiny text-neutral-400">{fullDate(r.requested_on)}</div>
                  </TD>
                  <TD className="text-neutral-900">{r.customer_name}</TD>
                  <TD>{r.refund_reason}</TD>
                  <TD className="whitespace-nowrap">{r.refund_method}</TD>
                  <TD>
                    <Badge variant={refundVariant(r.status)}>{r.status}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums font-medium text-neutral-900">
                    {ksh(r.requested_refund_amount)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Pagination */}
      {!isError && rows.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-small text-neutral-500">
            {total.toLocaleString()} refunds · page {page} of {pageCount}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
              <ChevronLeft className="size-4" strokeWidth={2} />
              Prev
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setParam('page', String(page + 1))}>
              Next
              <ChevronRight className="size-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      )}

      <RefundDrawer refund={selected} onClose={() => setSelected(null)} />
      <NewRefundDrawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => setNewOpen(false)}
      />
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
  value: string
  loading?: boolean
  tone?: 'warning' | 'info'
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div
            className={
              tone === 'warning'
                ? 'text-h2 font-semibold tabular-nums text-warning-700'
                : tone === 'info'
                  ? 'text-h2 font-semibold tabular-nums text-info-700'
                  : 'text-h2 font-semibold tabular-nums text-neutral-900'
            }
          >
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
