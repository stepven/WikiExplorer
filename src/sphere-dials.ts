/**
 * DialKit-style panel for the sphere interior viewer:
 * camera drag, scroll momentum, sphere layout, image appearance, and spawn.
 */

export const sphereDials = {
  /** Pixels → radians multiplier for pointer drag */
  dragSensitivity: 0.004,
  /** Pitch clamp in degrees (±) */
  pitchLimit: 85,

  /** Wheel deltaY → scroll velocity impulse */
  scrollGain: 0.04,
  /** Upper bound on |scrollVel| (world units / sec) */
  scrollVelMax: 20,
  /** Per-frame decay for scroll velocity */
  momentumDecay: 0.92,
  /** Snap to 0 when |scrollVel| falls below this (0 = never) */
  momentumCutoff: 0.05,
  /** Flip scroll direction */
  invertScroll: false,
  /** Frame delta cap (seconds) */
  maxDt: 0.05,

  /** Radius of the billboard shell from the origin */
  shellRadius: 15,
  /** World distance from origin beyond which a mesh recycles */
  recycleRadius: 30,
  /** Number of image billboards on the sphere */
  planeCount: 80,

  /** World width of each billboard quad */
  planeWidth: 1.6,
  /** World height of each billboard quad */
  planeHeight: 1.2,
  /** Material opacity at full visibility */
  planeOpacity: 0.95,
  /** Procedural texture canvas width (px) */
  texCanvasW: 512,
  /** Procedural texture canvas height (px) */
  texCanvasH: 384,

  /** Scale + fade-in duration when a mesh spawns / recycles (seconds) */
  spawnDuration: 0.5,
}

type DialKey = keyof typeof sphereDials

const DIAL_TOOLTIPS: Record<DialKey, string> = {
  dragSensitivity:
    'Pixels-to-radians multiplier for pointer drag. Higher = faster camera rotation per pixel of mouse movement.',
  pitchLimit:
    'Maximum up/down angle the camera can reach (degrees). 90 = straight up, lower values restrict vertical look.',
  scrollGain:
    'Multiplier on wheel deltaY for scroll velocity. Higher = stronger impulse per scroll tick.',
  scrollVelMax:
    'Upper clamp on |scrollVel|. Prevents excessive speed even with rapid scrolling.',
  momentumDecay:
    'Per-frame multiplier for scroll velocity after release. Closer to 1 = longer glide; lower = snappier stop.',
  momentumCutoff:
    'Snap velocity to zero when it falls below this. Set to 0 to let momentum decay smoothly to nothing.',
  invertScroll:
    'When on, reverses the scroll-forward direction.',
  maxDt:
    'Caps frame delta time (seconds). Prevents huge position jumps after tab switches or hitches.',
  shellRadius:
    'Radius of the initial billboard sphere around the origin. Larger = images farther away (appear smaller).',
  recycleRadius:
    'World distance from origin beyond which a mesh is teleported back into view. Should be larger than shellRadius.',
  planeCount:
    'How many billboard images populate the sphere. More = denser coverage.',
  planeWidth:
    'World-space width of each billboard quad. Larger = bigger images.',
  planeHeight:
    'World-space height of each billboard quad.',
  planeOpacity:
    'Alpha of billboard materials when fully visible.',
  texCanvasW:
    'Width (px) of the off-screen canvas for procedural label textures. Higher = sharper text, more GPU memory.',
  texCanvasH:
    'Height (px) of the procedural texture canvas.',
  spawnDuration:
    'Duration of the scale + fade animation when a billboard spawns or recycles (seconds).',
}

const defaults = { ...sphereDials }

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
  if (key === 'dragSensitivity') return v.toFixed(4)
  if (key === 'momentumDecay') return v.toFixed(3)
  if (key === 'momentumCutoff' || key === 'scrollGain' || key === 'maxDt')
    return v.toFixed(3)
  if (
    key === 'planeWidth' ||
    key === 'planeHeight' ||
    key === 'planeOpacity' ||
    key === 'spawnDuration' ||
    key === 'shellRadius' ||
    key === 'recycleRadius'
  )
    return v.toFixed(2)
  if (key === 'planeCount' || key === 'texCanvasW' || key === 'texCanvasH')
    return String(Math.round(v))
  return String(v)
}

export function mountSphereDialKitPanel(
  host: HTMLElement,
  opts: { onRebuild: () => void },
): void {
  const { onRebuild } = opts
  host.className = 'dialkit'
  host.innerHTML = `
    <button type="button" class="dialkit__toggle" aria-expanded="true" aria-controls="sphere-dialkit-panel">
      <span class="dialkit__toggle-title">Sphere dials</span>
      <span class="dialkit__chev" aria-hidden="true">▼</span>
    </button>
    <div id="sphere-dialkit-panel" class="dialkit__panel"></div>
  `

  const panel = host.querySelector<HTMLDivElement>('#sphere-dialkit-panel')!
  const toggle = host.querySelector<HTMLButtonElement>('.dialkit__toggle')!

  const copyBar = document.createElement('div')
  copyBar.className = 'dialkit__copyBar'

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'dialkit__copy'
  copyBtn.textContent = 'Copy settings'
  copyBtn.title =
    'Copies every sphere dial value as JSON. Paste into a note or chat to save this configuration.'

  async function copyAllSettings() {
    const text = JSON.stringify({ ...sphereDials }, null, 2)
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
    rebuild = false,
    eventName: 'input' | 'change' = 'input',
  ) {
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.dataset.dialKey = key
    input.value = String(sphereDials[key] as number)
    const val = document.createElement('span')
    val.className = 'dialkit__value'
    val.textContent = formatVal(key, sphereDials[key] as number)

    const apply = () => {
      const n = parseFloat(input.value)
      ;(sphereDials as Record<string, number | boolean>)[key] = n
      val.textContent = formatVal(key, n)
      if (rebuild) onRebuild()
    }

    input.addEventListener(eventName, apply)
    input.id = `sphere-dial-${String(key)}`
    panel.append(row(label, input, val, DIAL_TOOLTIPS[key]))
  }

  function bindToggle(key: 'invertScroll', label: string) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.dataset.dialKey = key
    input.id = `sphere-dial-${String(key)}`
    input.checked = sphereDials[key]
    const val = document.createElement('span')
    val.className = 'dialkit__value'
    val.textContent = formatVal(key, sphereDials[key])

    input.addEventListener('change', () => {
      sphereDials[key] = input.checked
      val.textContent = formatVal(key, input.checked)
    })

    panel.append(row(label, input, val, DIAL_TOOLTIPS[key]))
  }

  addSection('Camera & drag')
  bindRange('dragSensitivity', 'Drag sensitivity', 0.001, 0.015, 0.0005)
  bindRange('pitchLimit', 'Pitch limit (°)', 30, 90, 1)

  addSection('Scroll & momentum')
  bindRange('scrollGain', 'Scroll gain', 0.005, 0.12, 0.001)
  bindRange('scrollVelMax', 'Vel max', 5, 40, 0.5)
  bindRange('momentumDecay', 'Momentum decay', 0.85, 0.999, 0.001)
  bindRange('momentumCutoff', 'Stop threshold', 0, 0.2, 0.005)
  bindToggle('invertScroll', 'Invert scroll')

  addSection('Sphere layout')
  bindRange('shellRadius', 'Shell radius', 5, 40, 0.5, true)
  bindRange('recycleRadius', 'Recycle radius', 15, 80, 0.5)
  bindRange('planeCount', 'Plane count', 16, 200, 1, true)

  addSection('Image appearance')
  bindRange('planeWidth', 'Width', 0.4, 4, 0.02, true)
  bindRange('planeHeight', 'Height', 0.3, 3.5, 0.02, true)
  bindRange('planeOpacity', 'Opacity', 0.2, 1, 0.01, true)

  addSection('Texture (apply on release)')
  bindRange('texCanvasW', 'Tex width (px)', 128, 1024, 32, true, 'change')
  bindRange('texCanvasH', 'Tex height (px)', 96, 768, 32, true, 'change')

  addSection('Spawn')
  bindRange('spawnDuration', 'Duration (s)', 0.1, 1.5, 0.05)
  bindRange('maxDt', 'Max Δt (cap)', 0.01, 0.12, 0.005)

  const actions = document.createElement('div')
  actions.className = 'dialkit__actions'

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'dialkit__reset'
  reset.textContent = 'Reset defaults'
  reset.title =
    'Restores all sphere dials to the built-in defaults from page load.'

  reset.addEventListener('click', () => {
    Object.assign(sphereDials, defaults)
    panel
      .querySelectorAll<HTMLInputElement>('[data-dial-key]')
      .forEach((el) => {
        const k = el.dataset.dialKey as DialKey
        const valEl =
          el.parentElement?.querySelector<HTMLSpanElement>('.dialkit__value')
        if (el.type === 'checkbox') {
          el.checked = sphereDials[k] as boolean
          if (valEl) valEl.textContent = formatVal(k, sphereDials[k] as boolean)
        } else {
          el.value = String(sphereDials[k])
          if (valEl) valEl.textContent = formatVal(k, sphereDials[k] as number)
        }
      })
    onRebuild()
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
