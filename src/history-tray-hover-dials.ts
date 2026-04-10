/**
 * Defaults for collapsed history-tray mini-stack hover motion (CSS variables on `.history-tray`).
 * The tray lab uses `dialkit`’s `useDialKit` with `HISTORY_TRAY_HOVER_DIAL_CONFIG` — keep ranges in sync with these values.
 */

import type { DialConfig, ResolvedValues } from 'dialkit'

const HOVER_DEFAULTS = {
  transitionMs: 300,
  easeX1: 0.3,
  easeY1: 1.1,
  easeX2: 0.5,
  easeY2: 1,
  liftAll: 11,
  pushAll: 1.06,
  lift0: 11.5,
  push0: 1.07,
  lift1: 9,
  push1: 1.12,
  lift2: 8.5,
  push2: 1.085,
  lift3: 5.5,
  push3: 1.12,
  lift4: 5.5,
  push4: 1.12,
} as const

export const historyTrayHoverDials = { ...HOVER_DEFAULTS }

/**
 * Interface Craft / DialKit panel config — folders match the skill’s nested grouping pattern.
 */
export const HISTORY_TRAY_HOVER_DIAL_CONFIG = {
  transition: {
    durationMs: [HOVER_DEFAULTS.transitionMs, 60, 900, 5],
    easeX1: [HOVER_DEFAULTS.easeX1, 0, 1, 0.01],
    easeY1: [HOVER_DEFAULTS.easeY1, 0, 2, 0.01],
    easeX2: [HOVER_DEFAULTS.easeX2, 0, 1, 0.01],
    easeY2: [HOVER_DEFAULTS.easeY2, 0, 2, 0.01],
  },
  base: {
    lift: [HOVER_DEFAULTS.liftAll, 0, 32, 0.5],
    push: [HOVER_DEFAULTS.pushAll, 0.92, 1.2, 0.005],
  },
  depth0: {
    lift: [HOVER_DEFAULTS.lift0, 0, 32, 0.5],
    push: [HOVER_DEFAULTS.push0, 0.92, 1.25, 0.005],
  },
  depth1: {
    lift: [HOVER_DEFAULTS.lift1, 0, 32, 0.5],
    push: [HOVER_DEFAULTS.push1, 0.92, 1.25, 0.005],
  },
  depth2: {
    lift: [HOVER_DEFAULTS.lift2, 0, 32, 0.5],
    push: [HOVER_DEFAULTS.push2, 0.92, 1.25, 0.005],
  },
  depth3: {
    lift: [HOVER_DEFAULTS.lift3, 0, 32, 0.5],
    push: [HOVER_DEFAULTS.push3, 0.92, 1.25, 0.005],
  },
  depth4: {
    lift: [HOVER_DEFAULTS.lift4, 0, 32, 0.5],
    push: [HOVER_DEFAULTS.push4, 0.92, 1.25, 0.005],
  },
} satisfies DialConfig

export type HistoryTrayHoverDialValues = ResolvedValues<typeof HISTORY_TRAY_HOVER_DIAL_CONFIG>

export function applyHistoryTrayHoverCssVars(trayRoot: HTMLElement): void {
  const d = historyTrayHoverDials
  trayRoot.style.setProperty('--ht-hover-trans-dur', `${d.transitionMs}ms`)
  trayRoot.style.setProperty('--ht-hover-shadow-dur', `${d.transitionMs}ms`)
  trayRoot.style.setProperty(
    '--ht-hover-trans-ease',
    `cubic-bezier(${d.easeX1}, ${d.easeY1}, ${d.easeX2}, ${d.easeY2})`,
  )

  trayRoot.style.setProperty('--ht-hover-lift-all', `${d.liftAll}px`)
  trayRoot.style.setProperty('--ht-hover-push-all', String(d.pushAll))

  const lifts = [d.lift0, d.lift1, d.lift2, d.lift3, d.lift4] as const
  const pushes = [d.push0, d.push1, d.push2, d.push3, d.push4] as const
  for (let i = 0; i < 5; i++) {
    trayRoot.style.setProperty(`--ht-hover-lift-${i}`, `${lifts[i]}px`)
    trayRoot.style.setProperty(`--ht-hover-push-${i}`, String(pushes[i]))
  }
}

/** Apply hover CSS from live `useDialKit` values (History tray hover lab). */
export function applyHistoryTrayHoverFromDialValues(
  trayRoot: HTMLElement,
  p: HistoryTrayHoverDialValues,
): void {
  trayRoot.style.setProperty('--ht-hover-trans-dur', `${p.transition.durationMs}ms`)
  trayRoot.style.setProperty('--ht-hover-shadow-dur', `${p.transition.durationMs}ms`)
  trayRoot.style.setProperty(
    '--ht-hover-trans-ease',
    `cubic-bezier(${p.transition.easeX1}, ${p.transition.easeY1}, ${p.transition.easeX2}, ${p.transition.easeY2})`,
  )

  trayRoot.style.setProperty('--ht-hover-lift-all', `${p.base.lift}px`)
  trayRoot.style.setProperty('--ht-hover-push-all', String(p.base.push))

  const depths = [p.depth0, p.depth1, p.depth2, p.depth3, p.depth4]
  for (let i = 0; i < 5; i++) {
    const depth = depths[i]!
    trayRoot.style.setProperty(`--ht-hover-lift-${i}`, `${depth.lift}px`)
    trayRoot.style.setProperty(`--ht-hover-push-${i}`, String(depth.push))
  }
}
