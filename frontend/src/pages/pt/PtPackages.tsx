import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ClipboardList, Plus, Search } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { useDebounce } from '@/hooks/useDebounce'
import { ksh } from '@/lib/format'
import { ptVariant } from '@/lib/status'
import { cn } from '@/lib/utils'
import { usePtPackages } from '@/queries/pt'
import { SellPackageDrawer } from './SellPackageDrawer'

const PAGE_LENGTH = 25
const STATUSES = ['Active', 'Completed', 'Expired', 'Cancelled', 'Refunded', 'Draft']

export default function PtPackagesPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [sellOpen, setSellOpen] = useState(false)

  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1'))
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = useDebounce(searchInput, 250)

  const { data, isLoading, isError, error, refetch } = usePtPackages({
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">
            PT Packages
          </h1>
          <p className="text-body text-neutral-500">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} packages`}
          </p>
        </div>
        <Button onClick={() => setSellOpen(true)}>
          <Plus className="size-4" strokeWidth={2} />
          Sell Package
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
          <Input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setParam('q', e.target.value) }}
            placeholder="Search package # or member…"
            className="pl-9"
          />
        </div>
        <div className="w-44">
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

      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState
            icon={ClipboardList}
            title="Couldn't load packages"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <div className="divide-y divide-neutral-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3.5 w-40 flex-1" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={search || status ? 'No matching packages' : 'No PT packages yet'}
            description={search || status ? 'Try clearing the filters.' : 'Sell a package to a member to get started.'}
            action={
              !search && !status ? (
                <Button onClick={() => setSellOpen(true)}>
                  <Plus className="size-4" strokeWidth={2} />
                  Sell Package
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Trainer</TH>
                <TH>Status</TH>
                <TH>Sessions</TH>
                <TH className="text-right">Price</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => {
                const pct = p.sessions_purchased
                  ? (p.sessions_used / p.sessions_purchased) * 100
                  : 0
                return (
                  <TR key={p.name} clickable onClick={() => navigate(`/pt/${encodeURIComponent(p.name)}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.customer_name} size="size-8" />
                        <div className="min-w-0">
                          <div className="text-body text-neutral-900 truncate">{p.customer_name}</div>
                          <div className="text-tiny text-neutral-400 font-mono">{p.name}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>{p.trainer_name ?? '—'}</TD>
                    <TD><Badge variant={ptVariant(p.status)}>{p.status}</Badge></TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className={cn('h-full', pct >= 100 ? 'bg-neutral-400' : 'bg-brand-500')}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="text-tiny tabular-nums text-neutral-500">
                          {p.sessions_remaining} left
                        </span>
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums text-neutral-900">{ksh(p.price)}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {!isError && rows.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-small text-neutral-500">Page {page} of {pageCount}</p>
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

      <SellPackageDrawer
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        onSold={(pkg) => { setSellOpen(false); navigate(`/pt/${encodeURIComponent(pkg)}`) }}
      />
    </div>
  )
}
