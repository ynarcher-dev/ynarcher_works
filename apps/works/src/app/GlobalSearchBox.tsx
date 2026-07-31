import { Badge, Input, Spinner, cn } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnifiedSearch } from '@/features/hub/hooks'
import { GLOBAL_SEARCH_MIN_LENGTH } from '@/features/hub/globalSearch'

/**
 * 상단바 전역 검색. 데이터베이스 원장과 주요 워크스페이스 항목을 훑어 상세로 바로 보낸다.
 * 민감정보는 각 목록 화면과 같은 정책으로 검색 범위를 줄이고, 결과 라벨도 같은 기준으로 가린다.
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
  const showMinHint =
    debounced.trim().length > 0 && debounced.trim().length < GLOBAL_SEARCH_MIN_LENGTH

  const go = (path: string) => {
    setOpen(false)
    setKeyword('')
    navigate(path)
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
        placeholder="DB·워크스페이스 검색"
        aria-label="전역 검색"
        icon={<Search aria-hidden className="size-4" />}
        className="h-ctl-card shadow-none"
      />
      {showPanel && (
        <div
          // 팝오버 패널 규격: radius.md · border-gray-300 · shadow.popover (5_component_spec_rules §1.1)
          className="absolute left-0 right-0 top-full z-dropdown mt-1.5 max-h-80 overflow-y-auto rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover"
        >
          {showMinHint && (
            <p className="px-3 py-2 text-body text-gray-500">
              {GLOBAL_SEARCH_MIN_LENGTH}글자 이상 입력하세요.
            </p>
          )}
          {!showMinHint && isFetching && results.length === 0 && (
            <p className="flex items-center gap-2 px-3 py-2 text-body text-gray-500">
              <Spinner density="table" /> 검색 중
            </p>
          )}
          {!showMinHint && !isFetching && results.length === 0 && (
            <p className="px-3 py-2 text-body text-gray-500">검색 결과가 없습니다.</p>
          )}
          {!showMinHint && results.map((r) => (
            <button
              key={`${r.kind}-${r.id}-${r.path}`}
              type="button"
              onClick={() => go(r.path)}
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
              <Badge tone={r.tone}>{r.badge}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
