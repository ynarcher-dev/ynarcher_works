import { Button, cardText } from '@ynarcher/ui'
import { useState } from 'react'
import type { EntityRow } from '@/features/master/entityHooks'
import { isPdfMaterial, useMaterials } from '@/features/networks/materialHooks'
import { StartupAiFillModal } from '@/features/startup/StartupAiFillModal'
import type { AiFillOutcome } from '@/features/startup/startupAiMerge'

/** 자료 첨부 대상 키(스타트업 자료는 한 곳에 모인다 — StartupDetailForm의 MATERIAL_TARGET_TYPE). */
const TARGET_TYPE = 'startup'

/**
 * 자료 관리 카드 아래에 서는 'AI 작성하기' 진입 버튼.
 *
 * 자리가 여기인 이유는 **재료 옆**이기 때문이다 — 이 기능이 읽는 것은 그 카드에 올라간 파일이고,
 * 버튼이 상단 액션 줄로 올라가면 무엇을 근거로 채우는지가 화면에서 사라진다.
 *
 * 자료 목록 조회를 버튼이 갖는 이유는 둘이다: PDF가 한 건도 없으면 눌러도 할 일이 없어 여기서
 * 막아야 하고, 모달의 기본 선택("PDF 전부")이 로딩 중에 굳지 않으려면 목록이 준비된 뒤에
 * 열려야 한다.
 *
 * **조회 모드에만 선다.** 편집 중에는 아직 저장하지 않은 입력이 폼에 있는데, 초안을 얹으려면
 * 폼을 새 초기값으로 다시 세워야 해서 그 입력이 조용히 사라진다. 채우고 나서 고치는 순서가
 * 그 반대보다 잃을 것이 없다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.1
 */
export function StartupAiFillButton({
  record,
  onFilled,
}: {
  record: EntityRow
  /** 초안을 얹은 레코드와 실행 요약. 상세페이지가 편집 모드로 넘긴다. */
  onFilled: (next: EntityRow, outcome: AiFillOutcome) => void
}) {
  const { data: materials, isLoading } = useMaterials(TARGET_TYPE, record.id)
  const [open, setOpen] = useState(false)
  const list = materials ?? []
  const hasPdf = list.some(isPdfMaterial)

  return (
    <div>
      <Button
        variant="secondary"
        className="w-full"
        disabled={isLoading || !hasPdf}
        onClick={() => setOpen(true)}
      >
        AI 작성하기
      </Button>
      {/* 막힌 이유는 접지 않는다 — 다음에 무엇을 해야 하는지를 지시하는 안내다. */}
      {!isLoading && !hasPdf && (
        <p className={`mt-1.5 ${cardText.meta}`}>PDF 자료를 먼저 첨부하세요.</p>
      )}
      {open && (
        <StartupAiFillModal
          record={record}
          materials={list}
          onClose={() => setOpen(false)}
          onFilled={(next, outcome) => {
            setOpen(false)
            onFilled(next, outcome)
          }}
        />
      )}
    </div>
  )
}
