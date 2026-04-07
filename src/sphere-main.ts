import './style.css'
import * as THREE from 'three'
import gsap from 'gsap'
import { sphereDials, mountSphereDialKitPanel } from './sphere-dials'

/* ── DOM ─────────────────────────────────────────────────── */

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <canvas id="webgl" aria-label="Sphere image viewer"></canvas>
  <div class="hud">
    <header class="hud__header">
      <h1 class="hud__title">Sphere viewer</h1>
      <p class="hud__hint">
        <strong>Click + drag</strong> to look around.
        <strong>Scroll</strong> to fly through the sphere — images stream past while you stay at the center.
        Tune radius, density, momentum, and more in the <strong>Sphere dials</strong> panel.
      </p>
      <p class="hud__hint" style="margin:0"><a href="/" style="color:var(--app-accent)">← Back to tunnel</a></p>
    </header>
  </div>
  <div id="dialkit-stack" class="dialkit-stack">
    <div id="sphere-dialkit-root"></div>
  </div>
`

/* ── Three.js core ───────────────────────────────────────── */

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')!
canvas.style.cursor = 'grab'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x080810)

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200)
/* Camera stays at the origin for the entire session. */

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

scene.add(new THREE.AmbientLight(0xf0f0f0, 0.75))
const dirLight = new THREE.DirectionalLight(0xf0f0f0, 0.5)
dirLight.position.set(0, 0, 1)
camera.add(dirLight)
scene.add(camera)

/* ── Camera rotation (yaw / pitch from drag) ─────────────── */

let yaw = 0
let pitch = 0
let isDragging = false
let prevPointerX = 0
let prevPointerY = 0
let dragPointerId = -1

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  isDragging = true
  prevPointerX = e.clientX
  prevPointerY = e.clientY
  dragPointerId = e.pointerId
  canvas.setPointerCapture(e.pointerId)
  canvas.style.cursor = 'grabbing'
})

canvas.addEventListener('pointermove', (e) => {
  if (!isDragging || e.pointerId !== dragPointerId) return
  const dx = e.clientX - prevPointerX
  const dy = e.clientY - prevPointerY
  prevPointerX = e.clientX
  prevPointerY = e.clientY

  yaw -= dx * sphereDials.dragSensitivity
  pitch -= dy * sphereDials.dragSensitivity
  const limit = sphereDials.pitchLimit * THREE.MathUtils.DEG2RAD
  pitch = THREE.MathUtils.clamp(pitch, -limit, limit)

  camera.rotation.order = 'YXZ'
  camera.rotation.set(pitch, yaw, 0)
})

canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId !== dragPointerId) return
  isDragging = false
  dragPointerId = -1
  canvas.style.cursor = 'grab'
})

canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId !== dragPointerId) return
  isDragging = false
  dragPointerId = -1
  canvas.style.cursor = 'grab'
})

/* ── Scroll velocity ─────────────────────────────────────── */

let scrollVel = 0

window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    let dy = e.deltaY * sphereDials.scrollGain
    if (sphereDials.invertScroll) dy *= -1
    scrollVel += dy
    scrollVel = THREE.MathUtils.clamp(
      scrollVel,
      -sphereDials.scrollVelMax,
      sphereDials.scrollVelMax,
    )
  },
  { passive: false },
)

/* ── Procedural label textures ───────────────────────────── */

function makeImageTexture(seed: number): THREE.CanvasTexture {
  const w = Math.max(32, Math.round(sphereDials.texCanvasW))
  const h = Math.max(32, Math.round(sphereDials.texCanvasH))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const hue = (seed * 47 + seed * seed * 3) % 360
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, `hsl(${hue}, 42%, 18%)`)
  g.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 38%, 28%)`)
  g.addColorStop(1, `hsl(${(hue + 80) % 360}, 35%, 16%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = `hsl(${hue}, 55%, 55%)`
  ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.006))
  const pad = Math.round(Math.min(w, h) * 0.03)
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  const titlePx = Math.max(18, Math.round(Math.min(w, h) * 0.08))
  ctx.font = `600 ${titlePx}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`#${seed}`, w / 2, h / 2 - titlePx * 0.45)
  ctx.font = `300 ${Math.round(titlePx * 0.52)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText('drag + scroll', w / 2, h / 2 + titlePx * 0.55)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return tex
}

/* ── Fibonacci sphere distribution ───────────────────────── */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function fibonacciDirection(index: number, total: number): THREE.Vector3 {
  const y = 1 - (2 * (index + 0.5)) / total
  const radius = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = GOLDEN_ANGLE * index
  return new THREE.Vector3(
    radius * Math.cos(theta),
    y,
    radius * Math.sin(theta),
  )
}

/* ── Mesh management ─────────────────────────────────────── */

let geometry = new THREE.PlaneGeometry(
  sphereDials.planeWidth,
  sphereDials.planeHeight,
)
const meshes: THREE.Mesh[] = []

/** Orient a billboard so its front face (+Z) points toward the world origin. */
function orientTowardOrigin(mesh: THREE.Mesh) {
  mesh.lookAt(0, 0, 0)
  mesh.rotateY(Math.PI)
}

function createMeshAtIndex(i: number, total: number): THREE.Mesh {
  const dir = fibonacciDirection(i, total)
  const tex = makeImageTexture(i + 1)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: sphereDials.planeOpacity,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.position.copy(dir.multiplyScalar(sphereDials.shellRadius))
  scene.add(mesh)
  orientTowardOrigin(mesh)
  return mesh
}

function disposeMesh(mesh: THREE.Mesh) {
  scene.remove(mesh)
  gsap.killTweensOf(mesh.scale)
  gsap.killTweensOf(mesh.material)
  const mat = mesh.material as THREE.MeshBasicMaterial
  mat.map?.dispose()
  mat.dispose()
}

function initMeshes() {
  const count = THREE.MathUtils.clamp(Math.round(sphereDials.planeCount), 8, 200)
  for (let i = 0; i < count; i++) {
    meshes.push(createMeshAtIndex(i, count))
  }
}

function teardownMeshes() {
  while (meshes.length) disposeMesh(meshes.pop()!)
}

function rebuild() {
  teardownMeshes()
  const old = geometry
  geometry = new THREE.PlaneGeometry(sphereDials.planeWidth, sphereDials.planeHeight)
  old.dispose()
  scrollVel = 0
  initMeshes()
}

/* ── Random direction biased to a hemisphere ─────────────── */

const _rv = new THREE.Vector3()

function randomInHemisphere(axis: THREE.Vector3): THREE.Vector3 {
  do {
    _rv.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
  } while (_rv.lengthSq() > 1 || _rv.lengthSq() < 0.001)
  _rv.normalize()
  if (_rv.dot(axis) < 0) _rv.negate()
  return _rv
}

/* ── Recycle a mesh that drifted too far from the origin ── */

const _forward = new THREE.Vector3()

function recycleMesh(mesh: THREE.Mesh) {
  _forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
  const behindCamera = mesh.position.dot(_forward) < 0
  const spawnAxis = behindCamera
    ? _forward.clone()
    : _forward.clone().negate()

  const newDir = randomInHemisphere(spawnAxis)
  mesh.position.copy(newDir).multiplyScalar(sphereDials.shellRadius)
  orientTowardOrigin(mesh)

  const mat = mesh.material as THREE.MeshBasicMaterial
  gsap.killTweensOf(mesh.scale)
  gsap.killTweensOf(mat)
  mesh.scale.set(0.01, 0.01, 0.01)
  mat.opacity = 0
  gsap.to(mesh.scale, {
    x: 1,
    y: 1,
    z: 1,
    duration: sphereDials.spawnDuration,
    ease: 'power2.out',
  })
  gsap.to(mat, {
    opacity: sphereDials.planeOpacity,
    duration: sphereDials.spawnDuration,
    ease: 'power2.out',
  })
}

/* ── Main loop ───────────────────────────────────────────── */

const clock = new THREE.Clock()
const _drift = new THREE.Vector3()

function tick() {
  const dt = Math.min(clock.getDelta(), sphereDials.maxDt)

  scrollVel *= sphereDials.momentumDecay
  if (
    sphereDials.momentumCutoff > 0 &&
    Math.abs(scrollVel) < sphereDials.momentumCutoff
  ) {
    scrollVel = 0
  }

  if (Math.abs(scrollVel) > 1e-6) {
    _drift.set(0, 0, -1).applyQuaternion(camera.quaternion)
    _drift.multiplyScalar(-scrollVel * dt)
    for (const mesh of meshes) {
      mesh.position.add(_drift)
    }
  }

  const recycleRSq = sphereDials.recycleRadius * sphereDials.recycleRadius
  for (const mesh of meshes) {
    if (mesh.position.lengthSq() > recycleRSq) {
      recycleMesh(mesh)
    }
  }

  renderer.render(scene, camera)
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

/* ── Dials ───────────────────────────────────────────────── */

mountSphereDialKitPanel(document.getElementById('sphere-dialkit-root')!, {
  onRebuild: rebuild,
})

initMeshes()
