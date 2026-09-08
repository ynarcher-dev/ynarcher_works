import { Button, Modal } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program } from '@/features/program/hooks'
import { PortalAccountsPanel } from '@/features/program/detail/PortalAccountsPanel'
import type { MasterTable } from '@/features/program/participantPersona'

/** 버튼이 부르는 이름. 동사이므로 탭이 아니라 버튼에 어울린다(2026-09-08). */
export const PORTAL_ACTION_LABEL = 'Y&A 포털 계정생성'

/**
 * 사업 정보 카드와 탭 줄 사이에 서는 포털 계정 버튼 — 누르면 명부가 모달로 열린다.
 *
 * **탭에서 내려온 이유는 이름이었다**(2026-09-08 사용자 지정). `Y&A 포털 계정생성`은 **동사**인데
 * 탭 줄의 이웃들(워크플로우·SELLER·사업개요·공지사항)은 전부 이 사업이 가진 것을 부르는
 * **명사**라, 한 줄에 성격이 다른 칸이 섞였다. 동사는 버튼의 말이고, 버튼이 되니 이름이
 * 비로소 제자리다.
 *
 * **우측 컬럼이 아니라 여기인 이유**(같은 날 재지정): 그쪽은 이미 패널이 다섯 장이라
 * (자료·전자결재·회의록·변동 이력·코멘트) 한 장을 더하면 무엇이 무엇인지 흐려진다. 자리를
 * 고르는 기준은 '성격이 같은 것끼리'였는데, 그 기준이 통하려면 **묶음이 읽힐 만큼 짧아야**
 * 한다. 다섯을 넘긴 목록에서는 여섯 번째가 묶음에 들어가는 것이 아니라 그냥 늘어난다.
 *
 * 여기가 맞는 자리인 것은 순서 때문이기도 하다 — 사업이 무엇인지(정보 카드) 다음에 오는 것이
 * **누구를 상대로 도는가**이고, 그다음이 무엇을 하는가(탭 줄)다.
 *
 * **폭이 꽉 찬 이유**는 아래 `+ 워크플로우 추가`와 같은 규격이기 때문이다 — 한 줄을 통째로
 * 차지하는 버튼은 이 앱에서 이미 '이 자리에서 새로 여는 일'을 뜻한다. 오른쪽 끝에 작게
 * 두면 정보 카드의 액션인지 탭 줄의 것인지 자리가 답하지 못한다.
 *
 * **건수는 아직 세우지 않는다**(사용자 지정 "버튼만 일단"). 세우려면 명부를 미리 읽어야
 * 하는데, 그 조회는 지금 모달을 열 때만 돌아 화면이 뜨는 값을 그만큼 덜 든다.
 */
export function PortalAccountsButton({
  program,
  personas,
}: {
  program: Program
  /** 이 워크스페이스가 쓰는 자격. 창구의 하위 탭과 **같은 한 벌**이다. */
  personas: readonly MasterTable[]
}) {
  const [open, setOpen] = useState(false)

  // 자격이 없는 워크스페이스에는 버튼도 서지 않는다 — 눌러도 빈 화면이 뜨는 버튼을 두지 않는다.
  if (personas.length === 0) return null

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        {PORTAL_ACTION_LABEL}
      </Button>

      {/*
        모달이 넓은 이유는 안에 든 것이 표여서다 — 검색·선택·페이징·일괄 처리가 함께 산다.
        좁히면 줄어드는 것이 여백이 아니라 한 번에 보이는 칸 수다(Modal 규격 주석).

        바깥 클릭으로 닫지 않는다: 행을 골라 두고 실수로 닫으면 그 선택이 통째로 사라진다.
      */}
      <Modal
        dismissible={false}
        open={open}
        onClose={() => setOpen(false)}
        title={PORTAL_ACTION_LABEL}
        size="3xl"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </div>
        }
      >
        <PortalAccountsPanel program={program} personas={personas} />
      </Modal>
    </>
  )
}
