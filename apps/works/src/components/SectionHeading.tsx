import type { ReactNode } from 'react'

/**
 * 그룹 헤드라인 + 오른쪽으로 이어지는 얇은 구분선.
 * 여러 카드로 이뤄진 묶음(예: 스타트업 상세의 역량·실적, M&A 셀러의 퀵 리뷰)을 위 블록과
 * 시각적으로 분리할 때 쓴다. 2026-09-07에 `features/startup`에서 여기로 올렸다 — 밴드를 세우는
 * 화면이 둘이 된 순간 이 규격은 어느 도메인의 것도 아니게 된다.
 * **브랜드색 액센트 바는 옵션이 아니라 규격이다**(2026-09-09 사용자 지정). 종전에는 `accent`
 * 플래그였고 M&A 퀵 리뷰만 켜 두어, 같은 층위의 머리말이 화면마다 다른 모양으로 섰다 — 바가
 * 있고 없고는 위계 차이로 읽히는데 두 화면 사이에 그런 차이가 실제로는 없었다. 켤 수 있게
 * 두면 그 다음 화면도 매번 켤지 말지를 판단하게 되므로, 판단할 것을 없애고 규격으로 박는다.
 * `className`으로는 위 여백 등만 조정한다.
 */
export function SectionHeading({
  title,
  className,
}: {
  title: ReactNode
  /** 래퍼 추가 클래스(기본 상단 여백 pt-2). */
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 ${className ?? 'pt-2'}`}>
      <span className="h-4 w-1 shrink-0 rounded bg-brand" aria-hidden />
      <h2 className="shrink-0 text-title-sm font-bold text-gray-900">{title}</h2>
      <span className="h-px flex-1 bg-gray-200" aria-hidden />
    </div>
  )
}
