import { Badge, EmptyState, Input, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { useUnifiedSearch } from '@/features/hub/hooks'

/** 통합 검색 대시보드 — 권한 교차 필터(RLS) 적용. */
export function UnifiedSearchPanel() {
  const [keyword, setKeyword] = useState('')
  const { data, isFetching } = useUnifiedSearch(keyword)

  return (
    <div className="space-y-4">
      <Input
        placeholder="스타트업·전문가 이름으로 검색"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      {isFetching && <Spinner density="table" />}
      {keyword && data && data.length === 0 && !isFetching && (
        <EmptyState title="검색 결과가 없습니다." />
      )}
      <ul className="space-y-2">
        {(data ?? []).map((r) => (
          <li
            key={`${r.kind}-${r.id}`}
            className="flex items-center justify-between rounded border border-gray-300 bg-white px-3 py-2"
          >
            <div>
              <p className="text-body font-medium text-gray-900">{r.name}</p>
              {r.detail && (
                <p className="text-caption text-gray-600">{r.detail}</p>
              )}
            </div>
            <Badge tone={r.kind === 'startup' ? 'info' : 'success'}>
              {r.kind === 'startup' ? '스타트업' : '전문가'}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
