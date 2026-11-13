/**
 * OWNER: Agent B. B5 — weekly cycle. Bars show each weekday vs the weekly mean (the 0 line),
 * so a weekend dip is visible without stretching the axis. "Nature has no weekends."
 */
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtInt } from '../ui/data'
import { weekendDip } from './stats'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeeklyChart({ counts }: { counts: number[] }) {
  const mean = counts.reduce((a, b) => a + b, 0) / (counts.length || 1)
  const data = counts.map((c, i) => ({ day: DAYS[i], count: c, dev: mean ? ((c - mean) / mean) * 100 : 0 }))
  const ext = Math.max(2, ...data.map((d) => Math.abs(d.dev))) * 1.15
  const tickV = Math.max(1, Math.round(ext / 1.15))
  const dip = weekendDip(counts)

  return (
    <div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <XAxis dataKey="day" tick={{ fill: 'var(--color-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[-ext, ext]}
              tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`}
              tick={{ fill: 'var(--color-dim)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              ticks={[-tickV, 0, tickV]}
            />
            <ReferenceLine y={0} stroke="var(--color-dim)" strokeDasharray="3 3" />
            <Tooltip
              cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="panel px-2 py-1 font-mono text-[11px]">
                    {payload[0].payload.day}: {fmtInt(payload[0].payload.count)} / day
                    <div className="text-dim">
                      {payload[0].payload.dev >= 0 ? '+' : ''}
                      {payload[0].payload.dev.toFixed(1)}% vs mean
                    </div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="dev" radius={[2, 2, 2, 2]} animationDuration={500}>
              {data.map((d, i) => (
                <Cell key={d.day} fill={i >= 5 ? 'var(--color-warn)' : 'var(--color-cyan)'} fillOpacity={i >= 5 ? 0.85 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-dim">Nature has no weekends.</span>
        <span className="font-mono">
          weekend <span className={dip < -3 ? 'text-warn' : 'text-dim'}>{dip >= 0 ? '+' : ''}{dip.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  )
}
