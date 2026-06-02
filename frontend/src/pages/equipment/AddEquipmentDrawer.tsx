import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/lib/api'
import { useCreateEquipment, useEquipmentCategories } from '@/queries/equipment'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (asset: string) => void
}

export function AddEquipmentDrawer({ open, onClose, onCreated }: Props) {
  const { toast } = useToast()
  const create = useCreateEquipment()
  const { data: categories } = useEquipmentCategories()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Cardio')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [cost, setCost] = useState('')

  function reset() {
    setName('')
    setCategory('Cardio')
    setPurchaseDate('')
    setCost('')
  }
  function close() {
    reset()
    onClose()
  }

  function submit() {
    if (!name.trim()) return toast({ variant: 'error', title: 'Name the equipment' })
    create.mutate(
      {
        asset_name: name,
        category,
        purchase_date: purchaseDate || undefined,
        cost: cost ? Number(cost) : undefined,
      },
      {
        onSuccess: (res) => {
          toast({ variant: 'success', title: 'Equipment registered', description: name })
          reset()
          onCreated(res.asset)
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: 'Could not register equipment',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Add Equipment"
      description="Register a machine in your equipment inventory."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Registering…' : 'Add Equipment'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="eqname">Name</Label>
          <Input
            id="eqname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Treadmill #4"
            autoFocus
          />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {(categories ?? ['Cardio', 'Strength', 'Free Weights', 'Functional', 'Other']).map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Purchase date</Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Cost (KSh)</Label>
            <Input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </div>
    </Drawer>
  )
}
