import { createRoot } from 'react-dom/client'
import { TopicFilter } from './components/TopicFilter'

export function mountTopicFilter(
  container: HTMLElement,
  onChange: (query: string | null) => void,
): void {
  createRoot(container).render(<TopicFilter onChange={onChange} />)
}
