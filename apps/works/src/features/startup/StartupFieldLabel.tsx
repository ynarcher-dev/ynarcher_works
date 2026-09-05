import type { ReactNode } from 'react'

/**
 * 통합 수정 폼의 입력 섹션들이 함께 쓰는 라벨 + 입력 래퍼.
 *
 * 상위 폼(`StartupDetailForm`)의 `Field`와 규격이 같지만 그쪽은 도움말·필수 표시·그리드 스팬을
 * 함께 갖는 폼 전용 슬롯이다. 여기 있는 것은 카드 안 입력 섹션이 쓰는 최소 형태로, 파일마다
 * 같은 라벨을 다시 정의해 규격이 갈라지는 것을 막는다.
 */
export function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-body font-medium text-gray-800">{text}</p>
      {children}
    </div>
  )
}

/** 목록형 입력 한 줄을 감싸는 상자(팀원·자문·지식재산 등 여러 칸이 한 항목을 이룰 때). */
export function RowBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-radius-md border border-gray-200 p-3">
      {children}
    </div>
  )
}

/** 목록형 입력 셀(라벨 + 컨트롤). 폭은 바깥에서 준다. */
export function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-caption text-gray-700">{label}</span>
      {children}
    </label>
  )
}
