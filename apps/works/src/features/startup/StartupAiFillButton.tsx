import { Button, cardText } from '@ynarcher/ui'
import { useState } from 'react'
import type { EntityRow } from '@/features/master/entityHooks'
import { StartupAiFillModal } from '@/features/startup/StartupAiFillModal'
import type { AiSource } from '@/features/startup/startupAiFill'
import type { AiFillEnvelope } from '@/features/startup/startupAiMerge'
import type { AiCardKey } from '@/features/startup/startupAiCards'

/**
 * 자료 관리 카드 아래에 서는 'AI 작성하기' 진입 버튼.
 *
 * 자리가 여기인 이유는 **재료 옆**이기 때문이다 — 이 기능이 읽는 것은 그 카드에 올라간
 * 파일이라, 재료에서 떨어뜨리면 무엇을 근거로 채우는지가 화면에서 사라진다.
 *
 * **편집 폼(등록·수정) 안에만 선다.** 조회 화면에는 두지 않는다 — 조회는 읽기만 하는 자리이고,
 * 거기서 누르면 값을 바꾸는 일이 시작되어 그 화면이 말하는 것과 하는 일이 어긋난다. 폼 안에
 * 있으면 초안이 다른 입력과 같은 자리에서 같은 방식으로 확정된다(저장 버튼 하나).
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.1
 */
export function StartupAiFillButton({
  sources,
  snapshot,
  loading = false,
  startupId,
  companyName,
  onFilled,
}: {
  /** 고를 수 있는 자료(수정: 올라간 첨부 / 등록: 아직 안 올라간 파일). */
  sources: AiSource[]
  /** 지금 폼에 적힌 값을 원장 행 모양으로 세운 것. 기본 체크와 병합의 기준이 된다. */
  snapshot: EntityRow
  loading?: boolean
  /** 수정 모드의 대상 id. 등록 모드에는 아직 없다. */
  startupId?: string
  companyName?: string
  onFilled: (envelope: AiFillEnvelope, cards: AiCardKey[]) => void
}) {
  const [open, setOpen] = useState(false)
  const hasPdf = sources.some((s) => s.pdf)

  return (
    <div>
      <Button
        variant="secondary"
        className="w-full"
        disabled={loading || !hasPdf}
        onClick={() => setOpen(true)}
      >
        AI 작성하기
      </Button>
      {/* 막힌 이유는 접지 않는다 — 다음에 무엇을 해야 하는지를 지시하는 안내다. */}
      {!loading && !hasPdf && (
        <p className={`mt-1.5 ${cardText.meta}`}>PDF 자료를 먼저 첨부하세요.</p>
      )}
      {open && (
        <StartupAiFillModal
          sources={sources}
          snapshot={snapshot}
          startupId={startupId}
          companyName={companyName}
          onClose={() => setOpen(false)}
          onFilled={(envelope, cards) => {
            setOpen(false)
            onFilled(envelope, cards)
          }}
        />
      )}
    </div>
  )
}
