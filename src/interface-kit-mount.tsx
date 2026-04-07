import { createRoot } from 'react-dom/client'
import { InterfaceKit } from 'interface-kit/react'
import { DialRoot } from 'dialkit'
import { VisualDials } from './VisualDials'
import 'dialkit/styles.css'

if (import.meta.env.DEV) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  createRoot(container).render(
    <>
      <InterfaceKit />
      <DialRoot position="bottom-right" defaultOpen />
      <VisualDials />
    </>
  )
}
