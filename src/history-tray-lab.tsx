import './style.css'
import { createRoot } from 'react-dom/client'
import { createHistoryTray } from './image-history-tray'
import { HistoryTrayHoverDialKitApp } from './history-tray-hover-dialkit'
import type { WikiArticle } from './wiki-service'

/** Stable placeholder thumbs so the stack is visible offline-friendly (Wikimedia CDN). */
const MOCK_THUMBS: Pick<WikiArticle, 'thumbUrl' | 'thumbW' | 'thumbH'>[] = [
  {
    thumbUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/240px-Cat03.jpg',
    thumbW: 240,
    thumbH: 180,
  },
  {
    thumbUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/240px-PNG_transparency_demonstration_1.png',
    thumbW: 240,
    thumbH: 180,
  },
  {
    thumbUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/240px-Red_Apple.jpg',
    thumbW: 240,
    thumbH: 180,
  },
  {
    thumbUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Windows_logo_-_2012.svg/200px-Windows_logo_-_2012.svg.png',
    thumbW: 200,
    thumbH: 200,
  },
  {
    thumbUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/240px-Camponotus_flavomarginatus_ant.jpg',
    thumbW: 240,
    thumbH: 160,
  },
]

function mockArticle(i: number): WikiArticle {
  const t = MOCK_THUMBS[i % MOCK_THUMBS.length]!
  return {
    title: `Stack preview ${i + 1}`,
    extract: '',
    extractHtml: null,
    pageUrl: 'https://example.com',
    thumbUrl: t.thumbUrl,
    thumbW: t.thumbW,
    thumbH: t.thumbH,
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="tray-lab">
    <p class="tray-lab__title">History tray hover lab</p>
    <p class="tray-lab__hint">
      Hover the thumbnail stack in the corner. Use the <strong>DialKit</strong> panel (bottom-right) to tune timing, easing, and lift/scale per depth — presets and Copy JSON are in the panel toolbar.
    </p>
    <p class="tray-lab__nav"><a href="/">← Wikipedia tunnel</a></p>
  </div>
`

const historyTray = createHistoryTray(app)
app.appendChild(historyTray.el)

const reactHost = document.createElement('div')
reactHost.setAttribute('data-history-tray-lab-react', '')
document.body.append(reactHost)
createRoot(reactHost).render(<HistoryTrayHoverDialKitApp trayRoot={historyTray.el} />)

for (let i = 0; i < 5; i++) {
  historyTray.push(mockArticle(i))
}
