import type { ReactNode } from 'react'
import { IconButton } from '../components/IconButton'

export interface ViewToggleOption<K extends string = string> {
  key: K
  label: string
  /** 아이콘 노드(lucide 등). 앱에서 주입한다. */
  icon: ReactNode
}

export interface ViewToggleGroupProps<K extends string = string> {
  options: ViewToggleOption<K>[]
  value: K
  onChange: (key: K) => void
}

/**
 * 보드 헤더의 뷰 전환 토글(목록·칸반·간트 등 아이콘 버튼 그룹).
 * 옵션 목록만 바꾸면 어떤 보드에서도 동일한 규격으로 쓸 수 있다.
 */
export function ViewToggleGroup<K extends string = string>({
  options,
  value,
  onChange,
}: ViewToggleGroupProps<K>) {
  return (
    <span className="flex gap-1">
      {options.map((opt) => (
        <IconButton
          key={opt.key}
          icon={opt.icon}
          label={`${opt.label} 보기`}
          title={`${opt.label} 보기`}
          aria-pressed={value === opt.key}
          variant={value === opt.key ? 'selected' : 'outline'}
          onClick={() => onChange(opt.key)}
        />
      ))}
    </span>
  )
}
