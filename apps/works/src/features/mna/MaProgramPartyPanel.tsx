import { EmptyState, Spinner } from '@ynarcher/ui'
import { MaPartySummary } from '@/features/mna/parties/MaPartySummary'
import { MA_BUYER, MA_SELLER, type MaPartyConfig } from '@/features/mna/parties/config'
import { useMaPartyRecord } from '@/features/mna/parties/hooks'
import {
  useMaProgramPartyLinks,
  type MaProgramPartyKind,
} from '@/features/mna/programPartyLinks'

const CONFIG: Record<MaProgramPartyKind, MaPartyConfig> = {
  SELL: MA_SELLER,
  BUY: MA_BUYER,
}

/**
 * M&A 프로젝트 상세의 SELLER·BUYER 탭 — **연결된 기업의 내용**이 선다.
 *
 * 2026-09-08까지 이 자리는 매핑 도구였다(기업 매핑 버튼 + 이름 한 줄 + 해제 X). 사용자 지정으로
 * 두 가지가 함께 바뀐다 — 매핑은 프로젝트 편집 폼으로 올라갔고(고르는 일은 프로젝트를 정의하는
 * 일이라 등록·편집이 그 자리다), 여기에는 **그 기업이 무엇인지**가 선다. 프로젝트를 열어 매물
 * 탭을 누르는 이유는 이름을 확인하려는 것이 아니라 그 회사를 읽으려는 것이고, 이름 한 줄만
 * 있으면 매번 원장으로 건너갔다가 돌아와야 했다.
 *
 * 세우는 것은 기업정보 · 상세내용 · 퀵 리뷰이며, 셋의 규격은 원장 상세와 **같은 부품**이
 * 갖는다(`MaPartySummary`). 바이어는 퀵 리뷰를 운용하지 않으므로 앞의 둘로 끝난다 — 그 판정도
 * 화면이 아니라 설정(`hasQuickReview`)이 답한다.
 *
 * 자료·회의록·변동 이력·코멘트는 여기 세우지 않는다. 그것들은 레코드를 둘러싼 것들이라 원장
 * 상세가 소유하며, 여기까지 옮겨오면 이 탭이 원장 상세의 사본이 되고 고치러 갈 곳이 둘이 된다.
 */
export function MaProgramPartyPanel({
  programId,
  kind,
}: {
  programId: string
  kind: MaProgramPartyKind
}) {
  const config = CONFIG[kind]
  const { data: links, isLoading } = useMaProgramPartyLinks(programId)
  const selected = (links ?? []).filter((link) => link.kind === kind)

  if (isLoading) return <Spinner />
  if (selected.length === 0) {
    return (
      <EmptyState
        title={`연결된 ${config.listLabel} 기업이 없습니다.`}
        description="편집에서 이 프로젝트와 연결할 기업을 고를 수 있습니다."
      />
    )
  }

  return (
    <div className="space-y-6">
      {selected.map((party) => (
        <PartyBody key={party.id} config={config} id={party.id} />
      ))}
    </div>
  )
}

/**
 * 연결 한 건의 내용. 원장 행을 여기서 다시 읽는 이유는 연결 조회가 **목록에 필요한 칸만**
 * 담아 오기 때문이다(이름·희망사항·금액·분야) — 상세내용과 퀵 리뷰는 무거워 목록 조회가
 * 들고 다닐 값이 아니고, 연결이 여럿이면 그 무게가 건수만큼 곱해진다.
 *
 * 훅을 부르는 자리라 연결마다 컴포넌트를 나눈다(반복문 안에서 훅을 부르지 않는다).
 */
function PartyBody({ config, id }: { config: MaPartyConfig; id: string }) {
  const { data: record, isLoading } = useMaPartyRecord(config, id)

  if (isLoading) return <Spinner />
  if (!record) {
    // 연결은 남아 있는데 원장 행을 못 읽는 경우다(소프트 삭제 또는 열람 권한 없음). 조용히
    // 빈 자리로 두지 않는다 — 연결이 몇 건인지는 편집 화면이 말하는데 여기서 사라지면
    // 두 화면이 서로 다른 수를 답한다.
    return (
      <EmptyState
        title="연결된 기업을 읽을 수 없습니다."
        description="삭제되었거나 열람 권한이 없는 기업입니다."
      />
    )
  }

  // 원장으로 가는 링크는 걸지 않는다(2026-09-08 사용자 지정) — 이 탭이 세우는 것이 이미 그
  // 기업의 내용 전부라 건너갈 이유가 남지 않고, 제목이 링크가 되면 그 부품의 글자 규격이
  // 따라와 같은 카드가 두 화면에서 다르게 선다.
  return <MaPartySummary config={config} record={record} />
}
