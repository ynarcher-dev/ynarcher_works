import { cardText, cn } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import type { LedgerMatch } from '@/features/master/ledgerMatch'

/**
 * 중복 대조에 걸렸을 때 저장 버튼 곁에 서는 알림.
 *
 * **무엇이 같아서 걸렸는지**를 밝힌다 — "이미 있습니다" 한 줄이면 담당자가 동명이인인지 진짜
 * 중복인지 판단할 근거가 없고, 그때 할 수 있는 일은 통째로 믿거나 통째로 무시하는 것뿐이다.
 *
 * **찾은 행으로 가는 길을 함께 준다.** 중복을 발견한 담당자가 다음에 할 일은 대개 '그 행을
 * 열어 보는 것'인데, 그 길이 없으면 이름을 외워서 목록에서 다시 찾아야 한다. 새 탭으로 여는
 * 이유는 지금 적던 폼을 잃지 않기 위해서다.
 *
 * 토스트로 띄우지 않는다 — 사라지는 알림은 "한 번 더 누르면 저장됩니다"를 말할 수 없다.
 */
export function DuplicateNotice({
  match,
  noun,
  detailPath,
}: {
  match: LedgerMatch
  /** 이 원장을 부르는 말(기업·전문가·셀러…). 문장이 자연스러우려면 화면이 준다. */
  noun: string
  /** 찾은 행의 상세 경로. 갈 곳이 없으면 주지 않는다 — 누를 수 없는 링크를 세우지 않는다. */
  detailPath?: (id: string) => string
}) {
  const to = detailPath?.(match.id)
  return (
    <div className="rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2.5">
      <p className="text-body font-semibold text-gray-900">
        이미 등록된 {noun}일 수 있습니다 — {match.hits}개 항목이 일치합니다.
      </p>
      <p className={cn('mt-1', cardText.meta)}>
        {to ? (
          <Link
            to={to}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-info transition-opacity duration-fast hover:opacity-80"
          >
            {match.name}
          </Link>
        ) : (
          <span className="font-medium text-gray-800">{match.name}</span>
        )}
        {match.email && <> · {match.email}</>}
        {match.phone && <> · {match.phone}</>}
        {match.retired && <> · 원장 비활성</>}
      </p>
      <p className={cn('mt-1.5', cardText.meta)}>
        {match.retired
          ? '원장에서 내려간 행입니다. 되살릴 대상이라면 새로 만들지 말고 그 행을 여세요.'
          : '다른 곳이라면 한 번 더 저장을 누르세요. 같은 곳이라면 위 링크에서 기존 행을 고치세요.'}
      </p>
    </div>
  )
}
