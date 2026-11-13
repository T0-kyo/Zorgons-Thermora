/** OWNER: Agent B. B4 — human-influence gauge: semicircle 0–1 with legacy and harmonized markers. */
import { motion } from 'framer-motion'
import { humanLabel } from './stats'
import type { Mode } from '../shared/types'
import CountUp from '../ui/CountUp'

const W = 220
const CX = 110
const CY = 108
const R = 88
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`
const LEN = Math.PI * R

const pt = (v: number, r = R) => {
  const a = Math.PI * (1 - v)
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}

function Tick({ v, color, label }: { v: number; color: string; label: string }) {
  const a = pt(v, R - 9)
  const b = pt(v, R + 9)
  const t = pt(v, R + 18)
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <text x={t.x} y={t.y} fill={color} fontSize={9} textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </g>
  )
}

export default function HumanGauge({ legacy, harmonized, mode }: { legacy: number; harmonized: number; mode: Mode }) {
  const active = mode === 'legacy' ? legacy : harmonized
  const color = mode === 'legacy' ? 'var(--color-fire)' : mode === 'human' ? 'var(--color-missed)' : 'var(--color-cyan)'
  const shift = harmonized - legacy

  return (
    <div>
      <svg viewBox={`0 0 ${W} 124`} className="mx-auto block w-full max-w-[240px]" role="img" aria-label={`Human likelihood ${active.toFixed(2)}`}>
        <path d={ARC} fill="none" stroke="var(--color-line)" strokeWidth={10} strokeLinecap="round" />
        <motion.path
          d={ARC}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={LEN}
          initial={false}
          animate={{ strokeDashoffset: LEN * (1 - active), stroke: color }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ opacity: 0.85 }}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((v) => {
          const a = pt(v, R - 14)
          const b = pt(v, R - 18)
          return <line key={v} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-dim)" strokeWidth={1} />
        })}
        <Tick v={legacy} color="var(--color-fire)" label="L" />
        <Tick v={harmonized} color="var(--color-cyan)" label="H" />
        <g
          style={{
            transform: `rotate(${active * 180}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transformBox: 'view-box',
            transition: 'transform 0.9s cubic-bezier(0.34, 1.3, 0.5, 1)',
          }}
        >
          <line x1={CX} y1={CY} x2={CX - R + 22} y2={CY} stroke="var(--color-text)" strokeWidth={2} strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r={4} fill="var(--color-text)" />
        <text x={CX - R} y={CY + 15} fill="var(--color-cyan)" fontSize={10} textAnchor="middle" style={{ fontStretch: '72%' }}>
          Natural
        </text>
        <text x={CX + R} y={CY + 15} fill="var(--color-missed)" fontSize={10} textAnchor="middle" style={{ fontStretch: '72%' }}>
          Human
        </text>
      </svg>
      <div className="-mt-1 flex items-end justify-between">
        <div>
          <CountUp value={active} format={(v) => v.toFixed(2)} className="readout text-[28px]" />
          <span className="ml-1.5 text-[12.5px] text-dim">human likelihood</span>
          <div className="text-[12.5px] text-dim">{humanLabel(active)}</div>
        </div>
        <div className="text-right">
          <div className="label">Legacy, then corrected</div>
          <div className="font-mono text-sm">
            <span className="text-fire">{legacy.toFixed(2)}</span>
            <span className="text-dim">, </span>
            <span className={mode === 'human' ? 'text-missed' : 'text-cyan'}>{harmonized.toFixed(2)}</span>
            <span className="ml-1.5 text-dim">
              ({shift >= 0 ? '+' : ''}
              {shift.toFixed(2)})
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
