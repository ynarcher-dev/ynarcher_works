import { tableText } from '@ynarcher/ui'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import type { Contribution } from '@/features/networks/hooks'

/** 기여 행위 라벨(변동 이력 말머리). */
export const CONTRIBUTION_ACTION_LABEL: Record<Contribution['action'], string> = {
  created: '등록',
  merged: '병합',
  enriched: '보강',
  edited: '수정',
  // 말머리는 격자의 첫 열을 밀지 않도록 짧게 — 다른 넷과 폭을 맞춘다.
  deactivated: '비활',
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
          {/* 목록 행은 실질적으로 표의 한 행이므로 크기를 tableText 하나(12px)로 세우고
              위계는 색으로만 만든다 — 종전에는 한 줄에 14/12/11px가 섞여 있었다. */}
          {/* 행 사이 얕은 실선(divide-y)으로 표의 결을 만든다 — 텍스트만 떠 보이던 것을 눌러준다.
              여백만으로는 34건을 세로로 훑을 때 어디서 한 건이 끝나는지 눈이 잡지 못한다. */}
          <ul className="divide-y divide-gray-100">
            {pageItems.map((c) => (
              // 열 고정 격자. flex로 두면 각 항목의 x 위치가 내용 길이를 따라 행마다 달라져,
              // 34건을 세로로 훑을 수 없다. 앞 세 열은 내용 폭(auto)으로 잡아 모든 행이 같은
              // 지점에서 시작하게 하고, 길이를 예측할 수 없는 출처·비고만 남은 폭을 쓴다.
              <li
                key={c.id}
                className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-center gap-x-3 py-1.5 first:pt-0"
              >
                <span className={`tabular-nums ${tableText.meta}`}>
                  {c.created_at.slice(0, 10)}
                </span>
                {/* 행위는 상태가 아니라 분류이므로 알약 배지가 아니라 대괄호 말머리로 둔다.
                    행마다 배지가 붙으면 목록 전체에 회색 알약이 줄지어 눈이 걸릴 곳이 늘어난다.
                    색은 날짜·출처(메타)와 이름(식별) 사이 단계에 놓아 세 층을 만든다. */}
                <span className={tableText.body}>
                  [{CONTRIBUTION_ACTION_LABEL[c.action]}]
                </span>
                <span className={tableText.primary}>{c.user_name ?? '-'}</span>
                <span className={`truncate ${tableText.meta}`}>
                  {/* 출처는 두 값뿐(DB 제약 manual|upload). 무엇을 뜻하는지 짐작하지 않아도
                      되도록 풀어 쓴다 — '수기'는 종이 기록으로, '업로드'는 자료 첨부로 읽힌다. */}
                  {c.source === 'upload' ? '대용량 업로드' : '직접 입력'}
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
