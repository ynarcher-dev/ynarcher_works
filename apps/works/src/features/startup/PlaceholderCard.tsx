import { PanelCard } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 헤드라인만 있는 빈 카드 섹션(내용은 후속 구현). `children`을 주면 빈 안내 대신 내용을 렌더한다.
 * `count`를 주면 제목 옆에 건수를 `[3]` 형태로 노출한다(자료 관리 패널과 동일).
 *
 * 헤더는 공용 `PanelCard`가 소유한다 — 제목 마크업을 여기서 다시 쓰면 카드 제목 규격이
 * 갈라진다.
 */
export function PlaceholderCard({
  title,
  count,
  emptyText = '준비 중입니다.',
  children,
}: {
  title: ReactNode
  /** 제목 옆 로그 건수(미지정 시 숨김). */
  count?: number
  /** 내용이 없을 때 표시할 안내 문구. */
  emptyText?: string
  children?: ReactNode
}) {
  return (
    <PanelCard title={title} count={count}>
      {children ?? <p className="text-body text-gray-600">{emptyText}</p>}
    </PanelCard>
  )
}
