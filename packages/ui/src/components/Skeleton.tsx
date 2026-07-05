import { cn } from '../utils/cn'

export interface SkeletonProps {
  className?: string
}

/** 스켈레톤 로더(콘텐츠 자리표시). */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded bg-gray-100', className)}
    />
  )
}
