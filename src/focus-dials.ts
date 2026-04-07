/**
 * DialKit-style panel for click-to-focus camera animation (GSAP).
 */

export const focusDials = {
  /** World distance from camera to mesh center after focus — sets apparent image size */
  cameraToMeshDistance: 2.5,
  /** GSAP tween duration (seconds) */
  duration: 0.8,
  /** GSAP ease string (see https://gsap.com/docs/v3/Eases/) */
  ease: 'power2.inOut' as string,
  /** Minimum gap in px between top of focused image and top of screen */
  padTopPx: 32,
  /** Gap in px between bottom of focused image and top of the info card */
  padBotPx: 24,
  /** Estimated height in px of the info card shown below the focused image */
  infoCardPx: 220,
}

export const FOCUS_EASE_OPTIONS = [
  'none',
  'power1.inOut',
  'power2.inOut',
  'power3.inOut',
  'power4.inOut',
  'sine.inOut',
  'expo.inOut',
  'circ.inOut',
  'back.inOut(1.2)',
] as const

type FocusDialKey = keyof typeof focusDials

const DIAL_TOOLTIPS: Record<FocusDialKey, string> = {
  cameraToMeshDistance:
    'Distance from the camera to the clicked mesh center when the focus tween finishes. Larger = smaller on-screen image; smaller = larger. Keeps a consistent size across clicks when unchanged.',
  duration: 'How long the camera takes to move to the focus position (seconds).',
  ease: 'GSAP easing curve for the focus tween. Softer eases feel smoother; snappier eases start/end faster.',
  padTopPx: 'Gap in pixels between the top edge of a focused image and the top of the screen.',
  padBotPx: 'Gap in pixels between the bottom edge of a focused image and the top of the info card.',
  infoCardPx: 'Estimated height in pixels of the info card. Used to constrain tall images from overlapping it.',
}

const defaults = { ...focusDials }

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

function formatVal(key: FocusDialKey, v: number | string): string {
  if (key === 'cameraToMeshDistance') return (v as number).toFixed(1)
  if (key === 'duration') return (v as number).toFixed(2)
  return String(v)
}

export function mountFocusDialKitPanel(host: HTMLElement): void {
  host.className = 'dialkit'
  host.innerHTML = `
    <button type="button" class="dialkit__toggle" aria-expanded="true" aria-controls="focus-dialkit-panel">
      <span class="dialkit__toggle-title">Focus dials</span>
      <span class="dialkit__chev" aria-hidden="true">▼</span>
    </button>
    <div id="focus-dialkit-panel" class="dialkit__panel"></div>
  `

  const panel = host.querySelector<HTMLDivElement>('#focus-dialkit-panel')!
  const toggle = host.querySelector<HTMLButtonElement>('.dialkit__toggle')!

  const copyBar = document.createElement('div')
  copyBar.className = 'dialkit__copyBar'

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'dialkit__copy'
  copyBtn.textContent = 'Copy settings'
  copyBtn.title =
    'Copies focus dial values as JSON. Paste into a note or chat to save this configuration.'

  async function copyAllSettings() {
    const text = JSON.stringify({ ...focusDials }, null, 2)
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

  function bindRange(
    key: 'cameraToMeshDistance' | 'duration',
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
    input.value = String(focusDials[key])
    const val = document.createElement('span')
    val.className = 'dialkit__value'
    val.textContent = formatVal(key, focusDials[key])

    input.addEventListener('input', () => {
      const n = parseFloat(input.value)
      ;(focusDials as Record<string, number | string>)[key] = n
      val.textContent = formatVal(key, n)
    })

    input.id = `focus-dial-${key}`
    panel.append(row(label, input, val, DIAL_TOOLTIPS[key]))
  }

  function bindEaseSelect() {
    const select = document.createElement('select')
    select.className = 'dialkit__select'
    select.dataset.dialKey = 'ease'
    select.id = 'focus-dial-ease'
    for (const opt of FOCUS_EASE_OPTIONS) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      if (opt === focusDials.ease) o.selected = true
      select.append(o)
    }
    const easeList = FOCUS_EASE_OPTIONS as readonly string[]
    if (!easeList.includes(focusDials.ease)) {
      const o = document.createElement('option')
      o.value = focusDials.ease
      o.textContent = focusDials.ease
      o.selected = true
      select.prepend(o)
    }
    const val = document.createElement('span')
    val.className = 'dialkit__value dialkit__value--muted'
    val.textContent = '\u00A0'
    val.setAttribute('aria-hidden', 'true')

    select.addEventListener('change', () => {
      focusDials.ease = select.value
    })

    select.title = DIAL_TOOLTIPS.ease
    panel.append(row('Ease', select, val, DIAL_TOOLTIPS.ease))
  }

  bindRange('cameraToMeshDistance', 'Camera ↔ mesh dist', 1, 40, 0.5)
  bindRange('duration', 'Duration (s)', 0.15, 2.5, 0.05)
  bindEaseSelect()

  const actions = document.createElement('div')
  actions.className = 'dialkit__actions'

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'dialkit__reset'
  reset.textContent = 'Reset defaults'
  reset.title = 'Restores focus dials to the built-in defaults from page load.'

  reset.addEventListener('click', () => {
    Object.assign(focusDials, defaults)
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-dial-key]').forEach((el) => {
      const k = el.dataset.dialKey as FocusDialKey
      const valEl = el.parentElement?.querySelector<HTMLSpanElement>('.dialkit__value')
      if (el instanceof HTMLInputElement && el.type === 'range') {
        el.value = String(focusDials[k])
        if (valEl) valEl.textContent = formatVal(k, focusDials[k] as number)
      }
      if (el instanceof HTMLSelectElement && k === 'ease') {
        el.value = focusDials.ease
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
