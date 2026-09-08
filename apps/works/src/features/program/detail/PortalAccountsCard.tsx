import { Button, Card, InfoRows, Modal, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program } from '@/features/program/hooks'
import { PortalAccountsPanel } from '@/features/program/detail/PortalAccountsPanel'
import { isDoorOpen } from '@/features/program/guestDoorBadge'
import { useProgramParticipants } from '@/features/program/participantHooks'
import { PERSONA_LABEL, type MasterTable } from '@/features/program/participantPersona'

/** 버튼이 부르는 이름. 동사이므로 탭이 아니라 버튼에 어울린다(2026-09-08). */
export const PORTAL_ACTION_LABEL = 'Y&A 포털 계정생성'

/**
 * 우측 컬럼의 포털 계정 카드 — **요약은 카드가 세우고, 다루는 일은 모달이 한다.**
 *
 * 2026-09-08 사용자 지정으로 명부가 상단 탭에서 이 자리로 내려왔다. 탭이었을 때의 문제는
 * 이름이었다 — `Y&A 포털 계정생성`은 **동사**인데 옆의 것들(워크플로우·사업개요·공지사항)은
 * 전부 이 사업이 가진 것을 부르는 **명사**라, 한 줄에 성격이 다른 칸이 섞였다. 동사는
 * 버튼의 말이다.
 *
 * **버튼으로 빼면 잃는 것이 하나 있었다** — "밖에서 누가 들어와 있나"가 눌러 보기 전에는
 * 보이지 않는다. 그래서 버튼만 두지 않고 **건수를 든 카드**로 세운다. 자격별 명부 수와
 * 그중 문이 열린 수가 카드에 서므로, 훑는 눈은 여전히 그 답을 얻는다.
 *
 * **자리가 우측인 이유**는 그 컬럼의 성격이 같아서다 — 자료·전자결재·회의록·변동 이력은
 * 전부 '이 사업에 딸린 것들'이고 각자 건수 요약과 상세로 가는 길을 갖는다. 명부도 같은
 * 종류이며, 좌측 탭 줄은 '이 사업의 본문'만 남는다.
 *
 * **맨 위에 서는 이유**는 급한 순서다 — 이 사업이 누구를 상대로 도는가가 먼저이고, 자료와
 * 결재는 그 사람들과 주고받는 것이다. 아래 다섯 장의 상대 순서는 상세 화면 공통 그대로다.
 */
export function PortalAccountsCard({
  program,
  personas,
}: {
  program: Program
  /** 이 워크스페이스가 쓰는 자격. 창구의 하위 탭과 **같은 한 벌**이다. */
  personas: readonly MasterTable[]
}) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useProgramParticipants(program.id)
  const rows = data ?? []

  /** 그 줄의 문 상태를 판정할 재료. 판정 자체는 표·창구와 같은 한 벌이 한다. */
  const door = (r: (typeof rows)[number]) => ({
    loginStatus: r.login_status,
    hasTarget: Boolean(r.master_id),
    programStatus: program.status,
    accessEndsAt: program.guest_access_ends_at,
  })

  if (personas.length === 0) return null

  return (
    <>
      <Card
        title="Y&A 포털 계정"
        count={rows.length}
        help="이 사업에 밖에서 들어오는 사람들입니다. 계정은 사람마다 하나이고, 같은 사람이 다른 사업에 걸려 있으면 그 계정이 그대로 쓰입니다."
      >
        <div className="space-y-3">
          {isLoading ? (
            <Spinner />
          ) : (
            <InfoRows
              items={personas.map((persona) => {
                const mine = rows.filter((r) => r.master_table === persona)
                // 문이 열린 줄만 따로 센다 — 명부에 있다는 것과 지금 들어올 수 있다는 것은
                // 다른 사실이고, 담당자가 알고 싶은 것은 뒤쪽이다. 판정은 표·창구와 같은
                // 한 벌(`guestDoorBadge`)을 쓴다: 각자 조합하면 어긋난 날 어느 쪽이 사실인지
                // 판정할 근거가 없다.
                //
                // '열림'은 초대와 이용 중을 함께 센다(`isDoorOpen`) — 아직 들어와 보지
                // 않았을 뿐 문은 열려 있고, 카드가 답하는 물음은 "몇 명이 들어올 수 있나"다.
                // 실제로 들어와 봤는지는 표의 최종 접속 열이 줄마다 답한다.
                const live = mine.filter((r) => isDoorOpen(door(r))).length
                return {
                  label: PERSONA_LABEL[persona],
                  value: mine.length === 0 ? null : `${mine.length}명 · 열림 ${live}`,
                }
              })}
            />
          )}

          <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
            {PORTAL_ACTION_LABEL}
          </Button>
        </div>
      </Card>

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
