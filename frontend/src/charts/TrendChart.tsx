/** OWNER: Agent B. B6 — raw vs corrected fire-activity trend, uncertainty band, verdict badge. */
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Mode, TrendPoint } from '../shared/types'
import { pctPerDecade } from './stats'

const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

interface Props {
  trend: TrendPoint[]
  year: number
  mode: Mode
  survives: boolean
  verdict: string
}

export default function TrendChart({ trend, year, mode, survives, verdict }: Props) {
  const data = trend.map((t) => ({ ...t, band: [t.lo, t.hi] as [number, number] }))
  const rawSlope = pctPerDecade(trend.map((t) => ({ x: t.year, y: t.raw })))
  const corSlope = pctPerDecade(trend.map((t) => ({ x: t.year, y: t.corrected })))
  const rawOn = mode !== 'harmonized'
  const corOn = mode !== 'legacy'
  const tick = { fill: 'var(--color-dim)', fontSize: 11 }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-[12px] ${
            survives ? 'border-ok/50 bg-ok/10 text-ok' : 'border-warn/50 bg-warn/10 text-warn'
          }`}
        >
          {survives ? 'Trend holds after correction' : 'Trend changes after correction'}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} ticks={[2001, 2006, 2012, 2018, 2025]} tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} tickCount={4} domain={['auto', 'auto']} />
            <ReferenceLine x={2012} stroke="var(--color-line)" strokeDasharray="2 3" label={{ value: 'VIIRS era', position: 'insideTopLeft', fill: 'var(--color-dim)', fontSize: 10 }} />
            <ReferenceLine x={year} stroke="var(--color-text)" strokeOpacity={0.35} />
            <Area dataKey="band" stroke="none" fill="var(--color-cyan)" fillOpacity={corOn ? 0.16 : 0.06} isAnimationActive={false} />
            <Line dataKey="raw" stroke="var(--color-fire)" strokeWidth={rawOn ? 2 : 1} strokeOpacity={rawOn ? 1 : 0.35} dot={false} animationDuration={500} />
            <Line dataKey="corrected" stroke="var(--color-cyan)" strokeWidth={corOn ? 2 : 1} strokeOpacity={corOn ? 1 : 0.35} dot={false} animationDuration={500} />
            <Tooltip
              cursor={{ stroke: 'var(--color-line)' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (TrendPoint & { band: number[] }) | undefined
                return active && p ? (
                  <div className="panel px-2 py-1 text-[12px]">
                    <div className="text-dim">{p.year}</div>
                    <div className="text-fire">raw {p.raw}</div>
                    <div className="text-cyan">
                      corrected {p.corrected} <span className="text-dim">[{p.lo}–{p.hi}]</span>
                    </div>
                  </div>
                ) : null
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <span className="inline-block h-0.5 w-3 bg-fire align-middle" /> <span className="text-dim">Raw</span>{' '}
          <span className="font-mono text-fire">{sign(rawSlope)}</span> <span className="text-dim">per decade</span>
        </div>
        <div className="text-right">
          <span className="inline-block h-0.5 w-3 bg-cyan align-middle" /> <span className="text-dim">Corrected</span>{' '}
          <span className="font-mono text-cyan">{sign(corSlope)}</span> <span className="text-dim">per decade</span>
        </div>
      </div>
      <p className="mt-1.5 text-[13px] text-text/85">{verdict}</p>
    </div>
  )
}
