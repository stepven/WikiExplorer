/**
 * Fetches random Wikipedia articles with thumbnails from the MediaWiki Action API.
 * Maintains an internal pool that auto-refills when running low.
 *
 * Supports an optional topic filter: when set, uses `generator=search` with
 * `gsrsort=random` instead of `generator=random` to return articles matching
 * the given topic.
 */

export interface WikiArticle {
  title: string
  extract: string
  /** Populated lazily via fetchLinkedExtract; null until fetched. */
  extractHtml: string | null
  pageUrl: string
  thumbUrl: string
  thumbW: number
  thumbH: number
}

const API_URL = 'https://en.wikipedia.org/w/api.php'

const pool: WikiArticle[] = []
let fetchesInFlight = 0
let activeFilter: string | null = null

export function setFilter(topic: string | null): void {
  if (topic === activeFilter) return
  activeFilter = topic
  pool.length = 0
}

export function getFilter(): string | null {
  return activeFilter
}

const SHARED_PROPS: Record<string, string> = {
  action: 'query',
  prop: 'pageimages|extracts|info',
  piprop: 'thumbnail',
  pithumbsize: '150',
  exintro: '1',
  explaintext: '1',
  exsentences: '2',
  inprop: 'url',
  format: 'json',
  origin: '*',
}

const WIKI_ORIGIN = 'https://en.wikipedia.org'
const ALLOWED_TAGS = new Set(['a', 'b', 'i', 'em', 'strong', 'sup', 'sub', 'span', 'p'])

/**
 * Sanitize parsed section HTML: keep only allowlisted inline/block tags,
 * absolutize /wiki/ hrefs, strip citation footnotes, and add safe link attrs.
 */
function sanitizeParsedHtml(rawHtml: string): string {
  const container = document.createElement('div')
  container.innerHTML = rawHtml

  // Remove citation references like [1], [2]
  container.querySelectorAll('sup.reference').forEach((el) => el.remove())
  // Remove reference lists, infoboxes, figures, tables, styles
  container.querySelectorAll('.reflist, .references, .mw-references-wrap, .infobox, figure, table, style, .shortdescription, .mw-empty-elt').forEach((el) => el.remove())

  const walk = (node: Node): void => {
    const children = Array.from(node.childNodes)
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove()
        continue
      }
      const el = child as Element
      if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
        el.replaceWith(...Array.from(el.childNodes))
        walk(node)
        return
      }
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') ?? ''
        if (href.startsWith('#')) {
          // Anchor-only links (footnote back-refs etc.) — unwrap to plain text
          el.replaceWith(...Array.from(el.childNodes))
          walk(node)
          return
        }
        if (href.startsWith('/wiki/')) {
          el.setAttribute('href', `${WIKI_ORIGIN}${href}`)
        } else if (href.startsWith('./')) {
          el.setAttribute('href', `${WIKI_ORIGIN}/wiki/${href.slice(2)}`)
        } else if (!href.startsWith('http')) {
          el.removeAttribute('href')
        }
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
      walk(el)
    }
  }

  walk(container)
  return container.innerHTML
}

const linkedExtractCache = new Map<string, Promise<string | null>>()

/**
 * Fetch the intro section of a Wikipedia article via action=parse,
 * returning sanitized HTML with wikilinks intact.
 * Results are cached so repeated views don't re-fetch.
 */
export function fetchLinkedExtract(title: string): Promise<string | null> {
  const cached = linkedExtractCache.get(title)
  if (cached) return cached

  const promise = (async (): Promise<string | null> => {
    try {
      const params = new URLSearchParams({
        action: 'parse',
        page: title,
        prop: 'text',
        section: '0',
        format: 'json',
        origin: '*',
      })
      const resp = await fetch(`${API_URL}?${params}`)
      if (!resp.ok) return null
      const json = (await resp.json()) as {
        parse?: { text?: { '*'?: string } }
      }
      const html = json?.parse?.text?.['*']
      if (!html) return null
      return sanitizeParsedHtml(html)
    } catch {
      return null
    }
  })()

  linkedExtractCache.set(title, promise)
  return promise
}

export async function fetchBatch(count = 20): Promise<void> {
  fetchesInFlight++
  try {
    const generatorParams: Record<string, string> = activeFilter
      ? {
          generator: 'search',
          gsrsearch: activeFilter,
          gsrsort: 'random',
          gsrnamespace: '0',
          gsrlimit: String(count),
        }
      : {
          generator: 'random',
          grnnamespace: '0',
          grnlimit: String(count),
        }

    const params = new URLSearchParams({ ...SHARED_PROPS, ...generatorParams })
    const resp = await fetch(`${API_URL}?${params}`)
    if (!resp.ok) return
    const json = (await resp.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string
            extract?: string
            fullurl?: string
            thumbnail?: { source: string; width: number; height: number }
          }
        >
      }
    }
    const pages = json?.query?.pages
    if (!pages) return
    for (const page of Object.values(pages)) {
      if (!page.thumbnail?.source) continue
      pool.push({
        title: page.title ?? '',
        extract: page.extract ?? '',
        extractHtml: null,
        pageUrl:
          page.fullurl ??
          `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
        thumbUrl: page.thumbnail.source,
        thumbW: page.thumbnail.width ?? 400,
        thumbH: page.thumbnail.height ?? 300,
      })
    }
  } catch {
    /* network errors are non-fatal; pool stays as-is */
  } finally {
    fetchesInFlight--
  }
}

const LOW_WATER = 10

/** Shift the next article off the pool. Triggers a background refill when pool is low. */
export function next(): WikiArticle | null {
  if (pool.length < LOW_WATER && fetchesInFlight === 0) {
    void fetchBatch()
  }
  return pool.shift() ?? null
}

/**
 * Block until the pool has at least `minCount` articles, or batch attempts give up.
 * Use before assigning many meshes at once so parallel `next()` calls do not drain
 * the pool to zero while a refill is still in flight (which would return null).
 */
export async function ensurePool(minCount: number): Promise<void> {
  let attempts = 0
  const maxAttempts = 80
  while (pool.length < minCount && attempts < maxAttempts) {
    attempts++
    await fetchBatch(20)
  }
}

/**
 * Next article from the pool, waiting for a refill if it was empty.
 * Prefer this over `next()` when assignment must not silently no-op.
 */
export async function takeNext(): Promise<WikiArticle | null> {
  let article = next()
  if (article) return article
  await ensurePool(1)
  article = next()
  return article ?? null
}

/** Run `count` fetchBatch calls with bounded concurrency. */
export async function fetchBatchesParallel(
  count: number,
  batchSize = 20,
  concurrency = 3,
): Promise<void> {
  let started = 0
  async function worker(): Promise<void> {
    while (started < count) {
      started++
      await fetchBatch(batchSize)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, () => worker()),
  )
}

/** Pre-fill the pool with enough articles for `n` image slots. */
export async function prefill(n: number): Promise<void> {
  const batchSize = 20
  const batchesNeeded = Math.ceil(n / (batchSize * 0.6))
  await fetchBatchesParallel(batchesNeeded, batchSize)
}

export function poolSize(): number {
  return pool.length
}
