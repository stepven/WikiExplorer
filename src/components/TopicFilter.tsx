import { useState, useCallback } from 'react'
import { ListFilter } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'

const TOPICS = [
  { label: 'Nature', value: 'nature wildlife landscape forest ocean -flag -flags' },
  { label: 'Politics', value: 'politics government election flag flags' },
  { label: 'Weather', value: 'weather phenomena storm climate ocean' },
  { label: 'Space', value: 'outer space astronomy planet astronomy' },
  { label: 'Art', value: 'art painting sculpture museum' },
  { label: 'History', value: 'history ancient civilization war' },
  { label: 'Technology', value: 'technology computing software' },
  { label: 'Sports', value: 'sports athletics championship' },
  { label: 'Architecture', value: 'architecture building bridge landmark skyscraper cathedral' },
  { label: 'Geology', value: 'geology volcano mountain mineral rock formation sedimentary' },
] as const

interface TopicFilterProps {
  onChange: (query: string | null) => void
}

export function TopicFilter({ onChange }: TopicFilterProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = useCallback(
    (index: number) => {
      setChecked((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)

        const query =
          next.size === 0
            ? null
            : [...next].map((i) => TOPICS[i].value).join(' OR ')
        onChange(query)
        return next
      })
    },
    [onChange],
  )

  const count = checked.size

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg ring-1 ring-foreground/10 bg-[#fafafa] px-3 py-2 text-sm shadow-[0_0px_12px_rgba(0,0,0,0.08),inset_0_0_0_1px_rgba(255,255,255,0.5)] transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ListFilter className="size-4" />
        Topics{count > 0 && ` (${count})`}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-48 bg-[#fafafa] shadow-[0_0px_12px_rgba(0,0,0,0.08),inset_0_0_0_1px_rgba(255,255,255,0.5)]">
        {TOPICS.map((topic, i) => (
          <DropdownMenuCheckboxItem
            key={topic.label}
            checked={checked.has(i)}
            onSelect={(e) => e.preventDefault()}
            onClick={() => toggle(i)}
          >
            {topic.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
