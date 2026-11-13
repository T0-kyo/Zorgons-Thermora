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
      <text x={t.x} y={t.y} fill={color} fontSize={8} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  )
}

export default function HumanGauge({ legacy, harmonized, mode }: { legacy: number; harmonized: number; mode: Mode }) {
  const active = mode === 'legacy' ? legacy : harmonized
  const color = mode === 'legacy' ? 'var(--color-fire)' : mode === 'harmonized' ? 'var(--color-cyan)' : 'var(--color-missed)'
  const shift = harmonized - legacy

  return (
    <div>
      <svg viewBox={`0 0 ${W} 124`} className="mx-auto block w-full max-w-[240px]" role="img" aria-label={`Human-influence probability ${active.toFixed(2)}`}>
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
        <text x={CX - R} y={CY + 14} fill="var(--color-dim)" fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)">
          NATURAL
        </text>
        <text x={CX + R} y={CY + 14} fill="var(--color-dim)" fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)">
          HUMAN
        </text>
      </svg>
      <div className="-mt-1 flex items-end justify-between">
        <div>
          <CountUp value={active} format={(v) => v.toFixed(2)} className="font-mono text-2xl tabular-nums" />
          <span className="ml-1 font-mono text-xs text-dim">P(human)</span>
          <div className="text-xs text-dim">{humanLabel(active)}</div>
        </div>
        <div className="text-right">
          <div className="label">correction shifts it</div>
          <div className={`font-mono text-sm ${mode === 'difference' ? 'text-missed' : 'text-text'}`}>
            {legacy.toFixed(2)} → {harmonized.toFixed(2)} ({shift >= 0 ? '+' : ''}
            {shift.toFixed(2)})
          </div>
        </div>
      </div>
    </div>
  )
}
