import { Button, Card, cn } from '@ynarcher/ui'
import { CalendarClock, CheckCheck, Inbox, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DashboardRowButton } from '@/features/hub/dashboard/DashboardRowButton'

/**
 * 전자결재함 네 칸. 순서는 급한 것부터다 — 내가 지금 처리해야 할 것(대기·확인)이 위,
 * 내 문서가 어떻게 흘러가는지(예정·진행)가 아래.
 */
const APPROVAL_BOXES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'pending', label: '대기', icon: Inbox },
  { key: 'confirm', label: '확인', icon: CheckCheck },
  { key: 'planned', label: '예정', icon: CalendarClock },
  { key: 'ongoing', label: '진행', icon: Send },
]

/**
 * 결재함별 건수. 원장이 아직 없어 **화면 확인용 더미**다 — 건수 조회 훅이 붙으면 통째로
 * 교체된다. '대기'에만 값을 넣어 둔 이유는 건이 있는 줄과 없는 줄이 나란히 섰을 때 어떻게
 * 갈리는지 보기 위함이다.
 */
const DUMMY_COUNTS: Record<string, number> = { pending: 3 }

/**
 * 전자결재 위젯 — 결재함별 건수를 세로로 세워 둔 자리.
 *
 * 결재 원장·화면은 아직 없다. **지금은 배치만 잡아 둔 껍데기**이며, 건수는 더미이고 눌러도
 * 아무 일이 없다. 원장이 생기면 이 파일에서 바뀌는 것은 두 가지뿐이다 — 건수 조회 훅을
 * 붙이는 것과 각 줄에 이동 경로를 다는 것.
 *
 * 네 칸을 2열 격자로 접지 않고 한 줄에 하나씩 세운다. 바로 위 근무체크의 출근·퇴근 줄과
 * 같은 규격(DashboardRowButton)이라, 우측 열 전체가 하나의 목록처럼 읽힌다.
 */
export function ApprovalCard() {
  return (
    <Card
      title="전자결재"
      // 결재 목록 전체로 가는 자리. 갈 곳이 아직 없어 버튼만 세워 둔다(근무체크 '근태현황'과 동일).
      actions={<Button variant="outline">결재함</Button>}
    >
      <div className="space-y-2">
        {APPROVAL_BOXES.map(({ key, label, icon: Icon }) => {
          const count = DUMMY_COUNTS[key] ?? 0
          return (
            <DashboardRowButton
              key={key}
              icon={<Icon className="size-4" />}
              label={label}
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
