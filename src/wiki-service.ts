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
  pageUrl: string
  thumbUrl: string
  thumbW: number
  thumbH: number
}

const API_URL = 'https://en.wikipedia.org/w/api.php'

const pool: WikiArticle[] = []
let fetchInFlight = false
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
  pithumbsize: '400',
  exintro: '1',
  explaintext: '1',
  exsentences: '2',
  inprop: 'url',
  format: 'json',
  origin: '*',
}

export async function fetchBatch(count = 20): Promise<void> {
  fetchInFlight = true
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
    fetchInFlight = false
  }
}

const LOW_WATER = 10

/** Shift the next article off the pool. Triggers a background refill when pool is low. */
export function next(): WikiArticle | null {
  if (pool.length < LOW_WATER && !fetchInFlight) {
    void fetchBatch()
  }
  return pool.shift() ?? null
}

/** Pre-fill the pool with enough articles for `n` image slots. */
export async function prefill(n: number): Promise<void> {
  const batchSize = 20
  const batchesNeeded = Math.ceil(n / (batchSize * 0.6))
  for (let i = 0; i < batchesNeeded; i++) {
    await fetchBatch(batchSize)
    if (pool.length >= n) break
  }
}

export function poolSize(): number {
  return pool.length
}
