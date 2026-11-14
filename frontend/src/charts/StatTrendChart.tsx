/**
 * The science team's vegetation-fire trend for a country (2018–2024): yearly counts, Sen's slope
 * and the significance test, all exactly as the backend sends them.
 */
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { StatTrend } from '../shared/types'

const compact = (v: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

export default function StatTrendChart({ t }: { t: StatTrend }) {
  const significant = /^statistically significant/i.test(t.significance) || (Number.isFinite(t.pValue) && t.pValue < 0.05 && !/not/i.test(t.significance))
  const first = t.series[0].year, last = t.series[t.series.length - 1].year
  const tick = { fill: 'var(--color-dim)', fontSize: 11 }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-[12px] ${significant ? 'border-ok/50 bg-ok/10 text-ok' : 'border-line text-dim'}`}>
          {t.direction || 'Trend'}
        </span>
        <span className="text-[12.5px] text-dim">
          {t.significance}
          {Number.isFinite(t.pValue) && `, p = ${t.pValue < 0.001 ? '<0.001' : t.pValue.toFixed(3)}`}
        </span>
      </div>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={t.series} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
            <XAxis dataKey="year" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={compact} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: 'rgb(9 11 15 / 0.95)', border: '1px solid var(--color-line)', fontSize: 12 }}
              formatter={(v) => [Number(v).toLocaleString(), 'Fires']}
            />
            <Line type="monotone" dataKey="count" stroke="var(--color-cyan)" strokeWidth={2} dot={{ r: 2.5, fill: 'var(--color-cyan)' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1.5 text-[12.5px] text-dim">
        Vegetation fires per year, {first} to {last}.
        {Number.isFinite(t.slope) && ` Sen’s slope ${t.slope >= 0 ? '+' : '−'}${Math.round(Math.abs(t.slope)).toLocaleString()} a year.`} Science team analysis.
      </p>
    </div>
  )
}
