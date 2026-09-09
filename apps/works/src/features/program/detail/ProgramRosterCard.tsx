import { Card, EmptyState, Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import { PERSONA_LABEL, type MasterTable } from '@/features/program/participantPersona'
import { RosterPanel } from '@/features/program/RosterPanel'

/**
 * 사업 상세 참가자 명단 탭 — 자격을 하위 탭으로 가르고 그 아래 명단이 선다
 * (AC는 스타트업·전문가, M&A는 SELLER·BUYER).
 *
 * **이 화면을 부르는 이름은 여기 없다** — `ProgramWorkspaceConfig.rosterLabel`이 갖는다
 * (AC `참가자 목록` / M&A `딜 참여사`). 상수로 둘 때는 이름이 하나뿐이라 값싼 표현이었으나,
 * 워크스페이스마다 부르는 말이 갈리는 순간 그 상수는 답하지 못한다 — 자격 라벨을 persona가
 * 소유하는 것과 같은 규칙이고, 화면에서 `config.key === 'mna'` 삼항으로 가르면 구획이 셋이
 * 되는 날 같은 자리를 다시 연다.
 *
 * **카드가 제목을 들지 않는다.** 이름은 위 탭 줄이 이미 말했고, 카드가 같은 말을 한 번 더
 * 적으면 탭과 제목이 같은 층에서 겹친다 — 워크플로우 카드가 제목을 내려놓은 것과 같은 이유다.
 *
 * **자격이 서는 층이 아래인 이유**는 GUEST 계정생성 탭과 같다 — M&A 상세에는 이미 `SELLER`·
 * `BUYER`가 *연결된 매물*로 서 있어서, 명단 자격까지 같은 층에 올리면 같은 낱말이 한 줄에
 * 두 번 서서 서로 다른 것을 가리킨다.
 *
 * 탭을 바꾸면 명단은 통째로 다시 선다(`key`) — 선택·검색·페이지가 자격을 넘어 살아남으면
 * 안 보이는 행이 선택된 채로 삭제에 딸려 간다.
 */
export function ProgramRosterCard({
  programId,
  personas,
}: {
  programId: string
  /** 이 워크스페이스가 쓰는 자격. GUEST 창구의 하위 탭과 **같은 한 벌**이다. */
  personas: readonly MasterTable[]
}) {
  const [picked, setPicked] = useState<MasterTable | null>(null)

  if (personas.length === 0) {
    return (
      <Card>
        <EmptyState
          title="명단에 담을 자격이 없습니다."
          description="담을 원장이 정해지면 여기에 자격 탭이 섭니다."
        />
      </Card>
    )
  }

  // 고른 것이 목록에서 빠졌으면 첫 자격으로 되돌린다 — 없는 탭을 고른 채로 두면 탭 줄에는
  // 아무것도 선택되어 있지 않은데 아래는 비어, 왜 비었는지 화면이 답하지 못한다.
  const current = personas.find((p) => p === picked) ?? personas[0]!

  return (
    <Card>
      <div className="space-y-4">
        {/* 하나면 탭 줄을 세우지 않는다 — 가를 것이 없는 자리에 선 탭은 '다른 것도 있다'고
            말하는 거짓 신호이고 남는 것은 층뿐이다. */}
        {personas.length > 1 && (
          <Tabs
            items={personas.map((key) => ({ key, label: PERSONA_LABEL[key] }))}
            value={current}
            onChange={(key) => setPicked(key as MasterTable)}
          />
        )}
        <RosterPanel key={current} programId={programId} persona={current} />
      </div>
    </Card>
  )
}
