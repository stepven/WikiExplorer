import './style.css'
import './tailwind.css'
import * as THREE from 'three'
import gsap from 'gsap'
import { motionDials } from './motion-dials'
import { tunnelSpawnEase } from './tunnel-spawn-ease'
import { focusDials } from './focus-dials'
import { imageDials } from './image-dials'
import { gradientDials } from './gradient-dials'

import {
  fetchBatch as wikiFetchBatch,
  next as wikiNext,
  prefill as wikiPrefill,
  setFilter as wikiSetFilter,
  type WikiArticle,
} from './wiki-service'
import { createDetailPanel } from './wiki-detail-panel'
import { createHistoryTray } from './image-history-tray'
import { mountTopicFilter } from './topic-filter-mount.tsx'

/* ── DOM ─────────────────────────────────────────────────── */

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <canvas id="webgl" aria-label="Wikipedia image tunnel"></canvas>
  <div id="loading-indicator" class="loading-indicator">
    <h1 class="loading-indicator__title">Wiki Explorer</h1>
    <p class="loading-indicator__status">
      <svg class="loading-indicator__spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>
      loading...
    </p>
  </div>
  <div id="topic-filter-root"></div>
  <div class="bottom-hint-stack">
    <div id="filter-loading" class="filter-loading" hidden role="status" aria-live="polite">
      <svg class="filter-loading__spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>
      <span class="filter-loading__label">Updating images…</span>
    </div>
    <p id="scroll-hint" class="scroll-hint scroll-hint--pending">scroll to explore, interact with an image to read more</p>
  </div>
`

/* ── Three.js core ───────────────────────────────────────── */

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')!

const scene = new THREE.Scene()
const sceneBg = new THREE.Color(0xf0f0f0)
scene.background = sceneBg
scene.fog = null

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120)
camera.position.set(0, 0, 7.5)

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.autoClear = false

scene.add(new THREE.AmbientLight(0xf0f0f0, 0.48))
const fill = new THREE.DirectionalLight(0xf0f0f0, 1)
fill.position.set(2, 4, 8)
scene.add(fill)

/* ── Focus gradient (fullscreen quad via analytical shader) ── */

const gradMat = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
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
const gradQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradMat)
gradQuad.frustumCulled = false
const gradScene = new THREE.Scene()
gradScene.add(gradQuad)
const gradCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

/* ── Wikipedia texture loading ───────────────────────────── */

const texLoader = new THREE.TextureLoader()
texLoader.setCrossOrigin('anonymous')

const meshArticleMap = new Map<THREE.Mesh, WikiArticle>()
const meshAspectMap = new Map<THREE.Mesh, number>()
const maxAniso = renderer.capabilities.getMaxAnisotropy()

function applyAspectScale(mesh: THREE.Mesh, ar: number): void {
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

function loadWikiTexture(mesh: THREE.Mesh, article: WikiArticle): Promise<void> {
  return new Promise((resolve) => {
    texLoader.load(
      article.thumbUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = maxAniso
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map?.dispose()
        mat.map = tex
        mat.needsUpdate = true
        const img = tex.image as {
          naturalWidth?: number
          naturalHeight?: number
          width?: number
          height?: number
        }
        const w = img?.naturalWidth ?? img?.width ?? 0
        const h = img?.naturalHeight ?? img?.height ?? 0
        if (w > 0 && h > 0) {
          const ar = w / h
          meshAspectMap.set(mesh, ar)
          gsap.killTweensOf(mesh.scale)
          applyAspectScale(mesh, ar)
        }
        resolve()
      },
      undefined,
      () => {
        resolve()
      },
    )
  })
}

function assignArticleToMesh(mesh: THREE.Mesh): Promise<void> {
  const article = wikiNext()
  if (!article) return Promise.resolve()
  meshArticleMap.set(mesh, article)
  return loadWikiTexture(mesh, article)
}

let initialLoadComplete = false

const scratchCamPos = new THREE.Vector3()
const scratchMeshPos = new THREE.Vector3()
const scratchSphere = new THREE.Sphere()

/** Meshes whose bounds intersect the camera frustum at load (closest first). */
function getInitiallyVisibleMeshes(
  cam: THREE.PerspectiveCamera,
  meshList: THREE.Mesh[],
): THREE.Mesh[] {
  cam.updateMatrixWorld(true)
  const frustum = new THREE.Frustum()
  const m = new THREE.Matrix4().multiplyMatrices(
    cam.projectionMatrix,
    cam.matrixWorldInverse,
  )
  frustum.setFromProjectionMatrix(m)

  const visible: THREE.Mesh[] = []
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

/* ── Scroll state ────────────────────────────────────────── */

let scrollZVel = 0
let scrollXVel = 0

window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    if (focusedMesh) beginFocusExit()
    let dx = e.deltaX * motionDials.horizontalScrollGain
    if (motionDials.invertScrollX) dx *= -1
    let dy = e.deltaY * motionDials.wheelGain
    if (motionDials.invertScrollZ) dy *= -1
    scrollZVel += dy
    scrollZVel = THREE.MathUtils.clamp(scrollZVel, motionDials.zVelMin, motionDials.zVelMax)

    scrollXVel += dx
    scrollXVel = THREE.MathUtils.clamp(
      scrollXVel,
      -motionDials.horizontalVelMax,
      motionDials.horizontalVelMax,
    )
  },
  { passive: false },
)

/* ── Raycasting & click-to-focus ─────────────────────────── */

const raycaster = new THREE.Raycaster()
const ndcScratch = new THREE.Vector2()

function ndcFromClient(clientX: number, clientY: number): THREE.Vector2 {
  const r = canvas.getBoundingClientRect()
  const nx = (clientX - r.left) / Math.max(r.width, 1e-6)
  const ny = (clientY - r.top) / Math.max(r.height, 1e-6)
  ndcScratch.set(nx * 2 - 1, -(ny * 2 - 1))
  return ndcScratch
}

const CAM_PAN_CLAMP = 12
const focusTarget = new THREE.Vector3()
let focusedMesh: THREE.Mesh | null = null

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

const historyTray = createHistoryTray(app)
app.appendChild(historyTray.el)

function focusMeshOnScreen(mesh: THREE.Mesh, onSettled?: () => void) {
  focusedMesh = mesh
  mesh.updateMatrixWorld(true)
  const worldPos = new THREE.Vector3()
  mesh.getWorldPosition(worldPos)

  // Shift mesh ~150px above vertical center by moving the camera downward
  // by the equivalent world-unit distance at the focus depth.
  const d = focusDials.cameraToMeshDistance
  const visibleH = 2 * d * Math.tan((camera.fov / 2) * (Math.PI / 180))
  const yShift = (150 / window.innerHeight) * visibleH

  focusTarget.set(
    THREE.MathUtils.clamp(worldPos.x, -CAM_PAN_CLAMP, CAM_PAN_CLAMP),
    THREE.MathUtils.clamp(worldPos.y, -CAM_PAN_CLAMP, CAM_PAN_CLAMP) - yShift,
    worldPos.z + focusDials.cameraToMeshDistance,
  )

  gsap.killTweensOf(camera.position)
  gsap.killTweensOf(mesh.rotation)
  scrollZVel = 0
  scrollXVel = 0
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

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  clickDownX = e.clientX
  clickDownY = e.clientY
  clickPointerId = e.pointerId
})

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || e.pointerId !== clickPointerId) return
  clickPointerId = -1
  const dx = e.clientX - clickDownX
  const dy = e.clientY - clickDownY
  if (Math.hypot(dx, dy) > 10) return

  ndcFromClient(e.clientX, e.clientY)
  raycaster.setFromCamera(ndcScratch, camera)
  const hits = raycaster.intersectObjects(meshes, false)
  const hit = hits[0]
  if (!hit) return
  const mesh = hit.object
  if (mesh instanceof THREE.Mesh) {
    scrollHint.classList.add('scroll-hint--hidden')
    beginGradientEnter()
    const article = meshArticleMap.get(mesh)
    if (article) {
      historyTray.push(article)
    }
    focusMeshOnScreen(mesh, () => {
      if (article) detailPanel.show(article)
      beginTextEnter()
    })
  }
})

/* ── Placeholder texture ─────────────────────────────────── */

function makeImageTexture(_seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 2
  c.height = 2
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#d0d0d0'
  ctx.fillRect(0, 0, 2, 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ── Mesh pool ───────────────────────────────────────────── */

let sharedPlaneGeometry: THREE.PlaneGeometry | null = null
const meshes: THREE.Mesh[] = []

function syncSharedPlaneGeometry(): void {
  const w = imageDials.planeWidth
  const h = imageDials.planeHeight
  const needNew =
    !sharedPlaneGeometry ||
    sharedPlaneGeometry.parameters.width !== w ||
    sharedPlaneGeometry.parameters.height !== h
  if (!needNew) return
  const old = sharedPlaneGeometry
  sharedPlaneGeometry = new THREE.PlaneGeometry(w, h)
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
  const mat = m.material as THREE.MeshBasicMaterial
  mat.map?.dispose()
  mat.dispose()
}

function createMeshForIndex(i: number): THREE.Mesh {
  const tex = makeImageTexture(i + 1)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: imageDials.planeOpacity,
    fog: false,
  })
  const mesh = new THREE.Mesh(sharedPlaneGeometry!, mat)
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

function syncMeshCount(): void {
  const raw = Math.round(imageDials.planeCount)
  const target = THREE.MathUtils.clamp(raw, 4, 120)
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

syncMeshCount()

/* ── Wikipedia prefill ───────────────────────────────────── */

/**
 * Fetches all batches and waits for every texture to finish loading before
 * revealing the tunnel. Once ready, meshes appear with a staggered entrance
 * animation (closest to camera first).
 */
async function loadWikiImagesProgressively(): Promise<void> {
  const loadPromises: Promise<void>[] = []

  const visibleFirst = getInitiallyVisibleMeshes(camera, meshes)
  if (visibleFirst.length > 0) {
    await wikiPrefill(visibleFirst.length)
    for (const mesh of visibleFirst) {
      if (!meshArticleMap.has(mesh)) loadPromises.push(assignArticleToMesh(mesh))
    }
  }

  const target = Math.round(imageDials.planeCount)
  const batchSize = 20
  const batchesNeeded = Math.ceil((target + 20) / (batchSize * 0.6))

  for (let i = 0; i < batchesNeeded; i++) {
    await wikiFetchBatch(batchSize)
    for (const mesh of meshes) {
      if (!meshArticleMap.has(mesh)) {
        loadPromises.push(assignArticleToMesh(mesh))
      }
    }
    if (meshes.every((m) => meshArticleMap.has(m))) break
  }

  await Promise.all(loadPromises)
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
    const mat = mesh.material as THREE.MeshBasicMaterial

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

    // Prefetch articles so they're pooled and ready before animation starts
    const target = Math.round(imageDials.planeCount)
    const batchSize = 20
    const batchesNeeded = Math.ceil((target + 20) / (batchSize * 0.6))
    for (let i = 0; i < batchesNeeded; i++) {
      await wikiFetchBatch(batchSize)
    }

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
        const mat = mesh.material as THREE.MeshBasicMaterial
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

mountTopicFilter(document.getElementById('topic-filter-root')!, (query: string | null) => {
  wikiSetFilter(query)
  void reloadTunnelForFilter()
})

/* ── Tunnel loop ─────────────────────────────────────────── */

function recyclePlaneZ(): number {
  return camera.position.z + motionDials.recycleAhead
}

function tunnelLength(): number {
  return imageDials.planeCount * imageDials.zSpacing
}

const clock = new THREE.Clock()

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
        const mat = mesh.material as THREE.MeshBasicMaterial
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

        assignArticleToMesh(mesh)
      }
    }
  }

  if (Math.abs(scrollXVel) > 1e-6) {
    camera.position.x += scrollXVel * dt
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -CAM_PAN_CLAMP, CAM_PAN_CLAMP)
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, -CAM_PAN_CLAMP, CAM_PAN_CLAMP)

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
}

gsap.ticker.add(tick)

/* ── Resize ──────────────────────────────────────────────── */

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}
resize()
window.addEventListener('resize', resize)
