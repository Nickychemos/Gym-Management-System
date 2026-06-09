import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'

import { type BranchSummary, useBranchContext } from '@/queries/branches'

/** Sentinel for the managers' "All branches" view (matches the backend). */
export const ALL_BRANCHES = '__all__'
const STORAGE_KEY = 'benisho:branch'

interface BranchState {
  /** Selected branch name, or ALL_BRANCHES for the aggregate view. */
  selected: string
  /** Value to pass to branch-aware queries (undefined = all branches). */
  branchParam: string | undefined
  /** Whether the user may switch branches (owners/managers). */
  canSwitch: boolean
  /** Whether the gym has more than one branch (else hide all branch pickers). */
  multiBranch: boolean
  /** Branches the user may pick from. */
  branches: BranchSummary[]
  setBranch: (branch: string) => void
}

const BranchCtx = createContext<BranchState | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: ctx } = useBranchContext()
  const [picked, setPicked] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Effective selection is derived each render (no effect-driven state sync):
  // restricted staff are pinned to their branch; managers use their saved pick
  // (or All). While the context loads we fall back to All.
  let selected: string
  if (ctx && !ctx.can_switch) {
    selected = ctx.default ?? ALL_BRANCHES
  } else {
    selected = picked ?? ALL_BRANCHES
  }

  function setBranch(branch: string) {
    setPicked(branch)
    try {
      localStorage.setItem(STORAGE_KEY, branch)
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }

  const value: BranchState = {
    selected,
    branchParam: selected === ALL_BRANCHES ? undefined : selected,
    canSwitch: ctx?.can_switch ?? false,
    multiBranch: ctx?.multi_branch ?? false,
    branches: ctx?.branches ?? [],
    setBranch,
  }

  return <BranchCtx.Provider value={value}>{children}</BranchCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider, matching AuthContext
export function useBranch(): BranchState {
  const ctx = useContext(BranchCtx)
  if (!ctx) throw new Error('useBranch must be used within a BranchProvider')
  return ctx
}
