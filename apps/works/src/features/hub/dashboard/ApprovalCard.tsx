import { Button, Card, cn } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { useApprovalDocuments } from '@/features/approval/approvalApi'
import {
  APPROVAL_DASHBOARD_ROWS,
  approvalNavQuery,
  type ApprovalBoxKey,
  type ApprovalNavRef,
} from '@/features/approval/config'
import { countByBox, countByProgress } from '@/features/approval/model'
import { useEmployee } from '@/features/management/hooks'
import { DashboardRowButton } from '@/features/hub/dashboard/DashboardRowButton'

/** 이 카드가 문서함 축에서 세는 칸 — 지금은 '확인' 하나뿐이다. */
const BOX_KEYS = APPROVAL_DASHBOARD_ROWS.flatMap((r) =>
  r.ref.axis === 'box' ? [r.ref.key] : [],
) as ApprovalBoxKey[]

/**
 * 전자결재 위젯 — 결재함별 건수를 세로로 세워 둔 자리.
 *
 * 줄 목록·라벨·아이콘·순서는 여기서 새로 적지 않고 config의 APPROVAL_DASHBOARD_ROWS가
 * 소유한다(그 상수가 좌패널 그룹에서 라벨·아이콘을 되찾으므로, 좌패널만 고쳐도 여기가 따라온다).
 *
 * 건수도 문서함 화면과 **같은 함수로 센다**(countByProgress / countByBox). 대시보드는 "지금
 * 내가 처리할 게 있나"에 답하는 자리라, 문서함을 열어 보고 숫자가 다르면 둘 중 어느 쪽도 믿을
 * 수 없게 된다. 보이는 문서의 범위 자체는 서버 RLS가 가른다(목록 조회를 그대로 재사용하므로
 * 대시보드가 문서함보다 넓게 볼 방법이 없다).
 *
 * 각 줄은 그 칸이 켜진 문서함으로 건너간다. 0건인 줄도 자리를 지키고 누를 수 있다 — 비어
 * 있음을 확인하러 가는 것도 답이며, 눌리는 줄과 안 눌리는 줄이 섞이면 어느 것이 버튼인지
 * 매번 다시 살펴야 한다.
 *
 * 다섯 칸을 2열 격자로 접지 않고 한 줄에 하나씩 세운다. 바로 위 근무체크의 출근·퇴근 줄과
 * 같은 규격(DashboardRowButton)이라, 우측 열 전체가 하나의 목록처럼 읽힌다.
 *
 * `onNavigate`는 페이지를 옮길 때 호출된다 — 슬라이드오버(개인 메뉴) 안에서 열렸을 때 패널을
 * 닫는 용도다(WelcomeCard와 같은 규약). 대시보드에 놓일 때는 넘기지 않는다.
 */
export function ApprovalCard({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: docs } = useApprovalDocuments()
  // 부서 문서함 판정에 쓰이는 소속. 이 카드가 세우는 칸에는 부서 축이 없지만, 문서함 판정
  // 함수가 요구하는 값이라 실제 소속을 넘긴다(바로 위 인사말 카드가 이미 부른 조회라 공짜다).
  const { data: me } = useEmployee(uid ?? undefined)
  const myDeptId = me?.department_id ?? null

  const progressCounts = useMemo(() => countByProgress(docs ?? [], uid), [docs, uid])
  const boxCounts = useMemo(
    () => countByBox(docs ?? [], BOX_KEYS, uid, myDeptId),
    [docs, uid, myDeptId],
  )
  const countOf = (ref: ApprovalNavRef) =>
    ref.axis === 'progress' ? progressCounts[ref.key] : boxCounts[ref.key]

  // 제목 옆 건수는 다섯 줄의 합이다. 겹치는 칸이 없어(앞의 넷은 끝나지 않은 문서, '확인'은
  // 끝난 문서) 같은 문서를 두 번 세지 않는다 — APPROVAL_DASHBOARD_ROWS 주석 참조.
  const total = APPROVAL_DASHBOARD_ROWS.reduce((sum, r) => sum + countOf(r.ref), 0)

  const go = (query: string) => {
    navigate(`/office?tab=approval${query}`)
    onNavigate?.()
  }

  return (
    <Card
      title="전자결재"
      count={total}
      actions={
        <Button variant="outline" onClick={() => go('')}>
          결재함
        </Button>
      }
    >
      <div className="space-y-2">
        {APPROVAL_DASHBOARD_ROWS.map(({ ref, label, icon: Icon }) => {
          const count = countOf(ref)
          return (
            <DashboardRowButton
              key={`${ref.axis}:${ref.key}`}
              icon={<Icon className="size-4" />}
              label={label}
              onClick={() => go(approvalNavQuery(ref))}
              // 건이 있는 줄만 아이콘에 색이 들어오고 숫자가 붉어진다. 0건도 자리는 지키되
              // 연한 색으로 물러나 있어, 훑는 눈이 처리할 것이 있는 줄에 먼저 걸린다.
              //
              // 붉은 건수는 게시판 [공지] 말머리·카드 제목 옆 건수(cardText.count)와 같은
              // danger-700이다. 다만 크기는 줄 라벨과 같은 단계로 두어 한 줄 안에서 크기로
              // 위계를 만들지 않는다 — 구분은 굵기와 색이 맡는다.
              active={count > 0}
              trailing={
                <span
                  className={cn(
                    'text-body-sm tabular-nums',
                    count > 0 ? 'font-semibold text-danger-700' : 'text-gray-400',
                  )}
                >
                  {count}건
                </span>
              }
            />
          )
        })}
      </div>
    </Card>
  )
}
