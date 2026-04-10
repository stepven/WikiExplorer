import gsap from 'gsap'
import { fetchRandomPreviewCards, type WikiPreviewCard } from './wiki-service'
import { motionDials } from './motion-dials'
import { tunnelSpawnEase } from './tunnel-spawn-ease'

const CARD_COUNT = 3
const AUTO_ADVANCE_MS = 4000
const BLUR_PX = 14

/**
 * Mounts a tiny Wikipedia preview carousel inside the loading overlay.
 * Fetches cards independently from the tunnel pool.
 */
export function mountLoadingPreviewCarousel(container: HTMLElement): void {
  let cards: WikiPreviewCard[] = []
  let current = 0
  let autoTimer: ReturnType<typeof setInterval> | null = null

  container.innerHTML = `
    <div class="lpc" aria-label="Random Wikipedia previews" role="region">
      <div class="lpc__card">
        <div class="lpc__img-wrap"><img class="lpc__img" alt="" /></div>
        <p class="lpc__extract"></p>
      </div>
      <div class="lpc__nav">
        <button class="lpc__arrow lpc__arrow--prev" type="button" aria-label="Previous">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>
        </button>
        <span class="lpc__dots"></span>
        <button class="lpc__arrow lpc__arrow--next" type="button" aria-label="Next">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
        </button>
      </div>
    </div>
  `

  const cardEl = container.querySelector<HTMLDivElement>('.lpc__card')!
  const imgEl = container.querySelector<HTMLImageElement>('.lpc__img')!
  const extractEl = container.querySelector<HTMLParagraphElement>('.lpc__extract')!
  const dotsWrap = container.querySelector<HTMLSpanElement>('.lpc__dots')!
  const prevBtn = container.querySelector<HTMLButtonElement>('.lpc__arrow--prev')!
  const nextBtn = container.querySelector<HTMLButtonElement>('.lpc__arrow--next')!
  let transitioning = false

  const spawnDuration = motionDials.tunnelSpawnDuration
  const yOffsetPx = motionDials.tunnelSpawnYOffset * 12

  function renderDots() {
    dotsWrap.innerHTML = cards
      .map(
        (_, i) =>
          `<button class="lpc__dot${i === current ? ' lpc__dot--active' : ''}" type="button" aria-label="Slide ${i + 1}"${i === current ? ' aria-current="true"' : ''}></button>`,
      )
      .join('')

    dotsWrap.querySelectorAll<HTMLButtonElement>('.lpc__dot').forEach((dot, i) => {
      dot.addEventListener('click', () => goTo(i))
    })
  }

  function applyCard(index: number) {
    const card = cards[index]
    if (!card) return
    imgEl.alt = card.title
    imgEl.src = card.thumbUrl
    extractEl.textContent = card.extract
    current = index
    renderDots()
  }

  /** Play the tunnel-spawn entrance on the image (scale up, slide, deblur). */
  function playSpawnIn() {
    gsap.killTweensOf(imgEl)
    gsap.fromTo(
      imgEl,
      { scale: 0.001, y: yOffsetPx, opacity: 0, filter: `blur(${BLUR_PX}px)` },
      { scale: 1, y: 0, opacity: 1, filter: 'blur(0px)', duration: spawnDuration, ease: tunnelSpawnEase },
    )
  }

  /** Crossfade: fade out card, swap content, then spawn-animate the new image in. */
  function showWithFade(index: number) {
    const resolved = ((index % cards.length) + cards.length) % cards.length
    if (resolved === current || transitioning) return
    transitioning = true
    cardEl.classList.add('lpc__card--fading')
    cardEl.addEventListener(
      'transitionend',
      () => {
        applyCard(resolved)
        cardEl.classList.remove('lpc__card--fading')
        playSpawnIn()
        cardEl.addEventListener('transitionend', () => { transitioning = false }, { once: true })
      },
      { once: true },
    )
  }

  function goTo(index: number) {
    showWithFade(index)
    resetAuto()
  }

  function resetAuto() {
    if (autoTimer) clearInterval(autoTimer)
    autoTimer = setInterval(() => {
      if (cards.length > 0) showWithFade((current + 1) % cards.length)
    }, AUTO_ADVANCE_MS)
  }

  prevBtn.addEventListener('click', () => goTo(current - 1))
  nextBtn.addEventListener('click', () => goTo(current + 1))

  fetchRandomPreviewCards(CARD_COUNT).then((result) => {
    if (result.length === 0) {
      container.hidden = true
      return
    }
    cards = result
    container.hidden = false
    applyCard(0)
    container.classList.add('lpc-ready')
    playSpawnIn()
    resetAuto()
  })
}
