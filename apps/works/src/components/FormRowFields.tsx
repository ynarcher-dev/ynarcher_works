import { Button, Input, cn, formText } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { fieldWidthClass, type FieldWidth } from '@/components/FieldGrid'

/**
 * 카드 안 입력 섹션이 함께 쓰는 라벨 · 숫자 입력 · 줄 목록.
 *
 * 폼 상위의 `Field`와 규격이 같지만 그쪽은 도움말·필수 표시·그리드 스팬을 함께 갖는 폼 전용
 * 슬롯이다. 여기 있는 것은 카드 **안쪽**의 최소 형태로, 파일마다 같은 라벨을 다시 정의해
 * 규격이 갈라지는 것을 막는다.
 *
 * **2026-09-07에 `features/startup`에서 여기로 올렸다.** M&A 셀러의 퀵 리뷰 폼이 같은 모양의
 * 목록 입력을 쓰게 되면서다 — 그때 복사했으면 상자 테두리와 라벨 색이 두 벌이 되고, 한쪽을
 * 고치는 날 다른 쪽은 옛 규격으로 남는다. 자리가 `components/`인 것은 이것이 어느 도메인의
 * 것도 아니라는 뜻이다.
 */
export function Label({
  text,
  width,
  children,
}: {
  text: string
  /**
   * 이 칸이 격자에서 차지하는 폭 — **칸의 종류**로 말한다(FieldGrid).
   *
   * 클래스를 받지 않는 이유는 그것이 곧 화면마다 다른 폭이 되기 때문이다. 종류를 고르면
   * 폭은 규격이 정하고, 규격을 고칠 때 화면을 훑지 않아도 된다.
   */
  width?: FieldWidth
  children: ReactNode
}) {
  return (
    <div className={width && fieldWidthClass[width]}>
      <p className={`mb-1 ${formText.label}`}>{text}</p>
      {children}
    </div>
  )
}

// 목록형 입력의 항목 상자(`RowBox`·`Cell`·`RowActions`)는 2026-09-09에 걷었다. 값이 둘뿐인
// 항목이 라벨 두 줄과 삭제 한 줄을 더해 네 줄을 쓰고 있었다 — 라벨을 항목마다 다시 적기
// 때문이다. 대신 `components/ItemRows.tsx`가 **머리글 한 줄 + 항목 한 줄**로 세운다.

/** 빈 문자열 → undefined, 그 외 숫자로 파싱(콤마 허용). */
export function numOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? undefined : n
}

/**
 * 천단위 콤마 표시 + 우측정렬 숫자 입력.
 *
 * `type="number"`는 콤마를 담지 못하므로 text로 처리한다. 편집 중에는 입력한 원문을 그대로
 * 두어(음수 '-' 입력·캐럿 튐 방지) 콤마 없이 보이고, 포커스가 빠질 때 저장값을 콤마 포맷으로
 * 다시 그린다.
 */
export function NumberInput({
  value,
  onChange,
  className,
}: {
  value?: number | null
  onChange: (v: number | undefined) => void
  className?: string
}) {
  const [typing, setTyping] = useState<string | null>(null)
  const formatted = value == null || Number.isNaN(Number(value)) ? '' : Number(value).toLocaleString()
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={cn('text-right tabular-nums', className)}
      value={typing ?? formatted}
      onChange={(e) => {
        setTyping(e.target.value)
        onChange(numOrUndef(e.target.value))
      }}
      onBlur={() => setTyping(null)}
    />
  )
}

/**
 * 줄 목록 입력(불릿 한 줄씩).
 *
 * 항목이 값 하나뿐이라 `RowBox`(여러 칸이 한 항목을 이룰 때)를 쓰지 않는다 — 한 칸짜리 항목을
 * 상자에 넣으면 테두리가 값보다 많아진다. 대신 줄마다 입력 하나와 삭제 하나가 나란히 선다.
 *
 * **빈 줄을 만들어 두고 시작하지 않는다.** 빈 입력이 미리 서 있으면 그것이 값인지 자리인지
 * 화면이 말하지 못하고, 저장할 때 빈 줄을 걸러 내는 일이 화면마다 다시 필요해진다.
 */
export function LineListField({
  lines,
  onChange,
  placeholder,
  addLabel = '줄 추가',
}: {
  lines: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  addLabel?: string
}) {
  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={line}
            placeholder={placeholder}
            onChange={(e) => onChange(lines.map((l, idx) => (idx === i ? e.target.value : l)))}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
          >
            삭제
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...lines, ''])}>
        {addLabel}
      </Button>
    </div>
  )
}
