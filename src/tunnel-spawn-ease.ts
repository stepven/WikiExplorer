/**
 * CSS `transition-timing-function: cubic-bezier(x1,y1,x2,y2)` as a GSAP ease.
 * Maps normalized time t ∈ [0,1] to eased progress by inverting Bx(u)=t on the curve
 * from (0,0) to (1,1) with control points (x1,y1) and (x2,y2), then returns By(u).
 *
 * Matches `cubic-bezier(0.15, 1, 0.95, 1.3)` (y2>1 allows slight overshoot).
 */
export function createCssCubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const bx = (u: number) =>
    3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3
  const by = (u: number) =>
    3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3

  return (t: number): number => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2
      if (bx(mid) < t) lo = mid
      else hi = mid
    }
    const u = (lo + hi) / 2
    return by(u)
  }
}

/** Same curve as `cubic-bezier(0.15, 1, 0.95, 1.3)` */
export const tunnelSpawnEase = createCssCubicBezierEase(0.15, 1, 0.95, 1.0)
