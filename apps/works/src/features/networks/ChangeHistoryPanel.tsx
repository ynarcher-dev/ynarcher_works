import { Badge } from '@ynarcher/ui'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import type { Contribution } from '@/features/networks/hooks'

/** 기여 행위 라벨(변동 이력 타임라인 배지). */
export const CONTRIBUTION_ACTION_LABEL: Record<Contribution['action'], string> = {
  created: '등록',
  merged: '병합',
  enriched: '보강',
  edited: '수정',
  deactivated: '비활성화',
}

/** 기여 로그에서 중복 없는 기여자명 목록(최초 기여순). 공동 관리자 표기의 원천. */
export function uniqueContributors(contributions: Contribution[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of contributions) {
    const name = c.user_name?.trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

/**
 * 변동 이력 패널(공용). 계정정보가 바뀐 타임라인 — 등록·병합·보강·수정·비활성화 이력.
 * 기존 "연혁" 섹션을 개칭·분리한 컴포넌트로, 국내·글로벌 상세페이지가 공유한다.
 * 데이터(기여 로그)는 상위에서 조회해 주입한다(중복 fetch 방지).
 */
export function ChangeHistoryPanel({
  contributions,
}: {
  contributions: Contribution[] | undefined
}) {
  // 훅은 최초 기여순(오래된 순, uniqueContributors가 의존)으로 조회하므로, 표시만 최신순으로 뒤집는다.
  const list = [...(contributions ?? [])].reverse()
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  return (
    <DetailPanelCard title="변동 이력" count={list.length}>
      {list.length > 0 ? (
        <>
          <ul className="space-y-2">
            {pageItems.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 text-body text-gray-800"
              >
                <span className="text-caption tabular-nums text-gray-700">
                  {c.created_at.slice(0, 10)}
                </span>
                <Badge tone="neutral">
                  {CONTRIBUTION_ACTION_LABEL[c.action]}
                </Badge>
                <span className="font-medium">{c.user_name ?? '-'}</span>
                <span className="text-caption text-gray-700">
                  {c.source === 'upload' ? '업로드' : '수기'}
                  {c.note ? ` · ${c.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      ) : (
        <p className="text-body text-gray-600">기록된 변동 이력이 없습니다.</p>
      )}
    </DetailPanelCard>
  )
}
