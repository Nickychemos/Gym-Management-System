import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { fullDate, ksh } from '@/lib/format'
import { refundVariant } from '@/lib/status'
import { type RefundAction, useRefundTransition } from '@/queries/refunds'
import { type RefundRow } from '@/lib/types'

interface Props {
  refund: RefundRow | null
  onClose: () => void
}

/** A button the workflow offers in the current state. */
interface ActionDef {
  action: RefundAction
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  needsReason?: boolean
}

function actionsFor(status: string): ActionDef[] {
  switch (status) {
    case 'Draft':
      return [{ action: 'submit', label: 'Submit for approval' }]
    case 'Pending Manager':
      return [
        { action: 'approveManager', label: 'Approve' },
        { action: 'reject', label: 'Reject', variant: 'danger', needsReason: true },
      ]
    case 'Pending Owner':
      return [
        { action: 'approveOwner', label: 'Approve (owner)' },
        { action: 'reject', label: 'Reject', variant: 'danger', needsReason: true },
      ]
    case 'Approved':
      return [{ action: 'initiate', label: 'Initiate refund' }]
    case 'Refund Initiated':
      return [
        { action: 'complete', label: 'Mark refunded' },
        { action: 'fail', label: 'Mark failed', variant: 'danger', needsReason: true },
      ]
    default:
      return []
  }
}

export function RefundDrawer({ refund, onClose }: Props) {
  const { toast } = useToast()
  const transition = useRefundTransition()
  const [reason, setReason] = useState('')

  if (!refund) return null
  const actions = actionsFor(refund.status)
  const terminal = actions.length === 0

  function run(def: ActionDef) {
    if (!refund) return
    if (def.needsReason && !reason.trim()) {
      toast({ variant: 'error', title: 'A reason is required' })
      return
    }
    const args = def.needsReason ? { reason } : undefined
    transition.mutate(
      { refund: refund.name, action: def.action, args },
      {
        onSuccess: (res) => {
          toast({ variant: 'success', title: `Now ${res.new_status}` })
          setReason('')
          onClose()
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Action failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  const needsReason = actions.some((a) => a.needsReason)

  return (
    <Drawer
      open={!!refund}
      onClose={onClose}
      title={refund.name}
      description={`${refund.customer_name} · ${refund.refund_reason}`}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Badge variant={refundVariant(refund.status)}>{refund.status}</Badge>
          {terminal && (
            <span className="text-tiny text-neutral-400">No further actions</span>
          )}
        </div>

        <dl className="space-y-2.5">
          <Row label="Refund amount">
            <span className="font-medium tabular-nums">
              {ksh(refund.requested_refund_amount)}
            </span>
            <span className="text-neutral-400">
              {' '}
              of {ksh(refund.original_amount_paid)}
            </span>
          </Row>
          <Row label="Method">{refund.refund_method}</Row>
          <Row label="Source">{refund.source_type}</Row>
          <Row label="Branch">{refund.branch ?? '—'}</Row>
          <Row label="Requested">{fullDate(refund.requested_on)}</Row>
        </dl>

        {needsReason && (
          <div>
            <Label htmlFor="reason">Reason (for reject / fail)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required when rejecting or marking failed…"
            />
          </div>
        )}

        {!terminal && (
          <div className="flex flex-wrap gap-2 pt-1">
            {actions.map((a) => (
              <Button
                key={a.action}
                variant={a.variant === 'danger' ? 'danger' : a.variant ?? 'primary'}
                onClick={() => run(a)}
                disabled={transition.isPending}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between text-small">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{children}</dd>
    </div>
  )
}
