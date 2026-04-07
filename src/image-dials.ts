/**
 * DialKit-style panel for tunnel image layout: count, spacing, XY distribution,
 * plane size, rotations, opacity, and procedural texture resolution.
 */

export const imageDials = {
  /** Number of image planes in the tunnel */
  planeCount: 56,
  /** World units between consecutive planes along Z */
  zSpacing: 2.15,
  /** World Z of the front-most row at startup (more negative = farther) */
  tunnelInitialZBase: -2,
  /** Half-width of the XY placement field (world units) */
  fieldX: 14,
  /** Half-height of the XY placement field (world units) */
  fieldY: 9,
  /** Multiplier on field for initial random XY (0–1 tightens toward center) */
  initialSpread: 0.85,
  /** Multiplier on fieldX when a plane recycles (lateral spread) */
  recycleSpreadX: 1,
  /** Multiplier on fieldY when a plane recycles */
  recycleSpreadY: 1,
  /** Plane width in world units */
  planeWidth: 1.4,
  /** Plane height in world units */
  planeHeight: 1.05,
  /** Material opacity when fully visible */
  planeOpacity: 0.98,
  /**
   * Random Z rotation on first layout: `(Math.random() - 0.5) * value` radians.
   * Larger = more tilt in the tunnel plane.
   */
  rotationZInitial: 0.08,
  /**
   * Random Z rotation when a plane wraps to the back: `(Math.random() - 0.5) * value`.
   */
  rotationZRecycle: 0.12,
  /** Random X tilt on spawn (radians scale, 0 = none) */
  rotationXInitial: 0,
  rotationYInitial: 0,
  /** Random X/Y tilt when recycling */
  rotationXRecycle: 0,
  rotationYRecycle: 0,
  /** Procedural label texture width (canvas pixels); heavier to change */
  textureCanvasW: 512,
  /** Procedural label texture height (canvas pixels) */
  textureCanvasH: 384,
}

type DialKey = keyof typeof imageDials

const DIAL_TOOLTIPS: Record<DialKey, string> = {
  planeCount:
    'How many billboard images exist along the tunnel. More = denser depth stack; fewer = more space between cards.',
  zSpacing:
    'Distance along Z between neighboring planes (world units). Smaller packs images closer; larger stretches the tunnel.',
  tunnelInitialZBase:
    'World Z of the front row at load. More negative moves the whole stack away from the camera along -Z.',
  fieldX:
    'Half-width of the random XY placement area. Larger spreads images farther left/right.',
  fieldY:
    'Half-height of the random XY placement area. Larger spreads images farther up/down.',
  initialSpread:
    'Scales how wide the first random placement is relative to field X/Y (0 = center only, 1 = full field).',
  recycleSpreadX:
    'Extra multiplier on field X when a plane respawns at the far end (lateral spread vs. field).',
  recycleSpreadY:
    'Extra multiplier on field Y when a plane respawns at the far end.',
  planeWidth:
    'World-space width of each image quad. Larger = bigger pictures on screen.',
  planeHeight:
    'World-space height of each image quad. Together with width sets aspect ratio.',
  planeOpacity:
    'Alpha of the billboard material when fully visible (spawn animation ends here).',
  rotationZInitial:
    'Random twist around Z for initial placement: range is ±(value/2) radians. Try ~0.15–0.5 for loose decks.',
  rotationZRecycle:
    'Random Z twist applied when a plane wraps to the back (often a bit more than initial).',
  rotationXInitial:
    'Random tilt around X on first layout (radians scale). Subtle values (~0.02–0.08) add depth parallax.',
  rotationYInitial: 'Random tilt around Y on first layout (radians scale).',
  rotationXRecycle: 'Random X tilt when a plane recycles to the far end.',
  rotationYRecycle: 'Random Y tilt when a plane recycles to the far end.',
  textureCanvasW:
    'Width of the off-screen canvas used to draw each label texture. Higher = sharper text, more GPU memory. Applied on release (not every drag tick).',
  textureCanvasH:
    'Height of the procedural texture canvas. Applied on release to avoid rebuilding every frame.',
}

const defaults = { ...imageDials }

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

function formatVal(key: DialKey, v: number): string {
  if (
    key === 'rotationZInitial' ||
    key === 'rotationZRecycle' ||
    key === 'rotationXInitial' ||
    key === 'rotationYInitial' ||
    key === 'rotationXRecycle' ||
    key === 'rotationYRecycle'
  )
    return v.toFixed(3)
  if (
    key === 'planeWidth' ||
    key === 'planeHeight' ||
    key === 'zSpacing' ||
    key === 'tunnelInitialZBase' ||
    key === 'fieldX' ||
    key === 'fieldY'
  )
    return v.toFixed(2)
  if (
    key === 'initialSpread' ||
    key === 'recycleSpreadX' ||
    key === 'recycleSpreadY' ||
    key === 'planeOpacity'
  )
    return v.toFixed(2)
  if (key === 'textureCanvasW' || key === 'textureCanvasH' || key === 'planeCount')
    return String(Math.round(v))
  return String(v)
}

export function mountImageDialKitPanel(
  host: HTMLElement,
  opts: { onChange: () => void },
): void {
  const { onChange } = opts
  host.className = 'dialkit'
  host.innerHTML = `
    <button type="button" class="dialkit__toggle" aria-expanded="true" aria-controls="image-dialkit-panel">
      <span class="dialkit__toggle-title">Image dials</span>
      <span class="dialkit__chev" aria-hidden="true">▼</span>
    </button>
    <div id="image-dialkit-panel" class="dialkit__panel"></div>
  `

  const panel = host.querySelector<HTMLDivElement>('#image-dialkit-panel')!
  const toggle = host.querySelector<HTMLButtonElement>('.dialkit__toggle')!

  const copyBar = document.createElement('div')
  copyBar.className = 'dialkit__copyBar'

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'dialkit__copy'
  copyBtn.textContent = 'Copy settings'
  copyBtn.title =
    'Copies every image dial value as JSON. Paste into a note or chat to save this layout.'

  async function copyAllSettings() {
    const text = JSON.stringify({ ...imageDials }, null, 2)
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
    fireOn: 'input' | 'change' = 'input',
  ) {
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.dataset.dialKey = key
    input.value = String(imageDials[key])
    const val = document.createElement('span')
    val.className = 'dialkit__value'
    val.textContent = formatVal(key, imageDials[key] as number)

    const apply = () => {
      const n = parseFloat(input.value)
      ;(imageDials as Record<string, number>)[key] = n
      val.textContent = formatVal(key, n)
      onChange()
    }

    input.addEventListener(fireOn, apply)

    input.id = `image-dial-${String(key)}`
    panel.append(row(label, input, val, DIAL_TOOLTIPS[key]))
  }

  addSection('Layout & depth')
  bindRange('planeCount', 'Plane count', 8, 120, 1)
  bindRange('zSpacing', 'Z spacing', 0.6, 5, 0.05)
  bindRange('tunnelInitialZBase', 'Front row Z', -12, 2, 0.1)

  addSection('XY distribution')
  bindRange('fieldX', 'Field X (half)', 2, 28, 0.25)
  bindRange('fieldY', 'Field Y (half)', 2, 20, 0.25)
  bindRange('initialSpread', 'Initial spread', 0.05, 1, 0.01)
  bindRange('recycleSpreadX', 'Recycle spread X', 0.2, 1.5, 0.01)
  bindRange('recycleSpreadY', 'Recycle spread Y', 0.2, 1.5, 0.01)

  addSection('Size & opacity')
  bindRange('planeWidth', 'Plane width', 0.4, 4, 0.02)
  bindRange('planeHeight', 'Plane height', 0.3, 3.5, 0.02)
  bindRange('planeOpacity', 'Opacity', 0.2, 1, 0.01)

  addSection('Rotation (rad scale)')
  bindRange('rotationZInitial', 'Z initial', 0, 0.6, 0.005)
  bindRange('rotationZRecycle', 'Z recycle', 0, 0.8, 0.005)
  bindRange('rotationXInitial', 'X initial', 0, 0.35, 0.002)
  bindRange('rotationYInitial', 'Y initial', 0, 0.35, 0.002)
  bindRange('rotationXRecycle', 'X recycle', 0, 0.45, 0.002)
  bindRange('rotationYRecycle', 'Y recycle', 0, 0.45, 0.002)

  addSection('Texture (apply on release)')
  bindRange('textureCanvasW', 'Tex width (px)', 128, 1024, 32, 'change')
  bindRange('textureCanvasH', 'Tex height (px)', 96, 768, 32, 'change')

  const actions = document.createElement('div')
  actions.className = 'dialkit__actions'

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'dialkit__reset'
  reset.textContent = 'Reset defaults'
  reset.title = 'Restores image dials to the built-in defaults from page load.'

  reset.addEventListener('click', () => {
    Object.assign(imageDials, defaults)
    panel.querySelectorAll<HTMLInputElement>('[data-dial-key]').forEach((el) => {
      const k = el.dataset.dialKey as DialKey
      const valEl = el.parentElement?.querySelector<HTMLSpanElement>('.dialkit__value')
      el.value = String(imageDials[k])
      if (valEl) valEl.textContent = formatVal(k, imageDials[k] as number)
    })
    onChange()
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
