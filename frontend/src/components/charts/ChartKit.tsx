import { type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CHART, type ChartPoint } from './theme'

/**
 * Themed Recharts wrappers. All chart usage in the app funnels through here so
 * every chart matches the brand (ink series, warm-orange highlight, neutral
 * gridlines) and so Recharts stays in a single lazily-loaded chunk.
 */

interface TipProps {
  active?: boolean
  payload?: { value: number; payload: ChartPoint }[]
  label?: string
  format?: (n: number) => string
}

function ChartTooltip({ active, payload, label, format }: TipProps) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 shadow-[var(--shadow-overlay)]">
      <div className="text-tiny text-neutral-500">{label}</div>
      <div className="text-small font-semibold tabular-nums text-neutral-900">
        {format ? format(v) : v}
      </div>
    </div>
  )
}

interface TrendChartProps {
  data: ChartPoint[]
  height?: number
  color?: string
  /** Show every Nth x-axis tick to avoid crowding (default: all). */
  tickInterval?: number
  format?: (n: number) => string
}

/** Single-series area chart over time (visit frequency, spend). */
export function TrendChart({
  data,
  height = 160,
  color = CHART.accent,
  tickInterval,
  format,
}: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          interval={tickInterval ?? 'preserveStartEnd'}
          minTickGap={8}
        />
        <YAxis
          width={28}
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: CHART.grid }}
          content={<ChartTooltip format={format} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill="url(#trendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface MiniBarsProps {
  data: ChartPoint[]
  height?: number
  color?: string
  /** Highlight the tallest bar in accent; others stay ink. */
  highlightMax?: boolean
  format?: (n: number) => string
}

/** Small categorical bar chart (weekday pattern, status breakdown). */
export function MiniBars({
  data,
  height = 150,
  color = CHART.ink,
  highlightMax = false,
  format,
}: MiniBarsProps) {
  const max = Math.max(...data.map((d) => d.value), 0)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
        />
        <YAxis
          width={28}
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: CHART.grid, fillOpacity: 0.5 }}
          content={<ChartTooltip format={format} />}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={highlightMax && d.value === max && max > 0 ? CHART.accent : color}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** A simple horizontal proportion bar (e.g. PT utilisation). */
export function ProgressBar({
  pct,
  children,
}: {
  pct: number
  children?: ReactNode
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-neutral-900 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {children}
    </div>
  )
}
