import { Badge, Input, Spinner, cn } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnifiedSearch } from '@/features/hub/hooks'

/** 검색 결과 종류별 상세 경로. RLS가 걸러낸 결과만 내려오므로 별도 권한 분기는 두지 않는다. */
function detailPath(kind: 'startup' | 'expert', id: string) {
  return kind === 'startup' ? `/startup/discovered/${id}` : `/networks/exp/${id}`
}

/**
 * 상단바 전역 검색. 스타트업·전문가 원장을 이름으로 훑어 상세로 바로 보낸다.
 * OFFICE 통합검색 패널(UnifiedSearchPanel)과 동일한 쿼리를 쓰되, 어느 워크스페이스에서든
 * 화면 이동 없이 찾을 수 있게 상단바에 상주시킨다.
 */
export function GlobalSearchBox() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  // 타자마다 쿼리가 나가지 않도록 250ms 지연시킨 값으로만 조회한다.
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword), 250)
    return () => clearTimeout(t)
  }, [keyword])

  const { data, isFetching } = useUnifiedSearch(debounced)
  const results = data ?? []
  const showPanel = open && debounced.trim().length > 0

  const go = (kind: 'startup' | 'expert', id: string) => {
    setOpen(false)
    setKeyword('')
    navigate(detailPath(kind, id))
  }

  return (
    <div
      // 패널 안 항목으로 포커스가 옮겨갈 때는 닫지 않는다(relatedTarget이 컨테이너 내부).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
      // 모바일에서는 상단바 폭이 좁아 감춘다(OFFICE 통합검색 탭으로 대체).
      className="relative hidden w-72 md:block xl:w-96"
    >
      <Input
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="스타트업·전문가 검색"
        aria-label="전역 검색"
        icon={<Search aria-hidden className="size-4" />}
        className="h-ctl-card shadow-none"
      />
      {showPanel && (
        <div
          // 팝오버 패널 규격: radius.md · border-gray-300 · shadow.popover (5_component_spec_rules §1.1)
          className="absolute left-0 right-0 top-full z-dropdown mt-1.5 max-h-80 overflow-y-auto rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover"
        >
          {isFetching && results.length === 0 && (
            <p className="flex items-center gap-2 px-3 py-2 text-body text-gray-500">
              <Spinner size="sm" /> 검색 중
            </p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-body text-gray-500">검색 결과가 없습니다.</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              onClick={() => go(r.kind, r.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-radius-md px-3 py-1.5 text-left',
                'transition-colors duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-body text-gray-900">{r.name}</span>
                {r.detail && (
                  <span className="block truncate text-caption text-gray-500">{r.detail}</span>
                )}
              </span>
              <Badge tone={r.kind === 'startup' ? 'info' : 'success'}>
                {r.kind === 'startup' ? '스타트업' : '전문가'}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
