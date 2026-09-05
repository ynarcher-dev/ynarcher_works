import { Tooltip, cn, formText, tooltipScale } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 통합 수정 폼의 라벨 + 입력 래퍼. `className`으로 그리드 스팬 등을 지정할 수 있다.
 *
 * 폼 파일이 아니라 별도 모듈에 사는 이유는 입력 섹션이 여럿으로 갈렸기 때문이다 — 파일마다
 * 같은 라벨을 다시 정의하면 규격이 조용히 갈라진다.
 */
export function Field({
  label,
  required,
  hint,
  hintInline,
  className,
  children,
}: {
  label: string
  required?: boolean
  /** 이 칸의 규칙. 라벨 옆 도움말(ⓘ) 말풍선으로 접힌다(공용 `Field`와 같은 규약). */
  hint?: string
  /**
   * 도움말을 접지 않고 컨트롤 아래에 편다. **다음 행동을 지시하는 안내에만** 쓴다 —
   * 왜 못 채우는지, 무엇을 먼저 해야 하는지. 공용 `Field`의 같은 이름 슬롯과 규약이 같다.
   */
  hintInline?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-body font-medium text-gray-800">
        {label}
        {required && <span className="text-brand"> *</span>}
        {hint && !hintInline && <Tooltip label={label} content={hint} className={tooltipScale.gap} />}
      </p>
      {children}
      {hint && hintInline && <span className={cn('mt-1 block', formText.hint)}>{hint}</span>}
    </div>
  )
}
