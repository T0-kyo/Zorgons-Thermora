/** OWNER: Agent B. Small pure helpers used by the charts and the tour. */

/** Linear-fit trend as % of the series mean per decade. */
export function pctPerDecade(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < 2) return 0
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return my ? ((num / den) * 10 * 100) / my : 0
}

/** Weekend (Sat+Sun) detections vs weekdays (Mon–Fri), in %. Negative = weekend dip. */
export function weekendDip(counts: number[]) {
  const wk = counts.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  const we = (counts[5] + counts[6]) / 2
  return wk > 0 ? ((we - wk) / wk) * 100 : 0
}

/** Area-level wording (team rule): a likelihood for an area, never a label on a single fire. */
export function humanLabel(v: number) {
  if (v >= 0.66) return 'Likely human-driven'
  if (v >= 0.4) return 'Mixed human and natural'
  return 'Likely natural'
}
