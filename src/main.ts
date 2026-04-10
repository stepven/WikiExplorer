import './style.css'
import './tailwind.css'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  Clock,
  Color,
  DirectionalLight,
  DoubleSide,
  Frustum,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import gsap from 'gsap'
import { motionDials } from './motion-dials'
import { tunnelSpawnEase } from './tunnel-spawn-ease'
import { focusDials } from './focus-dials'
import { imageDials } from './image-dials'
import { gradientDials } from './gradient-dials'

import {
  ensurePool,
  fetchBatch,
  fetchBatchesParallel as wikiFetchBatchesParallel,
  fetchLinkedExtract,
  setFilter as wikiSetFilter,
  takeNext,
  type WikiArticle,
} from './wiki-service'
import { createDetailPanel } from './wiki-detail-panel'
import { createHistoryTray } from './image-history-tray'
import { mountLoadingPreviewCarousel } from './loading-preview-carousel'

const earlyFetch = fetchBatch(20)

/* ── DOM ─────────────────────────────────────────────────── */

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <canvas id="webgl" aria-label="Wikipedia image tunnel"></canvas>
  <div id="loading-indicator" class="loading-indicator">
    <h1 class="loading-indicator__title">Wiki Explorer</h1>
    <div id="loading-progress-root" class="loading-indicator__progress"></div>
    <div id="loading-preview-root" class="loading-preview-root" hidden></div>
  </div>
  <div id="topic-filter-root"></div>
  <div class="bottom-hint-stack">
    <div id="filter-loading" class="filter-loading" hidden role="status" aria-live="polite">
      <svg class="filter-loading__spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>
      <span class="filter-loading__label">Updating images…</span>
    </div>
    <p id="scroll-hint" class="scroll-hint scroll-hint--pending">scroll or drag to explore, click an image to read more</p>
  </div>
`

/* ── Three.js core ───────────────────────────────────────── */

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')!

const scene = new Scene()
const sceneBg = new Color(0xf0f0f0)
scene.background = sceneBg
scene.fog = null

const camera = new PerspectiveCamera(52, 1, 0.1, 120)
camera.position.set(0, 0, 7.5)

const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  /** Lets drawImage(webgl→2d) read the last frame reliably (history tray frosted snapshot). */
  preserveDrawingBuffer: true,
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.autoClear = false

scene.add(new AmbientLight(0xf0f0f0, 0.48))
const fill = new DirectionalLight(0xf0f0f0, 1)
fill.position.set(2, 4, 8)
scene.add(fill)

/* ── Focus gradient (fullscreen quad via analytical shader) ── */

const gradMat = new ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
  uniforms: {
    uOpacity: { value: 0 },
    uSolidBand: { value: gradientDials.solidBand },
    uTopOpacity: { value: gradientDials.topOpacity },
    uBotOpacity: { value: gradientDials.bottomOpacity },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    uniform float uSolidBand;
    uniform float uTopOpacity;
    uniform float uBotOpacity;
    varying vec2 vUv;
    void main() {
      float alpha;
      if (vUv.y <= uSolidBand) {
        alpha = 1.0;
      } else {
        float t = (vUv.y - uSolidBand) / (1.0 - uSolidBand);
        alpha = mix(uBotOpacity, uTopOpacity, t);
      }
      gl_FragColor = vec4(vec3(0.9412), alpha * uOpacity);
    }
  `,
})
const gradQuad = new Mesh(new PlaneGeometry(2, 2), gradMat)
gradQuad.frustumCulled = false
const gradScene = new Scene()
gradScene.add(gradQuad)
const gradCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

/* ── Wikipedia texture loading ───────────────────────────── */

const texLoader = new TextureLoader()
texLoader.setCrossOrigin('anonymous')

const meshArticleMap = new Map<Mesh, WikiArticle>()
const meshAspectMap = new Map<Mesh, number>()
const maxAniso = renderer.capabilities.getMaxAnisotropy()

function applyAspectScale(mesh: Mesh, ar: number): void {
  let displayW = imageDials.planeWidth
  let displayH = imageDials.planeWidth / ar

  // Cap height so tall portrait images don't clip the top or bottom of the screen
  // at the focus depth. The image center sits VERTICAL_OFFSET_PX above the screen
  // midpoint, so the available space above it is smaller than half the screen.
  const d = focusDials.cameraToMeshDistance
  const visibleH = 2 * d * Math.tan((camera.fov / 2) * (Math.PI / 180))
  const VERTICAL_OFFSET_PX = 150 // must match yShift in focusMeshOnScreen
  // Available height above image center → top edge with padding
  const aboveCenter = window.innerHeight / 2 - VERTICAL_OFFSET_PX - focusDials.padTopPx
  // Available height below image center → info card with padding
  const belowCenter = window.innerHeight / 2 + VERTICAL_OFFSET_PX - focusDials.infoCardPx - focusDials.padBotPx
  // Max image height is twice the smaller of the two halves (keeps it symmetric),
  // capped so focused images never exceed this screen height.
  const FOCUS_MAX_IMAGE_HEIGHT_PX = 450
  const maxPx = Math.min(FOCUS_MAX_IMAGE_HEIGHT_PX, 2 * Math.min(aboveCenter, belowCenter))
  const maxWorldH = Math.max(0.2, (maxPx / window.innerHeight) * visibleH)

  if (displayH > maxWorldH) {
    const factor = maxWorldH / displayH
    displayW *= factor
    displayH = maxWorldH
  }

  mesh.scale.set(
    displayW / imageDials.planeWidth,
    displayH / imageDials.planeHeight,
    1,
  )
}

function loadWikiTexture(mesh: Mesh, article: WikiArticle): Promise<boolean> {
  return new Promise((resolve) => {
    texLoader.load(
      article.thumbUrl,
      (tex) => {
        void (async () => {
          try {
            const imgEl = tex.image
            if (imgEl instanceof HTMLImageElement && imgEl.decode) {
              try {
                await imgEl.decode()
              } catch {
                tex.dispose()
                resolve(false)
                return
              }
            }
            const img = tex.image as {
              naturalWidth?: number
              naturalHeight?: number
              width?: number
              height?: number
            }
            let w = img?.naturalWidth ?? img?.width ?? 0
            let h = img?.naturalHeight ?? img?.height ?? 0
            if (w === 0 || h === 0) {
              await new Promise<void>((r) => requestAnimationFrame(() => r()))
              w = img?.naturalWidth ?? img?.width ?? 0
              h = img?.naturalHeight ?? img?.height ?? 0
            }
            if (w === 0 || h === 0) {
              tex.dispose()
              resolve(false)
              return
            }
            tex.colorSpace = SRGBColorSpace
            tex.anisotropy = maxAniso
            tex.needsUpdate = true
            const mat = mesh.material as MeshBasicMaterial
            mat.map?.dispose()
            mat.map = tex
            mat.needsUpdate = true
            const ar = w / h
            meshAspectMap.set(mesh, ar)
            gsap.killTweensOf(mesh.scale)
            applyAspectScale(mesh, ar)
            resolve(true)
          } catch {
            tex.dispose()
            resolve(false)
          }
        })()
      },
      undefined,
      () => {
        resolve(false)
      },
    )
  })
}

const meshAssignInFlight = new WeakSet<Mesh>()

function assignArticleToMesh(mesh: Mesh): Promise<void> {
  if (meshAssignInFlight.has(mesh)) return Promise.resolve()
  meshAssignInFlight.add(mesh)
  return (async () => {
    try {
      const article = await takeNext()
      if (!article) return
      meshArticleMap.set(mesh, article)
      await loadWikiTexture(mesh, article)
    } finally {
      meshAssignInFlight.delete(mesh)
    }
  })()
}

let initialLoadComplete = false

const scratchCamPos = new Vector3()
const scratchMeshPos = new Vector3()
const scratchSphere = new Sphere()

/** Meshes whose bounds intersect the camera frustum at load (closest first). */
function getInitiallyVisibleMeshes(
  cam: PerspectiveCamera,
  meshList: Mesh[],
): Mesh[] {
  cam.updateMatrixWorld(true)
  const frustum = new Frustum()
  const m = new Matrix4().multiplyMatrices(
    cam.projectionMatrix,
    cam.matrixWorldInverse,
  )
  frustum.setFromProjectionMatrix(m)

  const visible: Mesh[] = []
  for (const mesh of meshList) {
    mesh.updateMatrixWorld(true)
    const geo = mesh.geometry
    if (!geo.boundingSphere) geo.computeBoundingSphere()
    const bs = geo.boundingSphere
    if (!bs) continue
    scratchSphere.copy(bs)
    scratchSphere.applyMatrix4(mesh.matrixWorld)
    if (frustum.intersectsSphere(scratchSphere)) {
      visible.push(mesh)
    }
  }

  cam.getWorldPosition(scratchCamPos)
  visible.sort((a, b) => {
    const da = a.getWorldPosition(scratchMeshPos).distanceToSquared(scratchCamPos)
    const db = b.getWorldPosition(scratchMeshPos).distanceToSquared(scratchCamPos)
    return da - db
  })
  return visible
}

/** Kick loads for planes that scroll into view but never received an article (pool starvation). */
function prioritizeFrustumMeshLoads(): void {
  const visible = getInitiallyVisibleMeshes(camera, meshes)
  for (const mesh of visible) {
    if (!meshArticleMap.has(mesh)) {
      assignArticleToMesh(mesh)
    }
  }
}

/* ── Scroll state ────────────────────────────────────────── */

let scrollZVel = 0
let scrollXVel = 0
let scrollYVel = 0

/** Pointer movement is much smaller than typical wheel deltas — scale so canvas drag matches trackpad feel. */
const TUNNEL_DRAG_SCALE = 7

function addHorizontalImpulse(delta: number, mode: 'wheel' | 'drag') {
  let d = delta * motionDials.horizontalScrollGain
  if (mode === 'drag') d *= TUNNEL_DRAG_SCALE
  if (motionDials.invertScrollX) d *= -1
  scrollXVel += d
  scrollXVel = MathUtils.clamp(
    scrollXVel,
    -motionDials.horizontalVelMax,
    motionDials.horizontalVelMax,
  )
}

/** Vertical camera strafe (screen Y). Pointer down → positive movementY → camera moves up (inverted from screen “grab”). */
function addVerticalStrafeImpulse(delta: number, mode: 'wheel' | 'drag') {
  let d = delta * motionDials.horizontalScrollGain
  if (mode === 'drag') d *= TUNNEL_DRAG_SCALE
  scrollYVel += d
  scrollYVel = MathUtils.clamp(
    scrollYVel,
    -motionDials.horizontalVelMax,
    motionDials.horizontalVelMax,
  )
}

window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    if (!initialLoadComplete) return
    if (focusedMesh) beginFocusExit()
    addHorizontalImpulse(e.deltaX, 'wheel')
    let dy = e.deltaY * motionDials.wheelGain
    if (motionDials.invertScrollZ) dy *= -1
    scrollZVel += dy
    scrollZVel = MathUtils.clamp(scrollZVel, motionDials.zVelMin, motionDials.zVelMax)
  },
  { passive: false },
)

/* ── Raycasting & click-to-focus ─────────────────────────── */

const raycaster = new Raycaster()
const ndcScratch = new Vector2()

function ndcFromClient(clientX: number, clientY: number): Vector2 {
  const r = canvas.getBoundingClientRect()
  const nx = (clientX - r.left) / Math.max(r.width, 1e-6)
  const ny = (clientY - r.top) / Math.max(r.height, 1e-6)
  ndcScratch.set(nx * 2 - 1, -(ny * 2 - 1))
  return ndcScratch
}

const CAM_PAN_CLAMP = 12
const focusTarget = new Vector3()
let focusedMesh: Mesh | null = null

const FOCUS_TRANSITION_S = 0.2
const focusBlend = { value: 0 }
const gradientBlend = { value: 0 }

function beginFocusExit() {
  gsap.killTweensOf(camera.position)
  gsap.killTweensOf(focusBlend)
  gsap.killTweensOf(gradientBlend)

  if (gradientBlend.value === 0) {
    detailPanel.hideImmediate()
    focusedMesh = null
    scrollHint.classList.remove('scroll-hint--hidden')
    return
  }

  gsap.to(focusBlend, {
    value: 0,
    duration: FOCUS_TRANSITION_S,
    ease: 'power2.out',
  })
  gsap.to(gradientBlend, {
    value: 0,
    duration: FOCUS_TRANSITION_S,
    ease: 'power2.out',
    onComplete: () => {
      detailPanel.hideImmediate()
      focusBlend.value = 0
      gradientBlend.value = 0
      focusedMesh = null
      scrollHint.classList.remove('scroll-hint--hidden')
    },
  })
}

function beginGradientEnter() {
  gsap.killTweensOf(gradientBlend)
  gradientBlend.value = 0
  gsap.to(gradientBlend, {
    value: 1,
    duration: focusDials.duration,
    ease: focusDials.ease,
  })
}

function beginTextEnter() {
  gsap.killTweensOf(focusBlend)
  focusBlend.value = 0
  gsap.to(focusBlend, { value: 1, duration: FOCUS_TRANSITION_S, ease: 'power2.out' })
}

const scrollHint = document.getElementById('scroll-hint')!
const filterLoadingEl = document.getElementById('filter-loading')!

const detailPanel = createDetailPanel({ onClose: beginFocusExit })
app.appendChild(detailPanel.el)

const loadingProgressTrack = document.getElementById('loading-progress-root')!
loadingProgressTrack.innerHTML =
  '<div style="width:12rem;height:4px;border-radius:9999px;background:#e5e5e5;overflow:hidden">' +
  '<div id="loading-bar" style="width:0%;height:100%;border-radius:9999px;background:#1a1a1a;transition:width .2s ease"></div></div>'
const loadingBar = document.getElementById('loading-bar')!
function setLoadingProgress(value: number) {
  loadingBar.style.width = `${Math.min(100, Math.max(0, value))}%`
}

mountLoadingPreviewCarousel(document.getElementById('loading-preview-root')!)

/* ── Hover cursor label ──────────────────────────────────── */

const cursorLabel = document.createElement('div')
cursorLabel.id = 'tunnel-cursor-label'
app.appendChild(cursorLabel)

const historyTray = createHistoryTray(app)
app.appendChild(historyTray.el)

function focusMeshOnScreen(mesh: Mesh, onSettled?: () => void) {
  focusedMesh = mesh
  mesh.updateMatrixWorld(true)
  const worldPos = new Vector3()
  mesh.getWorldPosition(worldPos)

  // Shift mesh ~150px above vertical center by moving the camera downward
  // by the equivalent world-unit distance at the focus depth.
  const d = focusDials.cameraToMeshDistance
  const visibleH = 2 * d * Math.tan((camera.fov / 2) * (Math.PI / 180))
  const yShift = (150 / window.innerHeight) * visibleH

  focusTarget.set(
MathUtils.clamp(worldPos.x, -CAM_PAN_CLAMP, CAM_PAN_CLAMP),
MathUtils.clamp(worldPos.y, -CAM_PAN_CLAMP, CAM_PAN_CLAMP) - yShift,
    worldPos.z + focusDials.cameraToMeshDistance,
  )

  gsap.killTweensOf(camera.position)
  gsap.killTweensOf(mesh.rotation)
  scrollZVel = 0
  scrollXVel = 0
  scrollYVel = 0
  gsap.to(camera.position, {
    x: focusTarget.x,
    y: focusTarget.y,
    z: focusTarget.z,
    duration: focusDials.duration,
    ease: focusDials.ease,
    onComplete: onSettled,
  })
  gsap.to(mesh.rotation, {
    x: 0,
    y: 0,
    z: 0,
    duration: focusDials.duration,
    ease: focusDials.ease,
  })
}

let clickDownX = 0
let clickDownY = 0
let clickPointerId = -1
/** True after pointer moved past threshold — click-to-focus is suppressed. */
let tunnelDrag = false

const TUNNEL_DRAG_THRESHOLD_PX = 8

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  tunnelDrag = false
  clickDownX = e.clientX
  clickDownY = e.clientY
  clickPointerId = e.pointerId
})

function showCursorLabel(text: string, cx: number, cy: number) {
  cursorLabel.textContent = text
  cursorLabel.style.left = `${cx + 12}px`
  cursorLabel.style.top = `${cy + 12}px`
  cursorLabel.classList.add('visible')
}

let cursorLabelFading = false

function hideCursorLabel() {
  cursorLabel.classList.remove('visible')
  canvas.style.cursor = 'default'
}

function beginCursorLabelFade() {
  cursorLabelFading = true
  cursorLabel.classList.remove('visible')
  canvas.style.cursor = 'default'
}

function moveCursorLabel(cx: number, cy: number) {
  cursorLabel.style.left = `${cx + 12}px`
  cursorLabel.style.top = `${cy + 12}px`
}

let hoveredMesh: Mesh | null = null

cursorLabel.addEventListener('transitionend', () => {
  if (cursorLabelFading) cursorLabelFading = false
})

canvas.addEventListener('pointermove', (e) => {
  if (!initialLoadComplete) return

  if (e.pointerId === clickPointerId && (e.buttons & 1)) {
    const adx = e.clientX - clickDownX
    const ady = e.clientY - clickDownY
    if (!tunnelDrag && Math.hypot(adx, ady) >= TUNNEL_DRAG_THRESHOLD_PX) {
      tunnelDrag = true
      beginFocusExit()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* already captured */
      }
      hoveredMesh = null
      hideCursorLabel()
      cursorLabelFading = false
    }
    if (tunnelDrag) {
      e.preventDefault()
      addHorizontalImpulse(e.movementX, 'drag')
      addVerticalStrafeImpulse(e.movementY, 'drag')
      canvas.style.cursor = 'grabbing'
      return
    }
  }

  if (cursorLabelFading) moveCursorLabel(e.clientX, e.clientY)

  if (focusedMesh) {
    if (hoveredMesh) { hoveredMesh = null; hideCursorLabel(); cursorLabelFading = false }
    return
  }

  ndcFromClient(e.clientX, e.clientY)
  raycaster.setFromCamera(ndcScratch, camera)
  const hits = raycaster.intersectObjects(meshes, false)
  const hit = hits[0]

  if (hit && hit.object instanceof Mesh) {
    const mesh = hit.object
    const article = meshArticleMap.get(mesh)
    if (article) {
      cursorLabelFading = false
      hoveredMesh = mesh
      canvas.style.cursor = 'pointer'
      showCursorLabel(article.title, e.clientX, e.clientY)
      return
    }
  }

  if (hoveredMesh) { hoveredMesh = null; beginCursorLabelFade() }
})

canvas.addEventListener('pointerleave', () => {
  if (hoveredMesh) { hoveredMesh = null; beginCursorLabelFade() }
})

canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId !== clickPointerId) return
  tunnelDrag = false
  canvas.style.cursor = 'default'
  try {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  } catch {
    /* */
  }
  clickPointerId = -1
})

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || e.pointerId !== clickPointerId) return
  const wasTunnelDrag = tunnelDrag
  tunnelDrag = false
  canvas.style.cursor = 'default'
  try {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  } catch {
    /* */
  }
  clickPointerId = -1
  if (wasTunnelDrag) return

  const dx = e.clientX - clickDownX
  const dy = e.clientY - clickDownY
  if (Math.hypot(dx, dy) > 10) return

  ndcFromClient(e.clientX, e.clientY)
  raycaster.setFromCamera(ndcScratch, camera)
  const hits = raycaster.intersectObjects(meshes, false)
  const hit = hits[0]
  if (!hit) return
  const mesh = hit.object
  if (mesh instanceof Mesh) {
    hoveredMesh = null
    cursorLabelFading = false
    hideCursorLabel()
    scrollHint.classList.add('scroll-hint--hidden')
    beginGradientEnter()
    const article = meshArticleMap.get(mesh)
    if (article) {
      historyTray.push(article)
      fetchLinkedExtract(article.title)
    }
    focusMeshOnScreen(mesh, () => {
      if (article) detailPanel.show(article)
      beginTextEnter()
    })
  }
})

/* ── Placeholder texture ─────────────────────────────────── */

function makeImageTexture(_seed: number): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 2
  c.height = 2
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#d0d0d0'
  ctx.fillRect(0, 0, 2, 2)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/* ── Mesh pool ───────────────────────────────────────────── */

let sharedPlaneGeometry: PlaneGeometry | null = null
const meshes: Mesh[] = []

function syncSharedPlaneGeometry(): void {
  const w = imageDials.planeWidth
  const h = imageDials.planeHeight
  const needNew =
    !sharedPlaneGeometry ||
    sharedPlaneGeometry.parameters.width !== w ||
    sharedPlaneGeometry.parameters.height !== h
  if (!needNew) return
  const old = sharedPlaneGeometry
  sharedPlaneGeometry = new PlaneGeometry(w, h)
  for (const m of meshes) {
    m.geometry = sharedPlaneGeometry
  }
  old?.dispose()
}

function removeMeshAtEnd(): void {
  const m = meshes.pop()
  if (!m) return
  meshArticleMap.delete(m)
  meshAspectMap.delete(m)
  scene.remove(m)
  const mat = m.material as MeshBasicMaterial
  mat.map?.dispose()
  mat.dispose()
}

function syncMeshCount(): void {
  const raw = Math.round(imageDials.planeCount)
  const target = MathUtils.clamp(raw, 4, 120)
  if (target !== imageDials.planeCount) {
    imageDials.planeCount = target
    const input = document.getElementById('image-dial-planeCount') as HTMLInputElement | null
    if (input) input.value = String(target)
  }
  syncSharedPlaneGeometry()
  while (meshes.length > target) {
    removeMeshAtEnd()
  }
  while (meshes.length < target) {
    const i = meshes.length
    meshes.push(createMeshForIndex(i))
  }
}

function createMeshForIndex(i: number): Mesh {
  const tex = makeImageTexture(i + 1)
  const mat = new MeshBasicMaterial({
    map: tex,
    side: DoubleSide,
    transparent: true,
    opacity: imageDials.planeOpacity,
    fog: false,
  })
  const mesh = new Mesh(sharedPlaneGeometry!, mat)
  mesh.position.x = (Math.random() - 0.5) * imageDials.fieldX * imageDials.initialSpread
  mesh.position.y = (Math.random() - 0.5) * imageDials.fieldY * imageDials.initialSpread
  mesh.position.z = imageDials.tunnelInitialZBase - i * imageDials.zSpacing
  mesh.rotation.x = (Math.random() - 0.5) * imageDials.rotationXInitial
  mesh.rotation.y = (Math.random() - 0.5) * imageDials.rotationYInitial
  mesh.rotation.z = (Math.random() - 0.5) * imageDials.rotationZInitial
  if (!initialLoadComplete) mesh.visible = false
  scene.add(mesh)
  return mesh
}

syncMeshCount()

/* ── Wikipedia prefill ───────────────────────────────────── */

/**
 * Loads a Wikipedia thumbnail onto every mesh before the entrance animation.
 * Uses takeNext + decode validation; retries with new articles until each plane succeeds.
 */
async function loadWikiImagesProgressively(): Promise<void> {
  const allMeshes = meshes.slice()
  const total = allMeshes.length || 1
  let loaded = 0

  setLoadingProgress(10)

  await earlyFetch
  await ensurePool(total)

  setLoadingProgress(20)

  /** Keep trying articles until this mesh has a real, drawable thumbnail. */
  async function loadMeshUntilTextureOk(mesh: Mesh): Promise<void> {
    let articleAttempts = 0
    const maxArticles = 80
    while (articleAttempts < maxArticles) {
      let article = await takeNext()
      if (!article) {
        await fetchBatch(20)
        articleAttempts++
        continue
      }
      meshArticleMap.set(mesh, article)
      const ok = await loadWikiTexture(mesh, article)
      if (ok) return
      meshArticleMap.delete(mesh)
      articleAttempts++
    }
  }

  const CONCURRENCY = 5
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= allMeshes.length) return
      await loadMeshUntilTextureOk(allMeshes[i])
      loaded++
      setLoadingProgress(20 + Math.round((loaded / total) * 70))
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, allMeshes.length) }, () => worker()),
  )

  setLoadingProgress(100)
  playInitialEntrance()
}

function playInitialEntrance(): void {
  const indicator = document.getElementById('loading-indicator')
  if (indicator) {
    gsap.to(indicator, {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => indicator.remove(),
    })
  }

  const ordered = [...meshes]
  camera.getWorldPosition(scratchCamPos)
  ordered.sort((a, b) => {
    const da = a.position.distanceToSquared(scratchCamPos)
    const db = b.position.distanceToSquared(scratchCamPos)
    return da - db
  })

  const STAGGER = 0.03
  const d = motionDials.tunnelSpawnDuration

  ordered.forEach((mesh, i) => {
    const delay = i * STAGGER
    const mat = mesh.material as MeshBasicMaterial

    const targetScaleX = mesh.scale.x
    const targetScaleY = mesh.scale.y
    const targetY = mesh.position.y

    mesh.scale.set(0.001, 0.001, 1)
    mesh.position.y = targetY - motionDials.tunnelSpawnYOffset
    mat.opacity = 0
    mesh.visible = true

    gsap.to(mesh.position, { y: targetY, duration: d, ease: tunnelSpawnEase, delay })
    gsap.to(mesh.scale, { x: targetScaleX, y: targetScaleY, duration: d, ease: tunnelSpawnEase, delay })
    gsap.to(mat, { opacity: imageDials.planeOpacity, duration: d, ease: tunnelSpawnEase, delay })
  })

  initialLoadComplete = true

  const entranceDone =
    ordered.length > 0 ? (ordered.length - 1) * STAGGER + d : 0
  gsap.delayedCall(entranceDone, () => {
    scrollHint.classList.remove('scroll-hint--pending')
    document.getElementById('topic-filter-root')?.classList.add('is-visible')
  })
}

void loadWikiImagesProgressively()

/* ── Topic filter ────────────────────────────────────────── */

let filterReloading = false

async function reloadTunnelForFilter(): Promise<void> {
  if (filterReloading) return
  filterReloading = true
  filterLoadingEl.hidden = false

  try {
    const EXIT_DURATION = 0.3
    const ENTER_DURATION = motionDials.tunnelSpawnDuration
    const STAGGER = 0.03

    const target = Math.round(imageDials.planeCount)
    const batchSize = 20
    const batchesNeeded = Math.ceil((target + 20) / (batchSize * 0.6))
    await wikiFetchBatchesParallel(batchesNeeded, batchSize)
    await ensurePool(target)

    // Sort closest-to-camera first
    camera.getWorldPosition(scratchCamPos)
    const ordered = [...meshes].sort((a, b) => {
      const da = a.position.distanceToSquared(scratchCamPos)
      const db = b.position.distanceToSquared(scratchCamPos)
      return da - db
    })

    await new Promise<void>((resolve) => {
      let settled = 0
      const total = ordered.length
      if (total === 0) { resolve(); return }

      ordered.forEach((mesh, i) => {
        const mat = mesh.material as MeshBasicMaterial
        const delay = i * STAGGER

        gsap.killTweensOf(mesh.scale)
        gsap.killTweensOf(mesh.position)
        gsap.killTweensOf(mat)

        // Phase 1: fade out + shrink
        gsap.to(mat, { opacity: 0, duration: EXIT_DURATION, ease: 'power2.in', delay })
        gsap.to(mesh.scale, {
          x: 0.001, y: 0.001,
          duration: EXIT_DURATION,
          ease: 'power2.in',
          delay,
          onComplete: () => {
            // Phase 2: swap texture while invisible
            meshArticleMap.delete(mesh)
            meshAspectMap.delete(mesh)
            assignArticleToMesh(mesh).then(() => {
              const targetScaleX = mesh.scale.x
              const targetScaleY = mesh.scale.y

              // Phase 3: fade in + scale up
              mesh.scale.set(0.001, 0.001, 1)
              gsap.to(mesh.scale, {
                x: targetScaleX, y: targetScaleY,
                duration: ENTER_DURATION,
                ease: tunnelSpawnEase,
              })
              gsap.to(mat, {
                opacity: imageDials.planeOpacity,
                duration: ENTER_DURATION,
                ease: tunnelSpawnEase,
                onComplete: () => { if (++settled === total) resolve() },
              })
            })
          },
        })
      })
    })
  } finally {
    filterLoadingEl.hidden = true
    filterReloading = false
  }
}

const scheduleFilterMount = () =>
  import('./topic-filter-mount.tsx').then(({ mountTopicFilter }) => {
    mountTopicFilter(document.getElementById('topic-filter-root')!, (query: string | null) => {
      wikiSetFilter(query)
      void reloadTunnelForFilter()
    })
  })
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => void scheduleFilterMount())
} else {
  setTimeout(() => void scheduleFilterMount(), 200)
}

/* ── Tunnel loop ─────────────────────────────────────────── */

function recyclePlaneZ(): number {
  return camera.position.z + motionDials.recycleAhead
}

function tunnelLength(): number {
  return imageDials.planeCount * imageDials.zSpacing
}

const clock = new Clock()

let lastPlaneW = imageDials.planeWidth

function tick() {
  if (imageDials.planeWidth !== lastPlaneW) {
    lastPlaneW = imageDials.planeWidth
    syncSharedPlaneGeometry()
    for (const [mesh, ar] of meshAspectMap) applyAspectScale(mesh, ar)
  }
  const dt = Math.min(clock.getDelta(), motionDials.maxDt)

  scrollZVel *= motionDials.momentumDecay
  if (
    motionDials.momentumCutoff > 0 &&
    Math.abs(scrollZVel) < motionDials.momentumCutoff
  ) {
    scrollZVel = 0
  }

  scrollXVel *= motionDials.momentumDecay
  if (
    motionDials.momentumCutoff > 0 &&
    Math.abs(scrollXVel) < motionDials.momentumCutoff
  ) {
    scrollXVel = 0
  }

  scrollYVel *= motionDials.momentumDecay
  if (
    motionDials.momentumCutoff > 0 &&
    Math.abs(scrollYVel) < motionDials.momentumCutoff
  ) {
    scrollYVel = 0
  }

  const scrollingZ = Math.abs(scrollZVel) > 1e-6
  if (scrollingZ) {
    const vz = scrollZVel
    const tLen = tunnelLength()
    for (const mesh of meshes) {
      mesh.position.z += vz * dt

      if (mesh.position.z > recyclePlaneZ()) {
        mesh.visible = true
        mesh.position.z -= tLen
        mesh.position.z += motionDials.tunnelRecycleZCloser
        mesh.position.x =
          (Math.random() - 0.5) * imageDials.fieldX * imageDials.recycleSpreadX
        const targetY =
          (Math.random() - 0.5) * imageDials.fieldY * imageDials.recycleSpreadY
        mesh.rotation.x = (Math.random() - 0.5) * imageDials.rotationXRecycle
        mesh.rotation.y = (Math.random() - 0.5) * imageDials.rotationYRecycle
        mesh.rotation.z = (Math.random() - 0.5) * imageDials.rotationZRecycle

        gsap.killTweensOf(mesh.position)
        gsap.killTweensOf(mesh.scale)
        gsap.killTweensOf(mesh.material)
        const targetScaleX = mesh.scale.x
        const targetScaleY = mesh.scale.y
        mesh.scale.set(0.001, 0.001, 1)
        mesh.position.y = targetY - motionDials.tunnelSpawnYOffset
        const mat = mesh.material as MeshBasicMaterial
        mat.opacity = 0

        const d = motionDials.tunnelSpawnDuration
        gsap.to(mesh.position, { y: targetY, duration: d, ease: tunnelSpawnEase })
        gsap.to(mesh.scale, {
          x: targetScaleX,
          y: targetScaleY,
          z: 1,
          duration: d,
          ease: tunnelSpawnEase,
        })
        gsap.to(mat, {
          opacity: imageDials.planeOpacity,
          duration: d,
          ease: tunnelSpawnEase,
        })

        meshArticleMap.delete(mesh)
        meshAspectMap.delete(mesh)
        assignArticleToMesh(mesh)
      }
    }
  }

  if (initialLoadComplete) {
    prioritizeFrustumMeshLoads()
  }

  if (Math.abs(scrollXVel) > 1e-6) {
    camera.position.x += scrollXVel * dt
  }

  if (Math.abs(scrollYVel) > 1e-6) {
    camera.position.y += scrollYVel * dt
  }

  camera.position.x = MathUtils.clamp(camera.position.x, -CAM_PAN_CLAMP, CAM_PAN_CLAMP)
  camera.position.y = MathUtils.clamp(camera.position.y, -CAM_PAN_CLAMP, CAM_PAN_CLAMP)

  if (!detailPanel.el.hidden) {
    detailPanel.el.style.opacity = String(focusBlend.value)
  }

  renderer.clear()

  if (focusedMesh) {
    // Pass 1: all meshes on white background
    scene.background = sceneBg
    renderer.render(scene, camera)

    // Pass 2: gradient overlay (fades in with camera fly)
    gradMat.uniforms.uOpacity.value = gradientBlend.value
    gradMat.uniforms.uSolidBand.value = gradientDials.solidBand
    gradMat.uniforms.uTopOpacity.value = gradientDials.topOpacity
    gradMat.uniforms.uBotOpacity.value = gradientDials.bottomOpacity
    renderer.render(gradScene, gradCam)

    // Pass 3: focused mesh on top of gradient (clear depth so it always draws on top)
    renderer.clearDepth()
    scene.background = null
    for (const m of meshes) m.visible = m === focusedMesh
    renderer.render(scene, camera)
    for (const m of meshes) m.visible = true
    scene.background = sceneBg
  } else {
    scene.background = sceneBg
    renderer.render(scene, camera)
  }

  if (historyTray.getExpanded()) {
    const snap = historyTray.backdropSnapCanvas
    const ctx = snap.getContext('2d', { alpha: false })
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, snap.width, snap.height)
    }
  }
}

gsap.ticker.add(tick)

/* ── Resize ──────────────────────────────────────────────── */

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  historyTray.resizeBackdropSnap()
}
resize()
window.addEventListener('resize', resize)
