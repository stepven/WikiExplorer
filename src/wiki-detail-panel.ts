import xIconSvg from '@phosphor-icons/core/assets/regular/x.svg?raw'
import { fetchLinkedExtract, type WikiArticle } from './wiki-service'

/**
 * Lightweight HTML overlay that shows article title, extract, and a Wikipedia link.
 * Dismissible via close button, backdrop click, or Escape.
 */
export function createDetailPanel(opts?: {
  /** If set, called instead of hiding immediately (e.g. focus exit animation). */
  onClose?: () => void
}): {
  show: (article: WikiArticle) => void
  hide: () => void
  hideImmediate: () => void
  el: HTMLDivElement
} {
  const el = document.createElement('div')
  el.className = 'wiki-detail'
  el.hidden = true

  el.innerHTML = `
    <div class="wiki-detail__backdrop"></div>
    <button class="wiki-detail__close" type="button" aria-label="Close">
      <span class="wiki-detail__close-icon" aria-hidden="true">${xIconSvg}</span>
    </button>
    <div class="wiki-detail__card">
      <h2 class="wiki-detail__title"></h2>
      <div class="wiki-detail__extract"></div>
      <a class="wiki-detail__link" target="_blank" rel="noopener noreferrer">Read on Wikipedia <span class="wiki-detail__link-arrow" aria-hidden="true">&rarr;</span></a>
    </div>
  `

  const titleEl = el.querySelector<HTMLElement>('.wiki-detail__title')!
  const extractEl = el.querySelector<HTMLElement>('.wiki-detail__extract')!
  const linkEl = el.querySelector<HTMLAnchorElement>('.wiki-detail__link')!
  const closeBtn = el.querySelector<HTMLButtonElement>('.wiki-detail__close')!
  const backdrop = el.querySelector<HTMLElement>('.wiki-detail__backdrop')!

  function hideImmediate() {
    el.hidden = true
    el.style.opacity = ''
  }

  function requestClose() {
    if (opts?.onClose) opts.onClose()
    else hideImmediate()
  }

  function hide() {
    hideImmediate()
  }

  let activeTitle = ''

  function show(article: WikiArticle) {
    activeTitle = article.title
    titleEl.textContent = article.title
    linkEl.href = article.pageUrl

    if (article.extractHtml) {
      extractEl.innerHTML = article.extractHtml
      el.hidden = false
    } else {
      extractEl.textContent = ''
      el.hidden = false
      const pending = fetchLinkedExtract(article.title)
      pending.then((html) => {
        if (activeTitle !== article.title) return
        if (html) {
          article.extractHtml = html
          extractEl.innerHTML = html
        } else {
          extractEl.textContent = article.extract || 'No summary available.'
        }
      })
    }
  }

  closeBtn.addEventListener('click', requestClose)
  backdrop.addEventListener('click', requestClose)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) requestClose()
  })

  return { show, hide, hideImmediate, el }
}
