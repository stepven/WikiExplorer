import xIconSvg from '@phosphor-icons/core/assets/regular/x.svg?raw'
import gsap from 'gsap'
import { applyHistoryTrayHoverCssVars } from './history-tray-hover-dials'
import { imageDials } from './image-dials'
import { motionDials } from './motion-dials'
import { tunnelSpawnEase } from './tunnel-spawn-ease'
import type { WikiArticle } from './wiki-service'

const MAX_STACK_VISIBLE = 5

/** Orbit / fullscreen history tray tuning (formerly editable via a dial panel). */
const historyTrayDials = {
  baseSpeed: 0.025,
  tiltXDeg: 70,
  tiltZDeg: 90,
  imageMaxPx: 220,
  radiusFactor: 0.41,
  radiusMin: 120,
  radiusMax: 516,
  scrollGain: 0.002,
  friction: 0.8,
  focusStiffness: 32,
  focusDamping: 10,
  focusSettle: 0.001,
}

/**
 * Deterministic scatter offsets for each depth in the photo pile.
 * Each entry: [translateX px, translateY px, rotation deg]
 */
const SCATTER: [number, number, number][] = [
  [0, 0, -3],
  [14, -10, 5],
  [-8, 12, -7],
  [18, 8, 4],
  [-12, -6, 8],
  [6, 16, -5],
]

/* ── Orbit parameters ─────────────────────────────────────────────────────── */

function getOrbitRadius(n: number): number {
  const scale = Math.max(1, n / 6)
  const base =
    Math.min(window.innerWidth, window.innerHeight) * historyTrayDials.radiusFactor * scale
  return Math.max(historyTrayDials.radiusMin, Math.min(historyTrayDials.radiusMax * scale, base))
}

/** Angle on the ring where the focused item should sit (top of circle, “spotlight”). */
const SPOTLIGHT_ANGLE = 0

export function createHistoryTray(portalRoot: HTMLElement): {
  push: (article: WikiArticle) => void
  el: HTMLDivElement
  getExpanded: () => boolean
  backdropSnapCanvas: HTMLCanvasElement
  resizeBackdropSnap: () => void
} {
  const entries: WikiArticle[] = []
  let expanded = false
  let detailOpen = false

  /* ── Orbit state ─────────────────────────────────────── */
  let orbitItems: HTMLElement[] = []
  let orbitRadius = getOrbitRadius(entries.length)
  let orbitTickerBound: (() => void) | null = null
  let orbitPhase = 0 // accumulated angle (radians)
  let orbitVel = historyTrayDials.baseSpeed // current angular velocity
  let orbitPrevTime = 0
  let focusTarget: number | null = null // target phase when focusing an item
  let focusArticle: WikiArticle | null = null
  let arcMode = false

  /* ── Root element ──────────────────────────────────────── */

  const el = document.createElement('div')
  el.className = 'history-tray'
  el.hidden = true

  /* ── Collapsed mini-stack ──────────────────────────────── */

  const stack = document.createElement('div')
  stack.className = 'history-tray__stack'
  el.appendChild(stack)

  const badge = document.createElement('span')
  badge.className = 'history-tray__badge'
  el.appendChild(badge)

  /* ── Fullscreen overlay ────────────────────────────────── */

  const fullscreen = document.createElement('div')
  fullscreen.className = 'history-tray__fullscreen'
  fullscreen.hidden = true

  const fsBackdrop = document.createElement('div')
  fsBackdrop.className = 'history-tray__fs-backdrop'
  fsBackdrop.hidden = true
  /** Appended to #app (not under .history-tray). Blur = snapshot canvas + CSS filter (see main.ts). */
  portalRoot.appendChild(fsBackdrop)

  const fsBackdropSnap = document.createElement('canvas')
  fsBackdropSnap.className = 'history-tray__fs-backdrop-snap'
  fsBackdropSnap.setAttribute('aria-hidden', 'true')

  const fsBackdropTint = document.createElement('div')
  fsBackdropTint.className = 'history-tray__fs-backdrop-tint'
  fsBackdrop.appendChild(fsBackdropSnap)
  fsBackdrop.appendChild(fsBackdropTint)

  function resizeBackdropSnap() {
    const scale = 0.42
    const w = Math.max(160, Math.floor(window.innerWidth * scale))
    const h = Math.max(90, Math.floor(window.innerHeight * scale))
    fsBackdropSnap.width = w
    fsBackdropSnap.height = h
  }
  resizeBackdropSnap()

  /** Sits above the frosted backdrop; opacity is animated here so parent opacity does not break backdrop-filter. */
  const fsContent = document.createElement('div')
  fsContent.className = 'history-tray__fs-content'

  const fsClose = document.createElement('button')
  fsClose.type = 'button'
  fsClose.className = 'history-tray__fs-close'
  fsClose.setAttribute('aria-label', 'Close')
  fsClose.innerHTML = `<span class="history-tray__fs-close-icon" aria-hidden="true">${xIconSvg}</span>`
  fsContent.appendChild(fsClose)

  /** Perspective lives here only — not on the fullscreen root — so backdrop-filter can sample the canvas behind the overlay. */
  const orbitPerspective = document.createElement('div')
  orbitPerspective.className = 'history-tray__orbit-perspective'
  fsContent.appendChild(orbitPerspective)

  const orbitStage = document.createElement('div')
  orbitStage.className = 'history-tray__orbit'
  orbitPerspective.appendChild(orbitStage)

  const captionBar = document.createElement('div')
  captionBar.className = 'history-tray__caption-bar'
  captionBar.hidden = true
  const captionTitle = document.createElement('span')
  captionTitle.className = 'history-tray__caption-title'
  const captionLink = document.createElement('a')
  captionLink.className = 'wiki-detail__link'
  captionLink.target = '_blank'
  captionLink.rel = 'noopener noreferrer'
  captionLink.innerHTML = 'Read on Wikipedia <span class="wiki-detail__link-arrow" aria-hidden="true">&rarr;</span>'
  const captionInner = document.createElement('div')
  captionInner.className = 'history-tray__caption-inner'
  captionInner.appendChild(captionTitle)
  captionInner.appendChild(captionLink)
  captionBar.appendChild(captionInner)
  fsContent.appendChild(captionBar)

  fullscreen.appendChild(fsContent)

  /** Sibling of .history-tray under #app so z-index can place blur (59) above the mini-stack (58) but below this layer (61). */
  portalRoot.appendChild(fullscreen)

  function recomputeOrbitLayout() {
    orbitRadius = getOrbitRadius(entries.length)
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (2 * orbitRadius > vw * 0.7) {
      arcMode = true
      const offsetY = orbitRadius - vh * 0.3 + 150
      orbitStage.style.setProperty('--orbit-offset-y', `${offsetY}px`)
      orbitStage.style.setProperty('--orbit-tilt-x', '0deg')
      orbitStage.style.setProperty('--orbit-tilt-z', '0deg')
    } else {
      arcMode = false
      orbitStage.style.setProperty('--orbit-offset-y', '-100px')
      orbitStage.style.setProperty('--orbit-tilt-x', `${historyTrayDials.tiltXDeg}deg`)
      orbitStage.style.setProperty('--orbit-tilt-z', `${historyTrayDials.tiltZDeg}deg`)
    }
  }

  function syncDialStyles() {
    orbitStage.style.setProperty('--orbit-img-max', `${historyTrayDials.imageMaxPx}px`)
    if (expanded) {
      recomputeOrbitLayout()
      applyOrbitPositions()
    } else {
      orbitStage.style.setProperty('--orbit-tilt-x', `${historyTrayDials.tiltXDeg}deg`)
      orbitStage.style.setProperty('--orbit-tilt-z', `${historyTrayDials.tiltZDeg}deg`)
      orbitStage.style.setProperty('--orbit-offset-y', '-100px')
    }
  }

  syncDialStyles()
  applyHistoryTrayHoverCssVars(el)

  /* ── Helpers ───────────────────────────────────────────── */

  function updateBadge() {
    badge.textContent = String(entries.length)
  }

  /** Scatter is applied via CSS vars so hover can add lift/scale without clobbering transform. */
  function thumbOpacityForDepth(depth: number): number {
    return Math.max(0, 1 - depth * 0.12)
  }

  function findThumbByUrl(url: string): HTMLImageElement | null {
    for (const el of stack.querySelectorAll<HTMLImageElement>('.history-tray__thumb')) {
      if (el.dataset.thumbUrl === url) return el
    }
    return null
  }

  function setThumbScatterVars(img: HTMLImageElement, depth: number) {
    const s = SCATTER[depth % SCATTER.length]
    img.style.setProperty('--ht-sx', `${s[0]}px`)
    img.style.setProperty('--ht-sy', `${s[1]}px`)
    img.style.setProperty('--ht-sr', `${s[2]}deg`)
    img.dataset.depth = String(depth)
    img.style.opacity = String(thumbOpacityForDepth(depth))
    img.style.zIndex = String(MAX_STACK_VISIBLE - depth)
  }

  /**
   * Updates the mini-stack without wiping innerHTML so existing thumbnails keep their nodes.
   * Changing depth reassigns scatter vars; CSS transitions animate position/rotation/opacity.
   */
  function syncMiniStack() {
    const visible = entries.slice(0, MAX_STACK_VISIBLE)
    const keep = new Set(visible.map((e) => e.thumbUrl))

    for (const img of [...stack.querySelectorAll<HTMLImageElement>('.history-tray__thumb')]) {
      const id = img.dataset.thumbUrl
      if (id && !keep.has(id)) {
        gsap.killTweensOf(img)
        gsap.to(img, {
          opacity: 0,
          duration: 0.22,
          ease: 'power2.in',
          onComplete: () => img.remove(),
        })
      }
    }

    for (let depth = 0; depth < visible.length; depth++) {
      const entry = visible[depth]!
      let img = findThumbByUrl(entry.thumbUrl)
      let isNew = false
      if (!img) {
        isNew = true
        img = document.createElement('img')
        img.className = 'history-tray__thumb'
        img.src = entry.thumbUrl
        img.draggable = false
        img.dataset.thumbUrl = entry.thumbUrl
        stack.appendChild(img)
      }
      img.alt = entry.title

      if (isNew && depth === 0) {
        const s = SCATTER[0]
        img.style.setProperty('--ht-sx', `${s[0]}px`)
        img.style.setProperty('--ht-sy', `${s[1]}px`)
        img.style.setProperty('--ht-sr', `${s[2]}deg`)
        img.dataset.depth = '0'
        img.style.zIndex = String(MAX_STACK_VISIBLE)
        gsap.fromTo(
          img,
          { opacity: 0, '--ht-scale': 0.82 },
          {
            opacity: thumbOpacityForDepth(0),
            '--ht-scale': 1,
            duration: 0.3,
            ease: 'power2.out',
          },
        )
      } else {
        setThumbScatterVars(img, depth)
      }
    }
  }

  /* ── Orbit helpers ──────────────────────────────────────── */

  function rebuildOrbit() {
    orbitStage.innerHTML = ''
    orbitItems = []
    entries.forEach((entry, index) => {
      const item = document.createElement('div')
      item.className = 'history-tray__orbit-item'
      item.dataset.orbitIndex = String(index)
      const inner = document.createElement('div')
      inner.className = 'history-tray__orbit-item-inner'
      const img = document.createElement('img')
      img.src = entry.thumbUrl
      img.alt = entry.title
      img.draggable = false
      inner.appendChild(img)
      item.appendChild(inner)
      orbitStage.appendChild(item)
      orbitItems.push(item)
    })
  }

  function pauseOrbitTicker() {
    if (orbitTickerBound) {
      gsap.ticker.remove(orbitTickerBound)
      orbitTickerBound = null
    }
  }

  function resumeOrbitTicker() {
    if (!expanded || orbitTickerBound) return
    orbitPrevTime = performance.now() / 1000
    orbitTickerBound = orbitTick
    gsap.ticker.add(orbitTickerBound)
  }

  function setFocusedOrbitItem(index: number | null) {
    orbitItems.forEach((node, i) => {
      const on = i === index
      node.classList.toggle('history-tray__orbit-item--focused', on)
      node.style.zIndex = on ? '10' : ''
    })
  }

  function showCaptionFor(article: WikiArticle) {
    captionTitle.textContent = article.title
    captionLink.href = article.pageUrl
    captionBar.hidden = false
    detailOpen = true
  }

  function hideDetail() {
    focusTarget = null
    focusArticle = null
    captionBar.hidden = true
    detailOpen = false
    setFocusedOrbitItem(null)
    orbitVel = historyTrayDials.baseSpeed
    orbitPrevTime = performance.now() / 1000
    resumeOrbitTicker()
  }

  function focusOrbitItemAtIndex(k: number) {
    const n = orbitItems.length
    if (n === 0 || k < 0 || k >= n) return
    const article = entries[k]
    if (!article) return

    const spotlight = arcMode ? -Math.PI / 2 : SPOTLIGHT_ANGLE
    const base = spotlight - (2 * Math.PI * k) / n
    let d = base - orbitPhase
    d = d - Math.round(d / (2 * Math.PI)) * (2 * Math.PI)

    focusTarget = orbitPhase + d
    focusArticle = article
    captionBar.hidden = true
    setFocusedOrbitItem(k)
    detailOpen = true
    resumeOrbitTicker()
  }

  orbitStage.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.history-tray__orbit-item')
    if (!target || !orbitStage.contains(target)) return
    e.stopPropagation()
    const idx = parseInt((target as HTMLElement).dataset.orbitIndex ?? '', 10)
    if (Number.isNaN(idx)) return
    focusOrbitItemAtIndex(idx)
  })

  function applyOrbitPositions() {
    const n = orbitItems.length
    if (n === 0) return
    const r = orbitRadius
    const rx = arcMode ? r * 1.4 : r
    for (let i = 0; i < n; i++) {
      const θ = orbitPhase + (2 * Math.PI * i) / n
      const x = rx * Math.cos(θ)
      const y = r * Math.sin(θ)
      orbitItems[i].style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
    }
  }

  function orbitTick() {
    const now = performance.now() / 1000
    const dt = Math.min(now - orbitPrevTime, 0.1)
    orbitPrevTime = now

    if (focusTarget !== null) {
      const diff = focusTarget - orbitPhase
      orbitVel += diff * historyTrayDials.focusStiffness * dt
      orbitVel *= Math.max(0, 1 - historyTrayDials.focusDamping * dt)
      orbitPhase += orbitVel * dt

      if (Math.abs(diff) < historyTrayDials.focusSettle && Math.abs(orbitVel) < 0.01) {
        orbitPhase = focusTarget
        orbitVel = 0
        focusTarget = null
        pauseOrbitTicker()
        if (focusArticle) {
          showCaptionFor(focusArticle)
          focusArticle = null
        }
      }
    } else {
      orbitVel += (historyTrayDials.baseSpeed - orbitVel) * historyTrayDials.friction * dt
      orbitPhase += orbitVel * dt
    }

    applyOrbitPositions()
  }

  function startOrbit() {
    orbitPrevTime = performance.now() / 1000
    orbitVel = historyTrayDials.baseSpeed
    resumeOrbitTicker()
  }

  function stopOrbit() {
    pauseOrbitTicker()
  }

  /**
   * Same entrance as the tunnel (`main.ts` playInitialEntrance / recycle): scale from ~0,
   * slide up from below, fade in — applied to each orbit `img` so we do not fight the
   * orbit item’s per-frame `transform`.
   */
  function playOrbitEntrance() {
    const imgs = orbitStage.querySelectorAll<HTMLImageElement>('.history-tray__orbit-item-inner img')
    if (imgs.length === 0) return

    const STAGGER = 0.03
    const d = motionDials.tunnelSpawnDuration
    /** Tunnel uses world units; map to a similar screen offset for the tray */
    const yOffsetPx = motionDials.tunnelSpawnYOffset * 12
    /** Extra “into focus” on top of scale / slide / opacity (matches tunnel timing) */
    const blurInPx = 14

    imgs.forEach((img, i) => {
      gsap.killTweensOf(img)
      gsap.set(img, { transformOrigin: '50% 50%' })
      const delay = i * STAGGER
      gsap.fromTo(
        img,
        {
          scale: 0.001,
          y: yOffsetPx,
          opacity: 0,
          filter: `blur(${blurInPx}px)`,
        },
        {
          scale: 1,
          y: 0,
          opacity: imageDials.planeOpacity,
          filter: 'blur(0px)',
          duration: d,
          ease: tunnelSpawnEase,
          delay,
        },
      )
    })
  }

  /* ── Expand / Collapse ─────────────────────────────────── */

  const FS_OVERLAY_FADE_IN = 0.28
  const FS_OVERLAY_FADE_OUT = 0.52

  function expand() {
    if (expanded || entries.length === 0) return
    expanded = true
    el.classList.add('history-tray--expanded')
    rebuildOrbit()
    fsBackdrop.hidden = false
    fullscreen.hidden = false
    recomputeOrbitLayout()
    applyOrbitPositions()
    startOrbit()
    gsap.killTweensOf([fsContent, fsBackdrop])
    gsap.set([fsBackdrop, fsContent], { opacity: 0 })
    gsap.to([fsBackdrop, fsContent], {
      opacity: 1,
      duration: FS_OVERLAY_FADE_IN,
      ease: 'power2.out',
    })
    playOrbitEntrance()
  }

  function collapse() {
    if (!expanded) return
    hideDetail()
    stopOrbit()
    gsap.killTweensOf(orbitStage.querySelectorAll('.history-tray__orbit-item-inner img'))
    gsap.killTweensOf([fsContent, fsBackdrop])
    gsap.to([fsBackdrop, fsContent], {
      opacity: 0,
      duration: FS_OVERLAY_FADE_OUT,
      ease: 'power2.inOut',
      onComplete: () => {
        fullscreen.hidden = true
        fsBackdrop.hidden = true
        gsap.set([fsBackdrop, fsContent], { clearProps: 'opacity' })
        el.classList.remove('history-tray--expanded')
        expanded = false
      },
    })
  }

  /* ── Events ────────────────────────────────────────────── */

  stack.addEventListener('click', (e) => {
    e.stopPropagation()
    expand()
  })

  fsClose.addEventListener('click', (e) => {
    e.stopPropagation()
    collapse()
  })

  fsBackdropTint.addEventListener('click', () => {
    if (detailOpen) {
      hideDetail()
      return
    }
    collapse()
  })

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !expanded) return
    if (detailOpen) {
      hideDetail()
      return
    }
    collapse()
  })

  fullscreen.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      orbitVel += e.deltaY * historyTrayDials.scrollGain
    },
    { passive: false },
  )

  window.addEventListener('resize', () => {
    syncDialStyles()
    resizeBackdropSnap()
  })

  /* ── Public API ────────────────────────────────────────── */

  function push(article: WikiArticle) {
    const existing = entries.findIndex((e) => e.thumbUrl === article.thumbUrl)
    if (existing === 0) {
      if (
        entries[0].title !== article.title ||
        entries[0].extract !== article.extract ||
        entries[0].pageUrl !== article.pageUrl
      ) {
        entries[0] = article
        syncMiniStack()
      }
      return
    }
    if (existing > 0) {
      entries.splice(existing, 1)
    }
    entries.unshift(article)
    el.hidden = false
    updateBadge()
    syncMiniStack()
  }

  return {
    push,
    el,
    getExpanded: () => expanded,
    backdropSnapCanvas: fsBackdropSnap,
    resizeBackdropSnap,
  }
}
