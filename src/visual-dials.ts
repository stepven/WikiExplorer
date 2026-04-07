/**
 * Focused dial panel for the four visual tweakables exposed to the UI:
 * image size, corner rounding, rotation spread, and focus-mode padding.
 */
import { imageDials } from './image-dials'
import { focusDials } from './focus-dials'
import { gradientDials } from './gradient-dials'

type OnChange = () => void

function section(title: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'dialkit__section'
  el.textContent = title
  return el
}

function makeRow(
  label: string,
  input: HTMLElement,
  valueEl: HTMLElement,
  tooltip: string,
): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'dialkit__row dialkit__row--tipped'
  wrap.title = tooltip
  const lab = document.createElement('label')
  lab.className = 'dialkit__label'
  lab.title = tooltip
  lab.textContent = label
  if (input.id) lab.htmlFor = input.id
  const ctrl = document.createElement('div')
  ctrl.className = 'dialkit__ctrl'
  ctrl.append(input, valueEl)
  wrap.append(lab, ctrl)
  return wrap
}

function makeRange(
  id: string,
  min: number,
  max: number,
  step: number,
  value: number,
): [HTMLInputElement, HTMLSpanElement] {
  const input = document.createElement('input')
  input.type = 'range'
  input.id = id
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  const val = document.createElement('span')
  val.className = 'dialkit__value'
  val.textContent = formatNum(value, step)
  return [input, val]
}

function formatNum(n: number, step: number): string {
  if (step >= 1) return String(Math.round(n))
  if (step >= 0.01) return n.toFixed(2)
  return n.toFixed(3)
}

export function mountVisualDialsPanel(host: HTMLElement, onChange: OnChange): void {
  host.className = 'dialkit'
  host.innerHTML = `
    <button type="button" class="dialkit__toggle" aria-expanded="true" aria-controls="visual-dialkit-panel">
      <span class="dialkit__toggle-title">Visual</span>
      <span class="dialkit__chev" aria-hidden="true">▼</span>
    </button>
    <div id="visual-dialkit-panel" class="dialkit__panel"></div>
  `

  const panel = host.querySelector<HTMLDivElement>('#visual-dialkit-panel')!
  const toggle = host.querySelector<HTMLButtonElement>('.dialkit__toggle')!

  // ── Size & shape ──────────────────────────────────────────

  panel.append(section('Size & shape'))

  const [sizeIn, sizeVal] = makeRange('vd-size', 0.4, 4, 0.05, imageDials.planeWidth)
  sizeIn.addEventListener('input', () => {
    const n = parseFloat(sizeIn.value)
    imageDials.planeWidth = n
    sizeVal.textContent = formatNum(n, 0.05)
    onChange()
  })
  panel.append(makeRow('Image size', sizeIn, sizeVal, 'World-space width of each image. Height adjusts to the photo\'s original aspect ratio.'))

  // ── Rotation spread ───────────────────────────────────────

  panel.append(section('Rotation spread'))

  const [rzIn, rzVal] = makeRange('vd-rz', 0, 1.0, 0.01, imageDials.rotationZInitial)
  rzIn.addEventListener('input', () => {
    const n = parseFloat(rzIn.value)
    imageDials.rotationZInitial = n
    imageDials.rotationZRecycle = n * 1.5
    rzVal.textContent = formatNum(n, 0.01)
  })
  panel.append(makeRow('Z spread', rzIn, rzVal, 'Random tilt around Z in the tunnel. 0 = upright, higher = more tilted.'))

  const [rxIn, rxVal] = makeRange('vd-rx', 0, 0.4, 0.005, imageDials.rotationXInitial)
  rxIn.addEventListener('input', () => {
    const n = parseFloat(rxIn.value)
    imageDials.rotationXInitial = n
    imageDials.rotationXRecycle = n
    rxVal.textContent = formatNum(n, 0.005)
  })
  panel.append(makeRow('X spread', rxIn, rxVal, 'Random tilt around X. Subtle values add depth parallax.'))

  const [ryIn, ryVal] = makeRange('vd-ry', 0, 0.4, 0.005, imageDials.rotationYInitial)
  ryIn.addEventListener('input', () => {
    const n = parseFloat(ryIn.value)
    imageDials.rotationYInitial = n
    imageDials.rotationYRecycle = n
    ryVal.textContent = formatNum(n, 0.005)
  })
  panel.append(makeRow('Y spread', ryIn, ryVal, 'Random tilt around Y. Small values give a slight perspective lean.'))

  // ── Focus padding ─────────────────────────────────────────

  panel.append(section('Focus padding (px)'))

  const [ptIn, ptVal] = makeRange('vd-pt', 0, 150, 4, focusDials.padTopPx)
  ptIn.addEventListener('input', () => {
    const n = parseFloat(ptIn.value)
    focusDials.padTopPx = n
    ptVal.textContent = formatNum(n, 1)
    onChange()
  })
  panel.append(makeRow('Top gap', ptIn, ptVal, 'Gap in pixels between the top of a focused image and the top of the screen.'))

  const [pbIn, pbVal] = makeRange('vd-pb', 0, 150, 4, focusDials.padBotPx)
  pbIn.addEventListener('input', () => {
    const n = parseFloat(pbIn.value)
    focusDials.padBotPx = n
    pbVal.textContent = formatNum(n, 1)
    onChange()
  })
  panel.append(makeRow('Bottom gap', pbIn, pbVal, 'Gap in pixels between the bottom of a focused image and the top of the info card.'))

  // ── Background gradient ────────────────────────────────────

  panel.append(section('Background gradient'))

  const [topOpIn, topOpVal] = makeRange('vd-gtop', 0, 1, 0.01, gradientDials.topOpacity)
  topOpIn.addEventListener('input', () => {
    const n = parseFloat(topOpIn.value)
    gradientDials.topOpacity = n
    topOpVal.textContent = formatNum(n, 0.01)
  })
  panel.append(makeRow('Top opacity', topOpIn, topOpVal, 'White overlay opacity at the top of the screen when focused.'))

  const [botOpIn, botOpVal] = makeRange('vd-gbot', 0, 1, 0.01, gradientDials.bottomOpacity)
  botOpIn.addEventListener('input', () => {
    const n = parseFloat(botOpIn.value)
    gradientDials.bottomOpacity = n
    botOpVal.textContent = formatNum(n, 0.01)
  })
  panel.append(
    makeRow(
      'Bottom opacity',
      botOpIn,
      botOpVal,
      'White overlay opacity at the seam (bottom of the top gradient band), above the clear area.',
    ),
  )

  const [blurIn, blurVal] = makeRange('vd-gblur', 0, 400, 5, gradientDials.blur)
  blurIn.addEventListener('input', () => {
    const n = parseFloat(blurIn.value)
    gradientDials.blur = n
    blurVal.textContent = formatNum(n, 1)
  })
  panel.append(makeRow('Blur', blurIn, blurVal, 'Softens the gradient transition by spreading the ramp over more pixels.'))

  const [noiseIn, noiseVal] = makeRange('vd-gnoise', 0, 0.5, 0.005, gradientDials.noise)
  noiseIn.addEventListener('input', () => {
    const n = parseFloat(noiseIn.value)
    gradientDials.noise = n
    noiseVal.textContent = formatNum(n, 0.005)
  })
  panel.append(makeRow('Noise', noiseIn, noiseVal, 'Film-grain noise mixed into the gradient to reduce banding.'))

  // ── Collapse toggle ───────────────────────────────────────

  let open = true
  toggle.addEventListener('click', () => {
    open = !open
    toggle.setAttribute('aria-expanded', String(open))
    panel.hidden = !open
    host.querySelector('.dialkit__chev')!.textContent = open ? '▼' : '▶'
  })
}
