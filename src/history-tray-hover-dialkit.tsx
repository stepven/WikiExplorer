import 'dialkit/styles.css'
import { useLayoutEffect } from 'react'
import { DialRoot, useDialKit } from 'dialkit'
import {
  applyHistoryTrayHoverFromDialValues,
  HISTORY_TRAY_HOVER_DIAL_CONFIG,
} from './history-tray-hover-dials'

function HistoryTrayHoverDialSync({ trayRoot }: { trayRoot: HTMLElement | null }) {
  const p = useDialKit('History tray hover', HISTORY_TRAY_HOVER_DIAL_CONFIG)

  useLayoutEffect(() => {
    if (!trayRoot) return
    applyHistoryTrayHoverFromDialValues(trayRoot, p)
  }, [trayRoot, p])

  return null
}

export function HistoryTrayHoverDialKitApp({ trayRoot }: { trayRoot: HTMLElement | null }) {
  return (
    <>
      <DialRoot position="bottom-right" defaultOpen theme="light" />
      <HistoryTrayHoverDialSync trayRoot={trayRoot} />
    </>
  )
}
