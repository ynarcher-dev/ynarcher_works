import { PageHeader } from '@ynarcher/ui'
import { MaBuyerListTab } from '@/features/mna/buyers/MaBuyerListTab'
import { MA_BUYER_LIST_LABEL } from '@/features/mna/buyers/config'

/**
 * M&A BUYER 목록 화면 — 이 구획의 루트(`/buyers`)다.
 *
 * 사이드바 줄에 탭 키가 없는 것은 이 워크스페이스 구획의 목록이 하나뿐이기 때문이다
 * (스타트업·네트워크 줄과 같은 모양) — 주소가 곧 그 화면이라 `?tab=`이 실을 것이 없다.
 */
export function MaBuyerPage() {
  return (
    <div className="space-y-5">
      <PageHeader title={MA_BUYER_LIST_LABEL} />
      <MaBuyerListTab />
    </div>
  )
}
