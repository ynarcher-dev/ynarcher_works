import { Input, TagChip } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  MINUTE_LINK_TARGETS,
  MINUTE_LINK_TARGET_TYPES,
  type MinuteLink,
  type MinuteLinkTargetType,
} from '@/features/office/minutes/minuteLinks'
import { useMinuteLinkSearch } from '@/features/office/minutes/minuteLinkSearch'

interface Props {
  /** 선택된 연동 대상(라벨 포함). */
  value: MinuteLink[]
  onChange: (next: MinuteLink[]) => void
}

/** 대상 키(종류:id) — 중복 방지·표시용. */
const linkKey = (l: { targetType: string; targetId: string }) => `${l.targetType}:${l.targetId}`

/**
 * 회의록 연동 대상 선택기. ① 종류(AC/M&A/PROJECT/STARTUP) 선택 → ② 원장 검색(접근 가능한 것만)
 * → ③ 결과 클릭으로 칩 추가. 아무것도 고르지 않으면 일반 회의록이 된다.
 * 검색은 원장 RLS로 필터되고, 저장 시 set_minute_links RPC가 서버측에서 재검증한다.
 */
export function MinuteLinkPicker({ value, onChange }: Props) {
  const [kind, setKind] = useState<MinuteLinkTargetType>('program')
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')

  // 검색어 디바운스(250ms) — 타자마다 질의하지 않는다.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword), 250)
    return () => clearTimeout(t)
  }, [keyword])

  const { data: candidates, isLoading } = useMinuteLinkSearch(kind, debounced, true)

  const selectedKeys = useMemo(() => new Set(value.map(linkKey)), [value])
  const results = (candidates ?? []).filter((c) => !selectedKeys.has(linkKey(c)))

  const add = (link: MinuteLink) => {
    if (selectedKeys.has(linkKey(link))) return
    onChange([...value, link])
    setKeyword('')
    setDebounced('')
  }
  const remove = (key: string) => onChange(value.filter((l) => linkKey(l) !== key))

  return (
    <div className="space-y-2">
      <p className="text-caption text-gray-500">
        연동 (선택) — 관련 사업·스타트업을 연결하면 상호 참조됩니다. 비워 두면 일반 회의록입니다.
      </p>

      {/* 종류 선택 세그먼트 */}
      <div className="flex overflow-hidden rounded-radius-md border border-gray-300">
        {MINUTE_LINK_TARGET_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setKind(t)
              setKeyword('')
              setDebounced('')
            }}
            className={
              'flex-1 px-3 py-1.5 text-caption transition-colors duration-fast ' +
              (kind === t
                ? 'bg-brand text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50')
            }
          >
            {MINUTE_LINK_TARGETS[t].kindLabel}
          </button>
        ))}
      </div>

      {/* 검색 + 결과 드롭다운 */}
      <div className="relative">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={`${MINUTE_LINK_TARGETS[kind].kindLabel} 검색 후 선택`}
          aria-label="연동 대상 검색"
        />
        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-dropdown mt-1 max-h-56 overflow-auto rounded-radius-md border border-gray-200 bg-white shadow-popover">
            {results.map((c) => (
              <li key={linkKey(c)}>
                <button
                  type="button"
                  onClick={() => add(c)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors duration-fast hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate text-body text-gray-800">{c.label}</span>
                  {c.code && <span className="shrink-0 text-caption text-gray-400">{c.code}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {debounced && !isLoading && results.length === 0 && (
          <p className="mt-1 text-caption text-gray-400">검색 결과가 없습니다.</p>
        )}
      </div>

      {/* 선택된 연동 대상 칩 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => {
            const key = linkKey(l)
            return (
              <TagChip
                key={key}
                selected
                onClick={() => remove(key)}
                title={`${l.label ?? l.targetId} 연동 해제`}
                aria-label={`${l.label ?? l.targetId} 연동 해제`}
              >
                <span className="text-gray-400">{MINUTE_LINK_TARGETS[l.targetType].kindLabel}</span>
                {l.label ?? '(제목 없음)'}
                <span aria-hidden className="leading-none">
                  ×
                </span>
              </TagChip>
            )
          })}
        </div>
      )}
    </div>
  )
}
