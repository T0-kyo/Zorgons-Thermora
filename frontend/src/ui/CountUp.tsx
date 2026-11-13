/** OWNER: Agent B. A number that animates from its previous value to the new one. */
import { useLayoutEffect, useRef } from 'react'
import { animate } from 'framer-motion'

interface Props {
  value: number
  format: (v: number) => string
  duration?: number
  className?: string
}

export default function CountUp({ value, format, duration = 0.9, className }: Props) {
  const el = useRef<HTMLSpanElement>(null)
  const shown = useRef(value) // value currently on screen (mid-animation too)

  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const from = shown.current
    if (from === value) return
    node.textContent = format(from) // avoid a one-frame flash of the final value
    const ctl = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v
        node.textContent = format(v)
      },
    })
    return () => ctl.stop()
    // format is usually an inline function; re-running on it would restart the animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return (
    <span ref={el} className={className}>
      {format(value)}
    </span>
  )
}
