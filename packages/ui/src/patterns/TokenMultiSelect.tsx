import { useMemo, useRef, useState } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { controlScale, formBaseClass } from '../densityScale'
import { TagChip } from '../components/TagChip'

/** 밀도별 최소 높이 — 공용 Input의 고정 높이(controlScale.height)와 짝을 맞춘 min-height. */
const minHeightByDensity: Record<Density, string> = {
  page: 'min-h-ctl-page',
  card: 'min-h-ctl-card',
  table: 'min-h-ctl-table',
}

export interface TokenMultiSelectProps<T> {
  /** 선택된 항목. */
  selected: T[]
  onChange: (next: T[]) => void
  /** 항목 고유 키(중복 제외·React key). */
  getKey: (item: T) => string
  /** 칩·후보에 표시할 이름. */
  getLabel: (item: T) => string
  /** 검색 후보 풀(내부에서 질의 필터 + 선택분 제외). 자유입력 전용이면 생략. */
  options?: T[]
  /** 후보 행의 보조 텍스트(예: 이메일). */
  getMeta?: (item: T) => string | undefined
  /** 검색 매칭 대상 텍스트(생략 시 라벨). */
  getSearchText?: (item: T) => string
  /** 자유 입력 허용(Enter로 새 토큰 추가). */
  allowFreeText?: boolean
  /** 자유 입력 문자열 → 항목 변환(allowFreeText면 필수). */
  createOption?: (text: string) => T
  placeholder?: string
  disabled?: boolean
  /** 최대 선택 수. */
  max?: number
  /** 후보 최대 표시 수(기본 8). */
  maxSuggestions?: number
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다(공용 Input과 동일). */
  density?: Density
}

/**
 * 토큰 입력형 다중 선택기(표준 A패턴): 하나의 입력 필드 안에 선택 칩이 인라인으로 남고
 * 그 뒤에서 검색해 추가한다. 칩을 누르면 제거되고, 빈 입력에서 Backspace로 마지막 칩을 지운다.
 * 사람(임직원)·태그·자유 텍스트를 모두 이 컴포넌트 하나로 처리하도록 제네릭이며, 칩은 공용 TagChip을 쓴다.
 * 데이터 로딩은 하지 않는다(후보 풀은 호출부가 주입) — packages/ui 순수성 유지.
 */
export function TokenMultiSelect<T>({
  selected,
  onChange,
  getKey,
  getLabel,
  options,
  getMeta,
  getSearchText,
  allowFreeText = false,
  createOption,
  placeholder,
  disabled = false,
  max,
  maxSuggestions = 8,
  density,
}: TokenMultiSelectProps<T>) {
  const d = useDensity(density)
  const s = controlScale[d]
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const atMax = max != null && selected.length >= max
  const selectedKeys = useMemo(() => new Set(selected.map(getKey)), [selected, getKey])

  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw || !options) return []
    return options
      .filter((o) => !selectedKeys.has(getKey(o)))
      .filter((o) => (getSearchText ? getSearchText(o) : getLabel(o)).toLowerCase().includes(kw))
      .slice(0, maxSuggestions)
  }, [q, options, selectedKeys, getKey, getLabel, getSearchText, maxSuggestions])

  const add = (item: T) => {
    if (atMax || selectedKeys.has(getKey(item))) return
    onChange([...selected, item])
    setQ('')
    inputRef.current?.focus()
  }

  const addFreeText = () => {
    const text = q.trim()
    if (!text || !allowFreeText || !createOption) return
    const item = createOption(text)
    if (selectedKeys.has(getKey(item))) {
      setQ('')
      return
    }
    add(item)
  }

  const remove = (key: string) => onChange(selected.filter((s) => getKey(s) !== key))

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = selected[selected.length - 1]
    if (e.key === 'Backspace' && !q && last) {
      remove(getKey(last))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const first = matches[0]
      if (first) add(first)
      else addFreeText()
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          // 공용 Input과 동일한 외형·상태(테두리·그림자·호버·전환). 높이만 고정 대신 min-height로 두어
          // 칩이 늘면 세로로 자란다.
          formBaseClass,
          'flex flex-wrap items-center gap-1.5 py-1',
          minHeightByDensity[d],
          s.padX,
          // div는 focus-visible가 뜨지 않으므로, Input의 focus-visible 스타일을 focus-within으로 그대로 옮긴다.
          'focus-within:outline-none focus-within:border-brand/50 focus-within:shadow-popover',
          disabled && 'cursor-not-allowed bg-gray-50 opacity-60',
        )}
      >
        {selected.map((item) => {
          const key = getKey(item)
          return (
            <TagChip
              key={key}
              selected
              disabled={disabled}
              onClick={() => remove(key)}
              title={`${getLabel(item)} 제거`}
              aria-label={`${getLabel(item)} 제거`}
            >
              {getLabel(item)}
              <span aria-hidden className="leading-none">
                ×
              </span>
            </TagChip>
          )
        })}
        {!atMax && !disabled && (
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={selected.length > 0 ? '' : placeholder}
            className={cn(
              'min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-gray-900 outline-none placeholder:text-gray-400',
              s.text,
            )}
          />
        )}
      </div>
      {matches.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-dropdown mt-1 max-h-56 overflow-auto rounded-radius-md border border-gray-200 bg-white shadow-popover">
          {matches.map((o) => {
            const meta = getMeta?.(o)
            return (
              <li key={getKey(o)}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => add(o)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors duration-fast hover:bg-gray-50"
                >
                  <span className="text-body text-gray-800">{getLabel(o)}</span>
                  {meta && <span className="text-caption text-gray-400">{meta}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
