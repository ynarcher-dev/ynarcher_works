import { useId, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { formText } from '../densityScale'

export interface SettingRowProps {
  /** 무엇을 켜고 끄는지. */
  title: ReactNode
  /** 켰을 때·껐을 때 무엇이 달라지는지 한 줄. */
  hint?: ReactNode
  /**
   * 오른쪽 컨트롤. `id`를 받아 그대로 넘긴다 — 그래야 왼쪽 제목이 이 컨트롤의 이름이 된다.
   *
   * 문자열을 `aria-label`에 다시 적게 두지 않는 이유는, 그렇게 하면 화면에 보이는 제목과
   * 스크린리더가 읽는 이름이 **두 벌**이 되어 한쪽만 고쳐지기 때문이다.
   */
  control: (props: { id: string }) => ReactNode
  className?: string
}

/**
 * 설정 한 줄 — 제목·설명은 왼쪽, 켜고 끄는 컨트롤은 오른쪽.
 *
 * 근무 기준·자산 등록·근태 상태 폼에 같은 구조가 다섯 번 손으로 쓰여 있었고, 제목 규격이
 * `text-body text-gray-900`과 `text-body font-medium text-gray-800` 둘로 갈려 있었다. 이 줄은
 * 값을 보여주는 자리가 아니라 **무엇을 묻는지** 알리는 자리이므로, 카드의 라벨(`gray-500`)이
 * 아니라 폼 라벨 규격(`formText`)을 따른다 — `Field`가 입력 위 라벨을 소유하는 것과 같은 자리다.
 */
export function SettingRow({ title, hint, control, className }: SettingRowProps) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className={cn('block', formText.label)}>
          {title}
        </label>
        {hint && <p className={cn('mt-0.5', formText.hint)}>{hint}</p>}
      </div>
      <div className="shrink-0">{control({ id })}</div>
    </div>
  )
}
