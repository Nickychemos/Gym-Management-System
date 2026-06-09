import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Smartphone,
  Wallet,
} from 'lucide-react'

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
import { useDebounce } from '@/hooks/useDebounce'
import { dateTime, ksh, kshCompact } from '@/lib/format'
import { paymentVariant } from '@/lib/status'
import { cn } from '@/lib/utils'
import { usePaymentStream, usePaymentSummary } from '@/queries/payments'
import { CashDrawerTab } from './CashDrawer'
import { StkPushModal } from './StkPushModal'

const VIEW_TABS = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'cash', label: 'Cash Drawer' },
]

const PAGE_LENGTH = 25
const STATUSES = ['Success', 'Pending', 'Failed', 'Timeout', 'Reversed']

export default function PaymentsPage() {
  const [params, setParams] = useSearchParams()
  const [stkOpen, setStkOpen] = useState(false)
  const view = params.get('view') ?? 'mpesa'

  const status = params.get('status') ?? ''
  const direction = params.get('direction') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1'))

  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = useDebounce(searchInput, 250)

  const { branchParam } = useBranch()
  const summary = usePaymentSummary(branchParam)
  const { data, isLoading, isError, error, refetch, isFetching } =
    usePaymentStream({
      status: status || undefined,
      direction: direction || undefined,
      search: search || undefined,
      branch: branchParam,
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
            Payments
          </h1>
          <p className="text-body text-neutral-500">
            {view === 'cash'
              ? 'Cash reconciliation'
              : `M-Pesa transaction stream${isFetching && !isLoading ? ' · refreshing…' : ' · live'}`}
          </p>
        </div>
        {view === 'mpesa' && (
          <Button onClick={() => setStkOpen(true)}>
            <Smartphone className="size-4" strokeWidth={2} />
            STK Push
          </Button>
        )}
      </div>

      <div className="mb-6">
        <Tabs
          tabs={VIEW_TABS}
          value={view}
          onValueChange={(v) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev)
              if (v === 'mpesa') next.delete('view')
              else next.set('view', v)
              return next
            })
          }
        />
      </div>

      {view === 'cash' ? (
        <CashDrawerTab />
      ) : (
        <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Kpi label="Collected today" value={s ? kshCompact(s.today_collected) : '—'} loading={summary.isLoading} />
        <Kpi label="Paid today" value={s ? String(s.today_success_count) : '—'} loading={summary.isLoading} />
        <Kpi
          label="Pending"
          value={s ? String(s.today_pending_count) : '—'}
          loading={summary.isLoading}
          tone={s && s.today_pending_count > 0 ? 'warning' : undefined}
        />
        <Kpi
          label="Failed today"
          value={s ? String(s.today_failed_count) : '—'}
          loading={summary.isLoading}
          tone={s && s.today_failed_count > 0 ? 'danger' : undefined}
        />
        <Kpi label="MTD collected" value={s ? kshCompact(s.mtd_collected) : '—'} loading={summary.isLoading} />
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
            placeholder="Search phone, receipt, member…"
            className="pl-9"
          />
        </div>
        <div className="w-40">
          <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={direction} onChange={(e) => setParam('direction', e.target.value)} aria-label="Direction">
            <option value="">In &amp; out</option>
            <option value="Inbound">Inbound</option>
            <option value="Outbound">Outbound</option>
          </Select>
        </div>
        {(status || direction || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); setParams({}, { replace: true }) }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState
            icon={Wallet}
            title="Couldn't load payments"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <PaymentsSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={search || status || direction ? 'No matching transactions' : 'No payments yet'}
            description={search || status || direction ? 'Try clearing the filters.' : 'STK pushes and paybill payments will appear here.'}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>When</TH>
                <TH>Member</TH>
                <TH>Type</TH>
                <TH>Receipt</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.name}>
                  <TD>
                    <Badge variant={paymentVariant(p.status)}>{p.status}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-neutral-500">{dateTime(p.at)}</TD>
                  <TD>
                    <div className="min-w-0">
                      <div className="text-neutral-900 truncate">{p.customer_name ?? '—'}</div>
                      <div className="text-tiny text-neutral-400 font-mono">{p.phone_number}</div>
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">
                    <span className="text-neutral-700">{p.transaction_type}</span>
                    <span className={cn('ml-1.5 text-tiny', p.direction === 'Outbound' ? 'text-danger-700' : 'text-neutral-400')}>
                      {p.direction === 'Outbound' ? '↑ out' : '↓ in'}
                    </span>
                  </TD>
                  <TD className="font-mono text-tiny text-neutral-500">{p.mpesa_receipt_number ?? '—'}</TD>
                  <TD className="text-right tabular-nums font-medium text-neutral-900">{ksh(p.amount)}</TD>
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
            {total.toLocaleString()} transactions · page {page} of {pageCount}
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

      <StkPushModal open={stkOpen} onClose={() => setStkOpen(false)} />
        </>
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
  value: string
  loading?: boolean
  tone?: 'warning' | 'danger'
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div
            className={cn(
              'text-h2 font-semibold tabular-nums',
              tone === 'warning' && 'text-warning-700',
              tone === 'danger' && 'text-danger-700',
              !tone && 'text-neutral-900',
            )}
          >
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PaymentsSkeleton() {
  return (
    <div className="divide-y divide-neutral-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-32 flex-1" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}
