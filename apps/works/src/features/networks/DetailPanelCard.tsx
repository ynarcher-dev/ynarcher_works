import { PanelCard } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 상세페이지 우측 패널(자료 관리·변동 이력·피드백) 공용 카드 래퍼.
 *
 * 실체는 공용 `PanelCard`다. 한때 같은 헤더 마크업을 이 파일에서 따로 들고 있었으나, 카드
 * 제목 규격이 두 곳에서 각자 자라나는 원인이 되어 공용 컴포넌트로 흡수했다. 이름을 남겨 둔 것은
 * 호출처(우측 패널 20여 곳)가 이 이름으로 부르고 있기 때문이며, 새 코드는 `PanelCard`를 직접 쓴다.
 */
export function DetailPanelCard({
  title,
  count,
  action,
  children,
}: {
  title: string
  /** 제목 옆 건수(미지정 시 숨김). */
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <PanelCard title={title} count={count} action={action}>
      {children}
    </PanelCard>
  )
}
