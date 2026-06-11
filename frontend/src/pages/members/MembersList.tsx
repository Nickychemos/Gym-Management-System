import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react'

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
import { ksh, relativeDay } from '@/lib/format'
import { useBranch } from '@/context/BranchContext'
import { subscriptionVariant } from '@/lib/status'
import { useMembers } from '@/queries/members'
import { AddMemberDrawer } from './AddMemberDrawer'

const PAGE_LENGTH = 20

const STATUS_OPTIONS = [
  'Active',
  'Frozen',
  'Lapsed',
  'Expired',
  'Cancelled',
  'Draft',
]

export default function MembersListPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)

  const urlSearch = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1'))

  // Local search box state, debounced before it hits the query + URL.
  const [searchInput, setSearchInput] = useState(urlSearch)
  const debounced = useDebounce(searchInput, 250)

  // Push debounced search into the URL (resetting to page 1 on change).
  useEffect(() => {
    if (debounced === urlSearch) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debounced) next.set('q', debounced)
        else next.delete('q')
        next.delete('page')
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { branchParam } = useBranch()
  const { data, isLoading, isError, error, refetch, isFetching } = useMembers({
    search: debounced || undefined,
    status: status || undefined,
    branch: branchParam,
    page,
    pageLength: PAGE_LENGTH,
  })

  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_LENGTH))
  const rows = data?.rows ?? []

  function setFilter(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function gotoPage(p: number) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p <= 1) next.delete('page')
      else next.set('page', String(p))
      return next
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-neutral-900">
            Members
          </h1>
          <p className="text-body text-neutral-500">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} total`}
            {isFetching && !isLoading ? ' · refreshing…' : ''}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" strokeWidth={2} />
          Add Member
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
            strokeWidth={2}
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, email or ID…"
            className="pl-9"
            aria-label="Search members"
          />
        </div>
        <div className="w-44">
          <Select
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        {(status || debounced) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('')
              setParams({}, { replace: true })
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState
            icon={Users}
            title="Couldn't load members"
            description={
              error instanceof Error ? error.message : 'Something went wrong.'
            }
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : isLoading ? (
          <MembersTableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              debounced || status
                ? 'No members match your filters'
                : 'No members yet'
            }
            description={
              debounced || status
                ? 'Try a different search or clear the filters.'
                : "Let's add your first member to get started."
            }
            action={
              !debounced && !status ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" strokeWidth={2} />
                  Add Member
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Plan</TH>
                <TH>Status</TH>
                <TH>Last visit</TH>
                <TH className="text-right">Balance</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR
                  key={m.member}
                  data-testid="member-row"
                  clickable
                  onClick={() => navigate(`/members/${encodeURIComponent(m.member)}`)}
                >
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.full_name} src={m.profile_photo} size="size-8" />
                      <div className="min-w-0">
                        <div className="text-body font-medium text-neutral-900 truncate">
                          {m.full_name}
                        </div>
                        <div className="text-tiny text-neutral-500 font-mono">
                          {m.member}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>{m.plan ?? <span className="text-neutral-400">—</span>}</TD>
                  <TD>
                    {m.sub_status ? (
                      <Badge variant={subscriptionVariant(m.sub_status)}>
                        {m.sub_status}
                      </Badge>
                    ) : (
                      <span className="text-neutral-400">No subscription</span>
                    )}
                  </TD>
                  <TD>{relativeDay(m.last_visit)}</TD>
                  <TD className="text-right tabular-nums">
                    {m.balance > 0 ? (
                      <span className="text-danger-700 font-medium">
                        {ksh(m.balance)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
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
            Page {page} of {pageCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => gotoPage(page + 1)}
            >
              Next
              <ChevronRight className="size-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      )}

      <AddMemberDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(member) => {
          setAddOpen(false)
          navigate(`/members/${encodeURIComponent(member)}`)
        }}
      />
    </div>
  )
}

function MembersTableSkeleton() {
  return (
    <div className="divide-y divide-neutral-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}
