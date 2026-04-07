/**
 * DialKit-style live panel for scroll tunnel motion (vanilla DOM).
 * Tune momentum, wheel gain, horizontal direction scroll, recycle distance, etc.
 */

export const motionDials = {
  /** Wheel deltaY → Z velocity impulse */
  wheelGain: 0.5,
  zVelMin: -60,
  zVelMax: 70,
  /** Wheel deltaX → lateral scrollXVel impulse */
  horizontalScrollGain: 0.025,
  /** Clamp |scrollXVel| (world units/sec) */
  horizontalVelMax: 20,
  /** Per-frame decay (1 = no decay) */
  momentumDecay: 0.888,
  /** Snap scroll velocities to 0 below this (0 = never snap, decay only) */
  momentumCutoff: 0,
  /** Negate native deltaX before horizontal gain (left/right strafe) */
  invertScrollX: true,
  /** Flip scroll-into-screen vs out (depth / deltaY) */
  invertScrollZ: false,
  maxDt: 0.05,
  /** camera.z + this = plane recycle threshold */
  recycleAhead: 2.2,
  /** When a plane wraps to the far end of the tunnel, entrance animation duration (seconds) */
  tunnelSpawnDuration: 0.6,
  /** World Y offset: plane starts this far below its final Y, then springs up */
  tunnelSpawnYOffset: 2.5,
  /**
   * After a plane wraps in Z, add this to world z (positive = spawn the “back” row closer to the camera).
   * Larger = far-end images appear at a shallower depth.
   */
  tunnelRecycleZCloser: 20,
}

type DialKey = keyof typeof motionDials

/** Hover (title) copy for each dial — what it feeds in `main.ts` / the sim loop. */
const DIAL_TOOLTIPS: Record<DialKey, string> = {
  wheelGain:
    'Multiplier on raw wheel / trackpad deltaY each tick. Higher = stronger impulse along Z (forward / back through the tunnel) for the same physical scroll.',
  zVelMin:
    'Lower clamp for scrollZVel (along-Z speed, world units/sec). Prevents excessive reverse motion when flicking the wheel up.',
  zVelMax:
    'Upper clamp for scrollZVel. Caps how fast planes can rush toward you after strong scroll input.',
  horizontalScrollGain:
    'Multiplier on wheel / trackpad deltaX each event. Higher = stronger lateral momentum (left–right “direction” on screen).',
  horizontalVelMax:
    'Upper bound on |scrollXVel| (camera strafe speed in world units/sec).',
  momentumDecay:
    'Per-frame multiplier applied to scrollZVel and scrollXVel after each frame (e.g. 0.94 ≈ 6% loss per frame). Closer to 1 = longer glide; lower = snappier stop.',
  momentumCutoff:
    'If |scrollZVel| or |scrollXVel| drops below this after decay, it snaps to zero. Set to 0 to disable snapping (velocities decay smoothly toward zero only).',
  invertScrollX:
    'When on, negates raw trackpad/wheel deltaX before the horizontal gain (inverts left/right strafe only). Does not change vertical depth scroll.',
  invertScrollZ:
    'When on, negates vertical wheel input before it is added to scrollZVel. Use if “into the screen” feels backwards for your device.',
  maxDt:
    'Caps delta time per frame (seconds). Stops huge jumps after a tab switch or hitch; slightly lower can feel more stable.',
  recycleAhead:
    'When a plane’s world Z passes camera.z + this value, it is recycled to the far end of the tunnel. Larger = planes disappear later (closer to you before wrapping).',
  tunnelSpawnDuration:
    'Length of the scale + slide-in animation when a plane respawns at the back of the tunnel (seconds).',
  tunnelSpawnYOffset:
    'How far below (in world Y) the plane starts before animating up into place. Larger = more vertical travel.',
  tunnelRecycleZCloser:
    'Added to world Z after a plane wraps to the far end (positive moves spawns toward the camera / less negative depth). 0 = original tunnel length only.',
}

const defaults = { ...motionDials }

function row(
  label: string,
  input: HTMLElement,
  valueEl: HTMLSpanElement,
  tooltip: string,
): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'dialkit__row dialkit__row--tipped'
  wrap.title = tooltip
  const lab = document.createElement('label')
  lab.className = 'dialkit__label'
  lab.title = tooltip
  lab.append(document.createTextNode(label + ' '), makeInfoIcon(tooltip))
  if (input.id) lab.htmlFor = input.id
  const ctrl = document.createElement('div')
  ctrl.className = 'dialkit__ctrl'
  ctrl.title = tooltip
  input.title = tooltip
  ctrl.append(input, valueEl)
  wrap.append(lab, ctrl)
  return wrap
}

function makeInfoIcon(tooltip: string): HTMLSpanElement {
  const s = document.createElement('span')
  s.className = 'dialkit__info'
  s.textContent = 'ⓘ'
  s.title = tooltip
  s.setAttribute('aria-hidden', 'true')
  return s
}

function formatVal(key: DialKey, v: number | boolean): string {
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  if (
    key === 'wheelGain' ||
    key === 'horizontalScrollGain' ||
    key === 'maxDt'
  )
    return v.toFixed(4)
  if (key === 'momentumDecay') return v.toFixed(3)
  if (key === 'recycleAhead' || key === 'momentumCutoff') return v.toFixed(2)
  if (key === 'tunnelSpawnDuration') return v.toFixed(2)
  if (key === 'tunnelSpawnYOffset' || key === 'tunnelRecycleZCloser') return v.toFixed(1)
  return String(v)
}

export function mountDialKitPanel(host: HTMLElement): void {
  host.className = 'dialkit'
  host.innerHTML = `
    <button type="button" class="dialkit__toggle" aria-expanded="true" aria-controls="dialkit-panel">
      <span class="dialkit__toggle-title">Motion dials</span>
      <span class="dialkit__chev" aria-hidden="true">▼</span>
    </button>
    <div id="dialkit-panel" class="dialkit__panel"></div>
  `

  const panel = host.querySelector<HTMLDivElement>('#dialkit-panel')!
  const toggle = host.querySelector<HTMLButtonElement>('.dialkit__toggle')!

  const copyBar = document.createElement('div')
  copyBar.className = 'dialkit__copyBar'

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'dialkit__copy'
  copyBtn.textContent = 'Copy settings'
  copyBtn.title =
    'Copies every dial value as JSON (pretty-printed). Paste into a note, chat, or code to save or share this configuration.'

  async function copyAllSettings() {
    const text = JSON.stringify({ ...motionDials }, null, 2)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('aria-hidden', 'true')
      document.body.append(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    const prev = copyBtn.textContent
    copyBtn.textContent = 'Copied!'
    window.setTimeout(() => {
      copyBtn.textContent = prev
    }, 1800)
  }

  copyBtn.addEventListener('click', () => {
    void copyAllSettings()
  })

  copyBar.append(copyBtn)
  panel.append(copyBar)

  function addSection(title: string) {
    const h = document.createElement('div')
    h.className = 'dialkit__section'
    h.textContent = title
    panel.append(h)
  }

  function bindRange(
    key: DialKey,
    label: string,
    min: number,
    max: number,
    step: number,
  ) {
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.dataset.dialKey = key
    input.value = String(motionDials[key] as number)
    const val = document.createElement('span')
    val.className = 'dialkit__value'
    val.textContent = formatVal(key, motionDials[key] as number)

    input.addEventListener('input', () => {
      const n = parseFloat(input.value)
      ;(motionDials as Record<string, number | boolean | string>)[key] = n
      val.textContent = formatVal(key, n)
    })

    input.id = `dial-${String(key)}`
    panel.append(row(label, input, val, DIAL_TOOLTIPS[key]))
  }

  function bindToggle(key: 'invertScrollX' | 'invertScrollZ', label: string) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.dataset.dialKey = key
    input.id = `dial-${String(key)}`
    input.checked = motionDials[key]
    const val = document.createElement('span')
    val.className = 'dialkit__value'
    val.textContent = formatVal(key, motionDials[key])

    input.addEventListener('change', () => {
      motionDials[key] = input.checked
      val.textContent = formatVal(key, input.checked)
    })

    panel.append(row(label, input, val, DIAL_TOOLTIPS[key]))
  }

  addSection('Scroll & momentum')
  bindRange('wheelGain', 'Wheel gain (depth)', 0.002, 0.045, 0.001)
  bindRange('zVelMin', 'Z vel min', -20, 0, 0.25)
  bindRange('zVelMax', 'Z vel max', 0, 30, 0.25)
  bindRange('horizontalScrollGain', 'Horizontal gain', 0.002, 0.045, 0.001)
  bindRange('horizontalVelMax', 'Horizontal vel max', 0, 30, 0.25)
  bindRange('momentumDecay', 'Momentum decay', 0.85, 0.999, 0.001)
  bindRange('momentumCutoff', 'Stop threshold', 0, 0.15, 0.005)
  bindToggle('invertScrollX', 'Invert scroll X')
  bindToggle('invertScrollZ', 'Invert scroll Z')

  addSection('Sim')
  bindRange('maxDt', 'Max Δt (cap)', 0.01, 0.12, 0.005)
  bindRange('recycleAhead', 'Recycle ahead', 0, 8, 0.1)

  addSection('Tunnel spawn')
  bindRange('tunnelRecycleZCloser', 'Far spawn closer (+Z)', 0, 45, 0.5)
  bindRange('tunnelSpawnDuration', 'Spawn duration (s)', 0.1, 1.5, 0.05)
  bindRange('tunnelSpawnYOffset', 'Spawn Y offset', 0.2, 8, 0.1)

  const actions = document.createElement('div')
  actions.className = 'dialkit__actions'

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'dialkit__reset'
  reset.textContent = 'Reset defaults'
  reset.title =
    'Restores all dials to the values from when the page loaded (the built-in defaults snapshot).'

  reset.addEventListener('click', () => {
    Object.assign(motionDials, defaults)
    panel.querySelectorAll<HTMLInputElement>('[data-dial-key]').forEach((el) => {
      const k = el.dataset.dialKey as DialKey
      const valEl = el.parentElement?.querySelector<HTMLSpanElement>('.dialkit__value')
      if (el.type === 'checkbox') {
        el.checked = motionDials[k] as boolean
        if (valEl) valEl.textContent = formatVal(k, motionDials[k] as boolean)
      } else {
        el.value = String(motionDials[k])
        if (valEl) valEl.textContent = formatVal(k, motionDials[k] as number)
      }
    })
  })

  actions.append(reset)
  panel.append(actions)

  let open = true
  toggle.addEventListener('click', () => {
    open = !open
    toggle.setAttribute('aria-expanded', String(open))
    panel.hidden = !open
    host.querySelector('.dialkit__chev')!.textContent = open ? '▼' : '▶'
  })
}
