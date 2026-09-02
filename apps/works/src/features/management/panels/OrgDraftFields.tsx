import { Input, Tooltip, tooltipScale } from '@ynarcher/ui'
import type { ReactNode } from 'react'

interface OrgDraftFieldsProps {
  label: string
  /** 새 조직 시작일(YYYY-MM-DD). */
  from: string
  /** 종료 예정일. 빈 문자열이면 무기한. */
  to: string
  /** 선택 가능한 최소 시작일(= 내일). */
  minDate: string
  onLabelChange: (v: string) => void
  /** 이름 입력 확정(blur) — 초안이 있으면 이때 서버에 반영한다. */
  onLabelCommit: () => void
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
}

/** 라벨 + 입력 한 칸. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  /** 이 칸의 규칙. 라벨 옆 도움말(ⓘ) 말풍선으로 접힌다(공용 `Field`와 같은 규약). */
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-caption font-semibold text-gray-600">
        {label}
        {hint && <Tooltip label={label} content={hint} className={tooltipScale.gap} />}
      </span>
      {children}
    </label>
  )
}

/**
 * 조직 개편 초안의 이름·가용기간 입력 3칸. 초안 생성 폼과 설계 중 편집에 같은 규격을 쓴다.
 * 값 확정 시점(날짜는 change, 이름은 blur)에 호출부가 서버 저장을 수행한다.
 */
export function OrgDraftFields({
  label,
  from,
  to,
  minDate,
  onLabelChange,
  onLabelCommit,
  onFromChange,
  onToChange,
}: OrgDraftFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Field label="새 조직 이름">
        <Input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          onBlur={onLabelCommit}
        />
      </Field>
      <Field label="시작일" hint="내일 이후 날짜부터 고를 수 있습니다.">
        <Input
          type="date"
          value={from}
          min={minDate}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </Field>
      <Field label="종료 예정일" hint="비워 두면 무기한입니다.">
        <Input
          type="date"
          value={to}
          min={from || minDate}
          onChange={(e) => onToChange(e.target.value)}
        />
      </Field>
    </div>
  )
}
