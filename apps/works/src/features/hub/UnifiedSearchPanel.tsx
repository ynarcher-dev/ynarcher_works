import { Badge, EmptyState, Input, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnifiedSearch } from '@/features/hub/hooks'
import { GLOBAL_SEARCH_MIN_LENGTH } from '@/features/hub/globalSearch'

/** 통합 검색 대시보드 — 권한 교차 필터(RLS)와 민감정보 검색 정책을 적용한다. */
export function UnifiedSearchPanel() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const { data, isFetching } = useUnifiedSearch(keyword)
  const tooShort = keyword.trim().length > 0 && keyword.trim().length < GLOBAL_SEARCH_MIN_LENGTH

  return (
    <div className="space-y-4">
      <Input
        placeholder="DB·워크스페이스 항목 검색"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      {isFetching && <Spinner density="table" />}
      {tooShort && (
        <EmptyState title={`${GLOBAL_SEARCH_MIN_LENGTH}글자 이상 입력하세요.`} />
      )}
      {!tooShort && keyword && data && data.length === 0 && !isFetching && (
        <EmptyState title="검색 결과가 없습니다." />
      )}
      <ul className="space-y-2">
        {!tooShort && (data ?? []).map((r) => (
          <li
            key={`${r.kind}-${r.id}-${r.path}`}
            className="rounded border border-gray-300 bg-white"
          >
            <button
              type="button"
              onClick={() => navigate(r.path)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-gray-900">{r.name}</p>
                {r.detail && (
                  <p className="truncate text-caption text-gray-600">{r.detail}</p>
                )}
              </div>
              <Badge tone={r.tone}>{r.badge}</Badge>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
