import { PageHeader } from '@ynarcher/ui'
import { MaPartyListTab } from '@/features/mna/parties/MaPartyListTab'
import { MA_BUYER, MA_SELLER, type MaPartyConfig } from '@/features/mna/parties/config'

/**
 * M&A 거래상대 목록 화면 — 그 구획의 루트(`/buyers`·`/sellers`)다.
 *
 * 사이드바 줄에 탭 키가 없는 것은 각 구획의 목록이 하나뿐이기 때문이다(스타트업·네트워크
 * 줄과 같은 모양) — 주소가 곧 그 화면이라 `?tab=`이 실을 것이 없다.
 */
function MaPartyPage({ config }: { config: MaPartyConfig }) {
  return (
    <div className="space-y-5">
      <PageHeader title={config.listLabel} />
      <MaPartyListTab config={config} />
    </div>
  )
}

/**
 * 라우터가 붙이는 진입점 둘.
 *
 * 설정을 라우터에서 넘기지 않고 여기서 묶는 이유는 라우트 정의가 이 원장의 설정 파일을
 * 알 필요가 없어서다 — 라우터가 아는 것은 '이 경로에 이 화면'이고, 어느 원장인지는 화면이
 * 답한다(사업 3종의 ProjectWorkspacePage·MnaWorkspacePage와 같은 모양).
 */
export function MaBuyerPage() {
  return <MaPartyPage config={MA_BUYER} />
}

export function MaSellerPage() {
  return <MaPartyPage config={MA_SELLER} />
}
