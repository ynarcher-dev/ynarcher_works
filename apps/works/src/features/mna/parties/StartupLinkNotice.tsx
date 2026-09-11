import { Button, cardText, cn } from '@ynarcher/ui'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LedgerMatch } from '@/features/master/ledgerMatch'

/**
 * "스타트업 원장에 있는 기업입니다" — 저장 대신 연결을 요구하는 알림(2026-09-11, 3_3_8 §4).
 *
 * 중복 알림(`DuplicateNotice`)과 같은 자리(확정 버튼 바로 아래)에 서되 하는 말이 다르다 —
 * 저쪽은 "이 원장에 이미 있다"이고 이쪽은 "다른 원장(스타트업)에 있으니 거기에 이어라"다.
 * 되돌릴 길이 연결 하나뿐이라 버튼도 하나다: 누르면 돋보기로 고른 것과 같은 결과가 된다
 * (이름·분야·담당자·연락처가 원장 값으로 채워지고 이름 칸이 잠긴다).
 */
export function StartupLinkNotice({
  hit,
  onLink,
}: {
  hit: LedgerMatch
  onLink: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const what = hit.hitFields
    .map((f) => ({ hard: '사업자등록번호', name: '이름', email: '이메일', phone: '연락처' })[f])
    .join('·')
  return (
    <div className="rounded-radius-md border border-danger-border bg-danger-subtle px-3 py-2.5">
      <p className="text-body font-semibold text-gray-900">
        스타트업 원장에 있는 기업입니다 — {what}이(가) 같습니다.
      </p>
      <p className={cn('mt-1', cardText.meta)}>
        <Link
          to={`/startup/${hit.id}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-info transition-opacity duration-fast hover:opacity-80"
        >
          {hit.name}
        </Link>
        {hit.email && <> · {hit.email}</>}
        {hit.phone && <> · {hit.phone}</>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cardText.meta}>
          새로 만들 수 없습니다. 스타트업 DB를 연결한 뒤 저장하세요.
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onLink()
            } finally {
              setBusy(false)
            }
          }}
        >
          이 기업으로 연결
        </Button>
      </div>
    </div>
  )
}
