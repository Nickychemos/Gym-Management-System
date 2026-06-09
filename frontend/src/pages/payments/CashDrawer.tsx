import { useState } from 'react'
import { Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useBranch } from '@/context/BranchContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { fullDate, ksh } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type CashSession } from '@/lib/types'
import {
  useCashSessions,
  useCloseDrawer,
  useDrawerOptions,
  useDrawerSummary,
  useOpenDrawer,
} from '@/queries/cashdrawer'

export function CashDrawerTab() {
  const { branchParam } = useBranch()
  const summary = useDrawerSummary(branchParam)
  const { data, isLoading } = useCashSessions(branchParam)
  const [openDlg, setOpenDlg] = useState(false)
  const [closing, setClosing] = useState<CashSession | null>(null)
  const s = summary.data

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="grid grid-cols-2 gap-4 flex-1 max-w-md">
          <Kpi label="Open drawers" value={s ? String(s.open_drawers) : '—'} loading={summary.isLoading} tone={s && s.open_drawers > 0 ? 'info' : undefined} />
          <Kpi label="Today's variance" value={s ? ksh(s.today_variance) : '—'} loading={summary.isLoading} tone={s && Math.abs(s.today_variance) > 0 ? 'warning' : undefined} />
        </div>
        <Button onClick={() => setOpenDlg(true)}><Wallet className="size-4" strokeWidth={2} />Open drawer</Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-neutral-100">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-5 py-3"><Skeleton className="h-6 w-full" /></div>)}</div>
        ) : !data || data.length === 0 ? (
          <EmptyState icon={Wallet} title="No drawer sessions yet" description="Open a drawer at the start of a shift to track cash." action={<Button onClick={() => setOpenDlg(true)}><Wallet className="size-4" strokeWidth={2} />Open drawer</Button>} />
        ) : (
          <Table>
            <THead><TR><TH>Shift</TH><TH>Cashier</TH><TH>Branch</TH><TH>Status</TH><TH className="text-right">Float</TH><TH className="text-right">Variance</TH><TH className="text-right">Action</TH></TR></THead>
            <TBody>
              {data.map((d) => (
                <TR key={d.name}>
                  <TD className="whitespace-nowrap">{fullDate(d.shift_date)}</TD>
                  <TD className="text-neutral-900">{d.cashier_name}</TD>
                  <TD className="text-neutral-600">{d.branch}</TD>
                  <TD><Badge variant={d.status === 'Open' ? 'info' : d.status === 'Reconciled' ? 'success' : d.status === 'Disputed' ? 'danger' : 'neutral'}>{d.status}</Badge></TD>
                  <TD className="text-right tabular-nums text-neutral-600">{ksh(d.opening_float)}</TD>
                  <TD className="text-right tabular-nums">
                    {d.status === 'Open' ? <span className="text-neutral-400">—</span> : (
                      <span className={cn(Math.abs(d.variance) < 0.01 ? 'text-success-700' : d.variance_acceptable ? 'text-warning-700' : 'text-danger-700')}>{ksh(d.variance)}</span>
                    )}
                  </TD>
                  <TD className="text-right">{d.status === 'Open' ? <Button variant="secondary" size="sm" onClick={() => setClosing(d)}>Close</Button> : <span className="text-tiny text-neutral-400">—</span>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {openDlg && <OpenDrawerDialog onClose={() => setOpenDlg(false)} />}
      {closing && <CloseDrawerDialog session={closing} onClose={() => setClosing(null)} />}
    </div>
  )
}

function OpenDrawerDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const open = useOpenDrawer()
  const { data: options } = useDrawerOptions()
  const [branch, setBranch] = useState('')
  const [cashier, setCashier] = useState('')
  const [float, setFloat] = useState('')
  const [notes, setNotes] = useState('')

  function submit() {
    if (!branch) return toast({ variant: 'error', title: 'Pick a branch' })
    if (!cashier) return toast({ variant: 'error', title: 'Pick a cashier' })
    open.mutate(
      { branch, cashier, opening_float: Number(float) || 0, opening_notes: notes || undefined },
      { onSuccess: () => { toast({ variant: 'success', title: 'Drawer opened' }); onClose() }, onError: (err) => toast({ variant: 'error', title: 'Could not open', description: err instanceof ApiError ? err.message : undefined }) },
    )
  }

  return (
    <Dialog open onClose={onClose} title="Open cash drawer" description="Start a shift with the opening float." widthClassName="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose} disabled={open.isPending}>Cancel</Button><Button onClick={submit} disabled={open.isPending}>{open.isPending ? 'Opening…' : 'Open'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Branch</Label><Select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Select…</option>{(options?.branches ?? []).map((b) => <option key={b} value={b}>{b}</option>)}</Select></div>
          <div><Label>Cashier</Label><Select value={cashier} onChange={(e) => setCashier(e.target.value)}><option value="">Select…</option>{(options?.cashiers ?? []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></div>
        </div>
        <div><Label>Opening float (KSh)</Label><Input type="number" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" autoFocus /></div>
        <div><Label>Notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
    </Dialog>
  )
}

function CloseDrawerDialog({ session, onClose }: { session: CashSession; onClose: () => void }) {
  const { toast } = useToast()
  const close = useCloseDrawer()
  const { data: options } = useDrawerOptions()
  const [counted, setCounted] = useState('')
  const [expectedSales, setExpectedSales] = useState('')
  const [txns, setTxns] = useState('')
  const [drops, setDrops] = useState('')
  const [pickups, setPickups] = useState('')
  const [explanation, setExplanation] = useState('')
  const [witness, setWitness] = useState('')

  const threshold = options?.variance_threshold ?? 0
  const expectedTotal = session.opening_float + (Number(expectedSales) || 0)
  const liveVariance = counted === '' ? null : (Number(counted) || 0) - expectedTotal
  const overThreshold = liveVariance !== null && Math.abs(liveVariance) > threshold
  const needsExtra = overThreshold && (!explanation.trim() || !witness)

  function submit() {
    if (counted === '') return toast({ variant: 'error', title: 'Enter the counted cash' })
    if (needsExtra)
      return toast({ variant: 'error', title: 'Explanation & witness required', description: `Variance over ${ksh(threshold)} needs both to close (dual control).` })
    close.mutate(
      {
        session_name: session.name,
        actual_cash_counted: Number(counted),
        expected_cash_sales: expectedSales === '' ? undefined : Number(expectedSales),
        transaction_count: txns === '' ? undefined : Number(txns),
        cash_drops: drops === '' ? undefined : Number(drops),
        cash_pickups: pickups === '' ? undefined : Number(pickups),
        variance_explanation: explanation || undefined,
        supervisor_witness: witness || undefined,
      },
      {
        onSuccess: (r) => {
          toast({ variant: r.variance_acceptable ? 'success' : 'warning', title: `Closed · variance ${ksh(r.variance)}`, description: r.variance_acceptable ? 'Within threshold' : 'Exceeds threshold — review' })
          onClose()
        },
        onError: (err) => toast({ variant: 'error', title: 'Could not close', description: err instanceof ApiError ? err.message : undefined }),
      },
    )
  }

  return (
    <Dialog open onClose={onClose} title="Close drawer" description={`${session.cashier_name} · ${session.branch} · float ${ksh(session.opening_float)}`} widthClassName="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose} disabled={close.isPending}>Cancel</Button><Button onClick={submit} disabled={close.isPending || needsExtra}>{close.isPending ? 'Closing…' : 'Close & reconcile'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Expected cash sales</Label><Input type="number" value={expectedSales} onChange={(e) => setExpectedSales(e.target.value)} placeholder="0" /></div>
          <div><Label>Transactions</Label><Input type="number" value={txns} onChange={(e) => setTxns(e.target.value)} placeholder="0" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Cash drops</Label><Input type="number" value={drops} onChange={(e) => setDrops(e.target.value)} placeholder="0" /></div>
          <div><Label>Cash pickups</Label><Input type="number" value={pickups} onChange={(e) => setPickups(e.target.value)} placeholder="0" /></div>
        </div>
        <div>
          <Label>Actual cash counted</Label>
          <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" autoFocus />
        </div>
        <div className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2.5 text-small">
          <div className="flex justify-between text-neutral-600"><span>Expected (float + sales)</span><span className="tabular-nums">{ksh(expectedTotal)}</span></div>
          {liveVariance !== null && (
            <div className={cn('flex justify-between font-medium mt-1', Math.abs(liveVariance) < 0.01 ? 'text-success-700' : 'text-warning-700')}>
              <span>Variance</span><span className="tabular-nums">{ksh(liveVariance)}</span>
            </div>
          )}
        </div>
        {liveVariance !== null && Math.abs(liveVariance) > 0 && (
          <div>
            <Label>
              Variance explanation
              {overThreshold && <span className="text-danger-500 ml-0.5">*</span>}
            </Label>
            <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Why is there a discrepancy?" aria-invalid={overThreshold && !explanation.trim()} />
            {overThreshold && (
              <p className="mt-1 text-tiny text-danger-700">
                Variance exceeds the {ksh(threshold)} threshold — explanation and a supervisor witness are required (dual control).
              </p>
            )}
          </div>
        )}
        {overThreshold && (
          <div>
            <Label>Supervisor witness<span className="text-danger-500 ml-0.5">*</span></Label>
            <Select value={witness} onChange={(e) => setWitness(e.target.value)} aria-invalid={!witness}>
              <option value="">Select a witness…</option>
              {(options?.cashiers ?? []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function Kpi({ label, value, loading, tone }: { label: string; value: string; loading?: boolean; tone?: 'info' | 'warning' }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-small text-neutral-500 mb-1">{label}</div>
        {loading ? <Skeleton className="h-7 w-16" /> : <div className={cn('text-h2 font-semibold tabular-nums', tone === 'info' && 'text-info-700', tone === 'warning' && 'text-warning-700', !tone && 'text-neutral-900')}>{value}</div>}
      </CardContent>
    </Card>
  )
}
