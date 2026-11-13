/** OWNER: Agent B. B16 — yearly fires since 2001 (harmonized solid, legacy faint), baseline and recent windows shaded. */
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Mode } from '../shared/types'
import { fmtInt } from '../ui/data'

interface Props {
  series: { year: number; legacy: number; harmonized: number }[]
  year: number
  mode: Mode
}

export default function Sparkline({ series, year, mode }: Props) {
  if (series.length < 2) return null
  const first = series[0].year
  const last = series[series.length - 1].year
  const legacyOn = mode === 'legacy'
  const tick = { fill: 'var(--color-dim)', fontSize: 11 }
  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
          <XAxis dataKey="year" type="number" domain={[first, last]} ticks={[first, 2012, last]} tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickCount={3} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <ReferenceArea x1={first} x2={first + 2} fill="var(--color-text)" fillOpacity={0.06} />
          <ReferenceArea x1={last - 2} x2={last} fill="var(--color-text)" fillOpacity={0.06} />
          <ReferenceLine x={year} stroke="var(--color-text)" strokeOpacity={0.35} />
          <Line dataKey="legacy" stroke="var(--color-fire)" strokeWidth={legacyOn ? 2 : 1} strokeOpacity={legacyOn ? 1 : 0.45} dot={false} animationDuration={500} />
          <Line dataKey="harmonized" stroke="var(--color-cyan)" strokeWidth={legacyOn ? 1 : 2} strokeOpacity={legacyOn ? 0.45 : 1} dot={false} animationDuration={500} />
          <Tooltip
            cursor={{ stroke: 'var(--color-line)' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as Props['series'][number] | undefined
              return active && p ? (
                <div className="panel px-2 py-1 text-[12px]">
                  <div className="text-dim">{p.year}</div>
                  <div className="text-cyan">
                    Harmonized <span className="font-mono">{fmtInt(p.harmonized)}</span>
                  </div>
                  <div className="text-fire">
                    Legacy <span className="font-mono">{fmtInt(p.legacy)}</span>
                  </div>
                </div>
              ) : null
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
