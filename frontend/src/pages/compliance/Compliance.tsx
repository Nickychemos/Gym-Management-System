import { useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { fullDate } from '@/lib/format'
import { severityVariant } from '@/lib/status'
import { cn } from '@/lib/utils'
import {
  useCertifications,
  useCompliance,
  useComplianceSummary,
} from '@/queries/compliance'

const TABS = [
  { value: 'items', label: 'Compliance Items' },
  { value: 'certs', label: 'Certifications' },
]

function expiryLabel(days: number | null, severity: string): string {
  if (days === null) return 'No expiry'
  if (severity === 'expired') return `Expired ${Math.abs(days)}d ago`
  return `${days}d left`
}

export default function CompliancePage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'items'
  const bucket = params.get('bucket') ?? ''

  const summary = useComplianceSummary()

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const s = summary.data

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-display font-semibold tracking-tight text-neutral-900">
          Compliance
        </h1>
        <p className="text-body text-neutral-500">
          Licenses, permits & staff certifications
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Compliance expiring" value={s?.compliance_soon} loading={summary.isLoading} tone={s && s.compliance_soon > 0 ? 'warning' : undefined} />
        <Kpi label="Compliance expired" value={s?.compliance_expired} loading={summary.isLoading} tone={s && s.compliance_expired > 0 ? 'danger' : undefined} />
        <Kpi label="Certs expiring" value={s?.cert_soon} loading={summary.isLoading} tone={s && s.cert_soon > 0 ? 'warning' : undefined} />
        <Kpi label="Certs expired" value={s?.cert_expired} loading={summary.isLoading} tone={s && s.cert_expired > 0 ? 'danger' : undefined} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <Tabs tabs={TABS} value={tab} onValueChange={(v) => setParam('tab', v)} />
        <div className="w-44">
          <Select value={bucket} onChange={(e) => setParam('bucket', e.target.value)} aria-label="Filter by expiry">
            <option value="">All</option>
            <option value="expired">Expired</option>
            <option value="soon">Expiring soon</option>
            <option value="ok">Current</option>
          </Select>
        </div>
      </div>

      {tab === 'items' ? (
        <ComplianceItems bucket={bucket} />
      ) : (
        <Certifications bucket={bucket} />
      )}
    </div>
  )
}

function ComplianceItems({ bucket }: { bucket: string }) {
  const { data, isLoading, isError } = useCompliance({ bucket: bucket || undefined })
  const rows = data?.rows ?? []

  return (
    <Card className="overflow-hidden">
      {isError ? (
        <EmptyState icon={ShieldCheck} title="Couldn't load compliance items" />
      ) : isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No compliance items" description="Licenses, permits and tax filings will appear here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Category</TH>
              <TH>Authority</TH>
              <TH>Expires</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.name}>
                <TD>
                  <div className="text-neutral-900">{r.compliance_name}</div>
                  {r.reference_number && (
                    <div className="text-tiny text-neutral-400 font-mono">{r.reference_number}</div>
                  )}
                </TD>
                <TD>{r.category ?? '—'}</TD>
                <TD className="text-neutral-500">{r.authority ?? '—'}</TD>
                <TD className="whitespace-nowrap">
                  <span className="text-neutral-700">{fullDate(r.expires_on)}</span>
                  <span className={cn('ml-2 text-tiny', r.severity === 'expired' ? 'text-danger-700' : r.severity === 'soon' ? 'text-warning-700' : 'text-neutral-400')}>
                    {expiryLabel(r.days_to_expiry, r.severity)}
                  </span>
                </TD>
                <TD>
                  <Badge variant={severityVariant(r.severity)}>
                    {r.severity === 'expired' ? 'Expired' : r.severity === 'soon' ? 'Expiring' : 'Current'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  )
}

function Certifications({ bucket }: { bucket: string }) {
  const { data, isLoading, isError } = useCertifications({ bucket: bucket || undefined })
  const rows = data ?? []

  return (
    <Card className="overflow-hidden">
      {isError ? (
        <EmptyState icon={ShieldCheck} title="Couldn't load certifications" />
      ) : isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No certifications" description="Trainer and facility certifications will appear here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Certification</TH>
              <TH>Holder</TH>
              <TH>Issuer</TH>
              <TH>Expires</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.name}>
                <TD>
                  <div className="text-neutral-900">{r.certification_name}</div>
                  {!r.verified_by_hr && (
                    <div className="text-tiny text-warning-700">Unverified</div>
                  )}
                </TD>
                <TD>{r.employee_name}</TD>
                <TD className="text-neutral-500">{r.issuing_body ?? '—'}</TD>
                <TD className="whitespace-nowrap">
                  <span className="text-neutral-700">{fullDate(r.expires_on)}</span>
                  <span className={cn('ml-2 text-tiny', r.severity === 'expired' ? 'text-danger-700' : r.severity === 'soon' ? 'text-warning-700' : 'text-neutral-400')}>
                    {expiryLabel(r.days_to_expiry, r.severity)}
                  </span>
                </TD>
                <TD>
                  <Badge variant={severityVariant(r.severity)}>
                    {r.severity === 'expired' ? 'Expired' : r.severity === 'soon' ? 'Expiring' : 'Current'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
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
  tone?: 'warning' | 'danger'
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div
            className={cn(
              'text-h2 font-semibold tabular-nums',
              tone === 'warning' && 'text-warning-700',
              tone === 'danger' && 'text-danger-700',
              !tone && 'text-neutral-900',
            )}
          >
            {value ?? '—'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-neutral-100">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-3.5 w-48 flex-1" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}
