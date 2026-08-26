import { Button, Card, cn } from '@ynarcher/ui'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { useApprovalDocuments } from '@/features/approval/approvalApi'
import { APPROVAL_PROGRESS_GROUP } from '@/features/approval/config'
import { countByProgress } from '@/features/approval/model'
import { DashboardRowButton } from '@/features/hub/dashboard/DashboardRowButton'

/**
 * 카드에 세우는 결재함 네 칸 — 대기·확인·예정·진행.
 *
 * 목록·라벨·아이콘·순서를 여기서 새로 적지 않고 문서함 좌패널이 쓰는 것(APPROVAL_PROGRESS_GROUP)을
 * 그대로 가져와 '전체'만 뺀다. 전체는 카드 제목 옆 건수가 이미 말하고 있고, 두 자리가 같은 칸을
 * 각자 적으면 한쪽에 칸이 늘었을 때 다른 쪽만 옛 네 칸으로 남는다.
 */
const BOXES = APPROVAL_PROGRESS_GROUP.boxes.filter((b) => b.key !== 'all')

/**
 * 전자결재 위젯 — 결재함별 건수를 세로로 세워 둔 자리.
 *
 * 건수는 문서함 좌패널의 '진행 중인 문서'와 **같은 함수(countByProgress)로 센다**. 대시보드는
 * "지금 내가 처리할 게 있나"에 답하는 자리라, 문서함을 열어 보고 숫자가 다르면 둘 중 어느 쪽도
 * 믿을 수 없게 된다. 보이는 문서의 범위 자체는 서버 RLS가 가른다(목록 조회를 그대로 재사용하므로
 * 대시보드가 문서함보다 넓게 볼 방법이 없다).
 *
 * 각 줄은 그 칸이 켜진 문서함으로 건너간다(`?tab=approval&progress=`). 0건인 줄도 자리를 지키고
 * 누를 수 있다 — 비어 있음을 확인하러 가는 것도 답이며, 눌리는 줄과 안 눌리는 줄이 섞이면 어느
 * 것이 버튼인지 매번 다시 살펴야 한다.
 *
 * 네 칸을 2열 격자로 접지 않고 한 줄에 하나씩 세운다. 바로 위 근무체크의 출근·퇴근 줄과
 * 같은 규격(DashboardRowButton)이라, 우측 열 전체가 하나의 목록처럼 읽힌다.
 *
 * `onNavigate`는 페이지를 옮길 때 호출된다 — 슬라이드오버(개인 메뉴) 안에서 열렸을 때 패널을
 * 닫는 용도다(WelcomeCard와 같은 규약). 대시보드에 놓일 때는 넘기지 않는다.
 */
export function ApprovalCard({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: docs } = useApprovalDocuments()
  const counts = useMemo(() => countByProgress(docs ?? [], uid), [docs, uid])

  const go = (query: string) => {
    navigate(`/office?tab=approval${query}`)
    onNavigate?.()
  }

  return (
    <Card
      title="전자결재"
      // 제목 옆 건수는 네 함의 합이다 — 카드를 펼치지 않고도 지금 걸린 것이 몇 건인지 알린다.
      count={counts.all}
      actions={
        <Button variant="outline" onClick={() => go('')}>
          결재함
        </Button>
      }
    >
      <div className="space-y-2">
        {BOXES.map(({ key, label, icon: Icon }) => {
          const count = counts[key]
          return (
            <DashboardRowButton
              key={key}
              icon={<Icon className="size-4" />}
              label={label}
              onClick={() => go(`&progress=${key}`)}
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
