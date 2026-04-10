import { Progress } from './ui/progress'

export function LoadingProgress({ value }: { value: number }) {
  return (
    <Progress value={value} className="w-48" />
  )
}
