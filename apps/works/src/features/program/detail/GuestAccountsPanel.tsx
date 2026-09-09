import { EmptyState, Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import type { GuestHostEntity } from '@/features/guest/host'
import { ParticipantPool } from '@/features/program/ParticipantPool'
import { PERSONA_LABEL, type MasterTable } from '@/features/program/participantPersona'

/**
 * `와이앤아처 GUEST 설정` 모달의 계정생성 탭 — 자격을 하위 탭으로 가르고 그 아래 명부가 선다.
 *
 * **왜 자격이 한 층 아래인가.** 2026-09-05에는 사업 상세의 상단 탭 줄에 자격 둘이 나란히
 * 섰고, 그때의 근거는 "자격은 표를 거르는 조건이 아니라 게스트에게 **다른 화면을 여는 축**"
 * 이라 필터처럼 읽히면 안 된다는 것이었다. 하위 탭은 필터가 아니라 여전히 탭이므로 그
 * 근거는 상하지 않는다 — 달라진 것은 자격이 서는 층뿐이다.
 *
 * **M&A에서 그 층이 필요해졌다.** 그 상세에는 이미 `SELLER`·`BUYER` 탭이 있고 그것은
 * *연결된 기업의 내용*이다. 명부 자격까지 같은 층에 올리면 같은 낱말이 한 줄에 두 번 서서
 * 서로 다른 것을 가리킨다 — 눌러 보기 전에는 어느 쪽이 무엇인지 화면이 답하지 못한다.
 *
 * 2026-09-05에 실제로 잘못이었던 것은 층이 아니라 **이름**이었다 — 그때의 상위 탭은
 * `참가자`였고 그 아래 `참가자`·`전문가`가 다시 서서, 같은 말이 부모와 자식에 겹쳐 무엇이
 * 무엇을 담는지 말하지 못했다. 지금의 부모는 모달 제목이고 그 아래 것들과 겹치지 않는다.
 *
 * **하나면 탭 줄을 세우지 않는다.** 가를 것이 없는 자리에 선 탭은 '다른 것도 있다'고 말하는
 * 거짓 신호이고 남는 것은 층뿐이다(M&A 연결 기업 패널과 같은 판단).
 */
export function GuestAccountsPanel({
  host,
  personas,
}: {
  host: GuestHostEntity
  /** 이 워크스페이스가 쓰는 자격. 창구의 하위 탭과 **같은 한 벌**이다. */
  personas: readonly MasterTable[]
}) {
  const [picked, setPicked] = useState<MasterTable | null>(null)

  if (personas.length === 0) {
    return (
      <EmptyState
        title="이 워크스페이스에는 GUEST 계정 자격이 없습니다."
        description="계정을 세울 원장이 정해지면 여기에 자격 탭이 섭니다."
      />
    )
  }

  // 고른 것이 목록에서 빠졌으면 첫 자격으로 되돌린다 — 없는 탭을 고른 채로 두면 탭 줄에는
  // 아무것도 선택되어 있지 않은데 아래는 비어, 왜 비었는지 화면이 답하지 못한다.
  const current = personas.find((p) => p === picked) ?? personas[0]!

  if (personas.length === 1) return <ParticipantPool host={host} persona={current} />

  return (
    <div className="space-y-4">
      <Tabs
        items={personas.map((key) => ({ key, label: PERSONA_LABEL[key] }))}
        value={current}
        onChange={(key) => setPicked(key as MasterTable)}
      />
      {/* 탭을 바꾸면 명부는 통째로 다시 선다(key) — 선택·검색·페이지가 자격을 넘어 살아남으면
          안 보이는 행이 선택된 채로 일괄 작업에 딸려 간다. */}
      <ParticipantPool key={current} host={host} persona={current} />
    </div>
  )
}
