/** Shared chart constants. Kept out of ChartKit.tsx so that file only exports
 *  components (React Fast Refresh requires component-only modules). */

// Concrete hex values (SVG fills can't read Tailwind classes). Mirror index.css.
export const CHART = {
  ink: '#0f1115', // neutral-900
  accent: '#f97316', // accent-500
  accentSoft: '#ffe8d4', // accent-100
  grid: '#eeefef', // neutral-100
  axis: '#9ca0a8', // neutral-400
} as const

export interface ChartPoint {
  label: string
  value: number
}
