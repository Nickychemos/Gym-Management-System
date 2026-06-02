import { useState } from 'react'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/context/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api'
import { type AssetOption } from '@/lib/types'
import { useAssets, useCreateTicket } from '@/queries/equipment'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const TYPES = ['Breakdown', 'Preventive', 'Cosmetic', 'Calibration', 'Other']

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-selected machine (from an equipment detail page); hides the picker. */
  presetAsset?: AssetOption | null
}

export function CreateTicketDrawer({ open, onClose, presetAsset }: Props) {
  const { toast } = useToast()
  const create = useCreateTicket()
  const [asset, setAsset] = useState<AssetOption | null>(presetAsset ?? null)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [type, setType] = useState('Breakdown')
  const [description, setDescription] = useState('')
  const [oos, setOos] = useState(false)

  function reset() {
    setAsset(presetAsset ?? null)
    setTitle('')
    setPriority('Medium')
    setType('Breakdown')
    setDescription('')
    setOos(false)
  }
  function close() {
    reset()
    onClose()
  }

  function submit() {
    if (!asset) return toast({ variant: 'error', title: 'Pick the equipment' })
    if (!title.trim()) return toast({ variant: 'error', title: 'Add a title' })
    create.mutate(
      {
        title,
        asset: asset.name,
        priority,
        ticket_type: type,
        description: description || undefined,
        out_of_service: oos,
      },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Ticket raised' })
          reset()
          onClose()
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not raise ticket',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Report an issue"
      description="Raise a maintenance ticket against a piece of equipment."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Raising…' : 'Raise ticket'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Equipment</Label>
          {asset ? (
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2">
              <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">
                {asset.asset_name}
                {asset.location && (
                  <span className="text-neutral-400"> · {asset.location}</span>
                )}
              </span>
              {!presetAsset && (
                <Button variant="ghost" size="sm" onClick={() => setAsset(null)}>
                  Change
                </Button>
              )}
            </div>
          ) : (
            <AssetPicker onPick={setAsset} />
          )}
        </div>

        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Treadmill #4 belt slipping"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Priority</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="desc">Description</Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's wrong?"
          />
        </div>

        <label className="flex items-center gap-2 text-small text-neutral-700">
          <Checkbox checked={oos} onChange={(e) => setOos(e.target.checked)} />
          Take equipment out of service
        </label>
      </div>
    </Drawer>
  )
}

function AssetPicker({ onPick }: { onPick: (a: AssetOption) => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 250)
  const { data, isLoading } = useAssets(debounced)
  const results = data ?? []

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" strokeWidth={2} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search equipment…"
          className="pl-9"
        />
      </div>
      {!isLoading && results.length === 0 && (
        <p className="mt-2 text-tiny text-neutral-500">
          No assets found. Equipment must be registered as an Asset in ERPNext first.
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-52 overflow-y-auto">
          {results.map((a) => (
            <li key={a.name}>
              <button
                type="button"
                onClick={() => onPick(a)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 transition-colors"
              >
                <span className="flex-1 min-w-0 text-small text-neutral-900 truncate">
                  {a.asset_name}
                </span>
                {a.location && (
                  <span className="text-tiny text-neutral-400">{a.location}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
