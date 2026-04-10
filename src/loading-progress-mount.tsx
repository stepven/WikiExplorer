import { createRoot } from 'react-dom/client'
import { LoadingProgress } from './components/LoadingProgress'

export function mountLoadingProgress(container: HTMLElement): (value: number) => void {
  const root = createRoot(container)
  let current = 0

  function render(value: number) {
    current = value
    root.render(<LoadingProgress value={current} />)
  }

  render(0)
  return render
}
