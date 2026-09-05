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

/**
 * 목록형 입력 한 항목을 감싸는 상자(팀원·자문·지식재산 등 여러 칸이 한 항목을 이룰 때).
 *
 * 한때 `flex flex-wrap`에 칸마다 고정 폭(`w-28`·`w-36`…)을 주었다. 카드가 전폭일 때는 한 줄에
 * 들어맞았지만, 편집 폼을 조회 화면과 같은 2열로 세우자(2026-09-06) 카드 폭이 절반이 되면서
 * 같은 상자가 화면마다 다른 줄 수로 접혔다 — 어느 칸이 어느 줄에 있는지가 폭에 따라 달라지면
 * 같은 항목을 두 번째로 입력할 때 눈이 자리를 기억하지 못한다. **2열 격자**로 바꾸면 접히는
 * 자리가 고정되고, 폭이 남거나 모자라는 것은 칸 자신이 늘고 줄어 흡수한다.
 */
export function RowBox({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-end gap-2 rounded-radius-md border border-gray-200 p-3">
      {children}
    </div>
  )
}

/** 목록형 입력 셀(라벨 + 컨트롤). `wide`면 두 칸을 다 받는다(이름·명칭처럼 긴 값). */
export function Cell({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`block min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <span className="mb-0.5 block text-caption text-gray-700">{label}</span>
      {children}
    </label>
  )
}

/** 항목 상자의 마지막 줄(삭제 등). 오른쪽 정렬로 두 칸을 다 받는다. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="col-span-2 flex items-center justify-end gap-2">{children}</div>
}
