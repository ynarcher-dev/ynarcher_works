import { EmptyState, Spinner, Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import { MaPartyView } from '@/features/mna/parties/MaPartyView'
import { MA_BUYER, MA_SELLER, type MaPartyConfig } from '@/features/mna/parties/config'
import { useMaPartyRecord } from '@/features/mna/parties/hooks'
import { useMaProgramPartyLinks } from '@/features/mna/programPartyLinks'

/**
 * 퀵리뷰 모듈(전체 화면) — 이 프로젝트에 연결된 매물을 **원장 상세와 같은 구성**으로 세운다.
 *
 * 2026-09-08 사용자 지정으로 프로젝트 상세의 SELLER·BUYER 탭이 이 모듈로 내려왔다. 탭 줄이
 * 어색했던 이유는 그 줄이 답하는 물음과 달랐기 때문이다 — 그 줄은 '이 프로젝트에서 무엇을
 * 하는가'를 세우는데(워크플로우), 연결된 기업의 내용은 '무엇을 하는가'가 아니라 '무엇을
 * 놓고 하는가'다. 모듈이 되면 검토라는 일이 다른 일들과 같은 줄에서 상태·기간·담당자를 갖는다.
 *
 * **배치는 `MaPartyView`가 통째로 갖는다**(같은 날 재지정 "콘텐츠 쪽 비율은 2:1로, 구성은
 * M&A DB와 동일하게"). 처음에는 희망사항과 퀵 리뷰만 손으로 세웠는데 두 가지가 틀렸다 —
 * 폭이 전면이라 일곱 절 표가 한 줄에 늘어졌고, 무엇보다 **희망사항이 두 번 섰다**(원장
 * 상세는 그 값을 기업명 아래 부제로 이미 세우고 있었다). 배치를 빌려 오면 그런 어긋남이
 * 애초에 생기지 않는다.
 *
 * **고치는 자리가 아니다.** 값은 M&A 원장이 소유하고 여기서는 비추기만 한다 — 모듈이 값을
 * 들고 있으면 원장을 고쳤을 때 어느 쪽이 진짜인지 판정할 근거가 없다. 그래서 `MaPartyView`가
 * 세우는 자료 패널도 읽기 전용이고, 고치러 가는 길은 그 원장 상세 하나다.
 *
 * **연결이 둘 이상이면 이어 붙이지 않고 하위 탭으로 가른다** — 이어 붙이면 퀵 리뷰가 건수만큼
 * 세로로 쌓여, 두 번째 기업의 주요내용을 보려면 첫 기업의 문서 일곱 절을 스크롤로 지나야 하고
 * 지나는 동안 지금 보는 표가 어느 기업 것인지 화면이 답하지 않는다.
 */
export function QuickReviewPanel({ programId }: { programId: string }) {
  const { data: links, isLoading } = useMaProgramPartyLinks(programId)
  const [picked, setPicked] = useState<string | null>(null)

  if (isLoading) return <Spinner />

  const parties = links ?? []
  if (parties.length === 0) {
    // 연결이 0건이 되면 모듈도 함께 걷힌다(2026-09-09) — 그래서 이 빈 상태는 거의 서지 않는다.
    // 남는 경우는 하나다: 이 모듈에 무언가 매달려 있어 자동 삭제가 건너뛴 때(그때는 사람이
    // 지운다). 그 자리에서도 어디서 고치는지까지 말한다.
    return (
      <EmptyState
        title="연결된 매물이 없습니다."
        description="프로젝트 편집에서 M&A SELLER·BUYER 매물을 연결하면 여기에 섭니다."
      />
    )
  }

  const current = parties.find((p) => p.id === picked) ?? parties[0]!

  if (parties.length === 1) return <PartyReview party={current} />

  return (
    <div className="space-y-4">
      <Tabs
        items={parties.map((p) => ({ key: p.id, label: p.name }))}
        value={current.id}
        onChange={setPicked}
      />
      {/* 탭을 옮기면 몸통은 통째로 다시 선다(key) — 같은 부품에 다른 기업의 값이 들어가면
          퀵 리뷰의 접힘·스크롤 같은 내부 상태가 앞 기업의 것으로 남는다. */}
      <PartyReview key={current.id} party={current} />
    </div>
  )
}

/**
 * 연결 한 건. 원장 행을 여기서 다시 읽는 이유는 연결 조회가 **목록에 필요한 칸만** 담아
 * 오기 때문이다 — 퀵 리뷰 문서는 무거워 목록 조회가 들고 다닐 값이 아니고, 연결이 여럿이면
 * 그 무게가 건수만큼 곱해진다.
 *
 * 훅을 부르는 자리라 연결마다 컴포넌트를 나눈다(반복문 안에서 훅을 부르지 않는다).
 */
function PartyReview({ party }: { party: { id: string; kind: 'BUY' | 'SELL'; name: string } }) {
  const config: MaPartyConfig = party.kind === 'SELL' ? MA_SELLER : MA_BUYER
  const { data: record, isLoading } = useMaPartyRecord(config, party.id)

  if (isLoading) return <Spinner />
  if (!record) {
    // 연결은 남아 있는데 원장 행을 못 읽는 경우다(소프트 삭제 또는 열람 권한 없음). 조용히
    // 빈 자리로 두지 않는다 — 연결이 몇 건인지는 편집 화면이 말하는데 여기서 사라지면
    // 두 화면이 서로 다른 수를 답한다.
    return (
      <EmptyState
        title="연결된 매물을 읽을 수 없습니다."
        description="삭제되었거나 열람 권한이 없는 기업입니다."
      />
    )
  }

  return <MaPartyView config={config} record={record} />
}
