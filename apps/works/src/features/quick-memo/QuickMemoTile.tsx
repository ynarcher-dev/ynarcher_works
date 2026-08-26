import { Badge, cardText, cn, pinMark, type BadgeTone } from '@ynarcher/ui'
import { memoSurface } from './quickMemoColors'
import {
  CHECKLIST_STATUS_LABEL, checklistStatus, isChecklistDone,
  type ChecklistStatus, type QuickMemo,
} from './quickMemoStore'

/**
 * 수정 시각 표기 — 공지·게시판과 같은 `YYYY.MM.DD`(2026-08-26).
 *
 * 전에는 오늘 고친 메모만 시각(`14:20`)으로, 그 밖은 `8월 25일`로 적었다. 같은 대시보드에서
 * 공지는 `2026.07.23`인데 바로 옆 체크리스트는 `8월 25일`이라 두 줄의 날짜가 같은 축으로
 * 읽히지 않았다. 연도까지 적으므로 해가 바뀐 메모도 오늘 것처럼 보이지 않는다.
 *
 * ISO 문자열을 자르지 않고 로컬 시각으로 풀어 쓴다 — 저장 값은 UTC라, 잘라 쓰면 밤늦게 고친
 * 메모가 하루 앞선 날짜로 적힌다.
 */
function formatDate(value: string) {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

function preview(memo: QuickMemo) {
  if (memo.type === 'NOTE') return memo.content.trim() || '내용이 없습니다.'
  return `${memo.items.filter((item) => item.completed).length}/${memo.items.length} 완료`
}

/**
 * 상태 배지의 색 — 다 끝낸 목록은 초록(성공)이 아니라 **중립(회색)**으로 내려앉는다. 끝난 일은
 * 더 볼 것이 없으므로 남은 일보다 앞으로 나와서는 안 된다.
 *
 * 말(`CHECKLIST_STATUS_LABEL`)과 판정(`checklistStatus`)은 배지가 갖지 않고 store에서 읽는다 —
 * 패널의 상태 탭이 거르고 부르는 기준과 갈리면 배지는 '진행중'인데 그 탭에는 서지 않는 줄이
 * 생긴다.
 */
const STATUS_TONE: Record<ChecklistStatus, BadgeTone> = {
  PENDING: 'neutral',
  ACTIVE: 'info',
  DONE: 'neutral',
}

/**
 * 메모 한 장(타일) — 색 바탕 위에 고정 핀·제목·미리보기·시각을 얹은 목록 줄.
 *
 * 퀵 메모 슬라이드오버 목록과 OFFICE 대시보드 카드가 **같은 한 벌을 나눠 쓴다.** 두 자리가
 * 같은 것을 보여 주므로, 타일 모양이 갈리지 않도록 이 파일 하나만 고치면 둘이 함께 따라온다.
 *
 * `titleOnly`는 대시보드 카드의 자리다 — 거기서는 메모를 읽는 것이 아니라 무엇이 쌓여 있는지만
 * 훑으므로 내용(미리보기) 줄을 걷고 제목 한 줄로 선다. 읽는 자리(패널 목록)는 내용을 남긴다.
 */
export function QuickMemoTile({
  memo,
  onClick,
  titleOnly = false,
}: {
  memo: QuickMemo
  onClick: () => void
  titleOnly?: boolean
}) {
  // 다 끝낸 체크리스트는 고른 색(포스트잇 바탕)을 내려놓고 회색으로 가라앉는다 — 목록에서
  // 끝난 것과 남은 것을 색 하나로 갈라 준다.
  const done = isChecklistDone(memo)
  const status = checklistStatus(memo)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-radius-md p-3 text-left transition-[filter] hover:brightness-[0.98]',
        done ? 'bg-gray-50' : memoSurface(memo.color),
      )}
    >
      <div className={cn('flex justify-between gap-3', titleOnly ? 'items-center' : 'items-start')}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {pinMark(memo.pinned)}
            <p className={cn('truncate', cardText.subhead, done && 'text-gray-500')}>
              {memo.title || '제목 없는 메모'}
            </p>
            {status && (
              <Badge tone={STATUS_TONE[status]} dot>
                {CHECKLIST_STATUS_LABEL[status]}
              </Badge>
            )}
          </div>
          {!titleOnly && <p className={`mt-1 line-clamp-2 ${cardText.subtitle}`}>{preview(memo)}</p>}
        </div>
        <span className={`shrink-0 ${cardText.meta}`}>{formatDate(memo.updatedAt)}</span>
      </div>
    </button>
  )
}
