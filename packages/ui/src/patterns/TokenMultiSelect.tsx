import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { controlScale, formBaseClass, iconScale } from '../densityScale'
import { TagChip } from '../components/TagChip'
import { TokenBrowseModal } from './TokenBrowseModal'

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
  /**
   * 입력 질의 변화 통지(비동기 후보 조회용). 호출부가 이 질의로 `options`를 갱신하면
   * 필드 안에서 원격 검색 드롭다운이 뜬다. 순수성 유지를 위해 컴포넌트는 로딩을 하지 않는다.
   */
  onQueryChange?: (q: string) => void
  /**
   * 매칭 후보가 없을 때 드롭다운에 노출할 안내 행의 라벨을 반환한다(생략 시 미노출).
   * 검색해도 없을 때의 다음 행동을 유도하는 용도다.
   */
  freeTextHint?: (q: string) => string
  /**
   * 후보 없음 안내 행/Enter의 동작을 커스터마이즈한다(예: 등록 모달 열기). 지정하면 자유 입력 대신
   * 이 콜백을 호출한다 — 문자열을 그대로 토큰으로 넣지 않고 다른 경로로 등록을 유도할 때 쓴다.
   */
  onFreeTextSelect?: (q: string) => void
  placeholder?: string
  disabled?: boolean
  /** 최대 선택 수. */
  max?: number
  /** 후보 최대 표시 수(기본 8). */
  maxSuggestions?: number
  /**
   * 필드 오른쪽에 돋보기 버튼을 달아 검색어 없이도 후보 전체를 펼쳐 고를 수 있게 한다.
   *
   * 후보가 원장에서 오는 경우(태그 등) 사용자는 무엇이 있는지 모르는 채로 빈 칸을 마주한다 —
   * 검색은 이미 아는 것을 빨리 찾는 수단이지 목록을 알려주는 수단이 아니다. 원격 조회형
   * (`onQueryChange`로 후보를 채우는) 필드에는 켜지 말 것 — 펼칠 전체 목록이 애초에 없다.
   *
   * 같은 이유로 **입력 칸에 초점이 가면 검색어 없이도 후보가 내려온다**. 후보 전부가 이미 손에
   * 있다고 선언한 칸이므로, 고르려고 칸을 눌렀는데 아무것도 나오지 않아 무엇을 쳐야 하는지부터
   * 알아내야 하는 상태를 만들지 않는다. 이 자동 열림은 돋보기를 모달로 두어도 드롭다운으로 선다
   * — 그때 하려는 일은 훑어보기가 아니라 하나 집어넣기다.
   */
  browsable?: boolean
  /**
   * 돋보기로 펼친 전체 목록이 어디에 서는지(`browsable`일 때만 뜻이 있다).
   *
   * 기본 `dropdown`은 필드 아래 목록을 그대로 늘린다 — 후보가 몇 줄이면 그편이 가볍다.
   * `modal`은 목록을 통째로 펴 훑어보게 한다. 가르는 축은 개수가 아니라 **무엇을 하러 여는가**다
   * — 하나를 집으러 열면 드롭다운, 무엇이 있는지 보러 열면 모달이다(좁은 스크롤 상자에 담긴
   * '전체 목록'은 전체를 보여준다는 말이 무색해진다).
   */
  browseIn?: 'dropdown' | 'modal'
  /** 전체 목록 모달의 제목(`browseIn="modal"`일 때). 생략하면 '전체 목록'. */
  browseTitle?: string
  /** 전체 목록 모달에서 후보가 하나도 없을 때의 안내 — 어디서 만드는지까지 적는다. */
  browseEmptyText?: string
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다(공용 Input과 동일). */
  density?: Density
}

/**
 * 돋보기 글리프. packages/ui는 아이콘 패키지에 의존하지 않는 것이 규약이라(IconButton은 앱이
 * 주입) 여기서는 lucide `search`와 같은 형태를 인라인 SVG로 그린다.
 */
function SearchGlyph({ size }: { size: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
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
  onQueryChange,
  freeTextHint,
  onFreeTextSelect,
  placeholder,
  disabled = false,
  max,
  maxSuggestions = 8,
  browsable = false,
  browseIn = 'dropdown',
  browseTitle,
  browseEmptyText,
  density,
}: TokenMultiSelectProps<T>) {
  const d = useDensity(density)
  const s = controlScale[d]
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // 후보 드롭다운은 포털(document.body)에 fixed 로 그려 모달 스크롤 컨테이너에 잘리지 않게 한다.
  const fieldRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // 돋보기로 연 '전체 보기' 상태. 검색 결과와 달리 스스로 닫히지 않으므로 별도 상태로 둔다.
  const [browsing, setBrowsing] = useState(false)
  // 입력에 초점이 있는 동안은 검색어가 없어도 후보를 내린다(`browsable`인 칸만).
  const [focused, setFocused] = useState(false)
  // Esc로 목록만 닫은 상태. 초점은 그대로 두므로(칸을 떠나게 만들지 않는다) 별도 플래그가 필요하다.
  const [dismissed, setDismissed] = useState(false)

  // 질의를 바꿀 때마다 호출부에 통지한다(비동기 후보 조회를 걸 수 있게).
  const changeQuery = (next: string) => {
    setQ(next)
    setDismissed(false)
    onQueryChange?.(next)
  }

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

  // 검색어 없이 내려오는 목록 — 초점이 들어왔거나(browsable) 돋보기로 펼쳤을 때다.
  // 검색 결과와 달리 개수를 자르지 않고 드롭다운 안에서 스크롤시킨다.
  // 모달이 열려 있는 동안은 초점이 뒤 입력에 남아 있어도 목록을 내리지 않는다 — 같은 목록이
  // 모달 뒤에서 한 번 더 서면 어느 쪽을 고르는 중인지가 흐려진다.
  const modalOpen = browsable && browseIn === 'modal' && browsing
  const openedWithoutQuery =
    browsable && !modalOpen && !dismissed && (focused || (browseIn === 'dropdown' && browsing))
  const browseList = useMemo(() => {
    if (!openedWithoutQuery || q.trim() || !options) return []
    return options.filter((o) => !selectedKeys.has(getKey(o)))
  }, [openedWithoutQuery, q, options, selectedKeys, getKey])

  // 드롭다운에 그릴 행. 검색어가 있으면 언제나 검색 결과가 이긴다(돋보기로 펼쳐 둔 상태여도).
  const rows = q.trim() ? matches : browseList

  const add = (item: T) => {
    if (atMax || selectedKeys.has(getKey(item))) return
    const next = [...selected, item]
    onChange(next)
    changeQuery('')
    // 상한에 닿으면 입력 칸이 사라지므로 펼쳐 둔 목록도 함께 닫는다. 모달은 닫지 않는다 —
    // 거기서는 마지막 하나를 고른 뒤 다른 것과 바꾸는 것(빼고 다시 고르기)이 자연스러운 다음 동작이다.
    if (browseIn === 'dropdown' && max != null && next.length >= max) setBrowsing(false)
    inputRef.current?.focus()
  }

  const addFreeText = () => {
    const text = q.trim()
    if (!text || !allowFreeText || !createOption) return
    const item = createOption(text)
    if (selectedKeys.has(getKey(item))) {
      changeQuery('')
      return
    }
    add(item)
  }

  // 매칭 후보가 없을 때 드롭다운에 안내 행을 띄운다. 행/Enter 동작은 onFreeTextSelect가 있으면
  // 그쪽으로(등록 모달 열기 등), 없고 allowFreeText면 입력값을 그대로 토큰으로 추가한다.
  const showFreeTextRow = Boolean(freeTextHint) && q.trim() !== '' && matches.length === 0
  const runFreeTextAction = () => {
    const text = q.trim()
    if (!text) return
    if (onFreeTextSelect) onFreeTextSelect(text)
    else addFreeText()
  }

  const remove = (key: string) => onChange(selected.filter((s) => getKey(s) !== key))
  // 전체 목록에서는 같은 칩이 켜기와 끄기를 겸한다 — 고른 것도 함께 보이기 때문이다.
  const toggle = (item: T) =>
    selectedKeys.has(getKey(item)) ? remove(getKey(item)) : add(item)
  const browseLabel = browseTitle ?? '전체 태그 보기'

  const dropdownOpen = rows.length > 0 || showFreeTextRow
  const reposition = useCallback(() => {
    if (fieldRef.current) setRect(fieldRef.current.getBoundingClientRect())
  }, [])
  // 열려 있는 동안 스크롤·리사이즈를 따라 위치를 다시 잡는다(capture=true 로 모달 내부 스크롤도 포착).
  useEffect(() => {
    if (!dropdownOpen) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [dropdownOpen, reposition])

  // 펼친 목록은 스스로 닫히지 않으므로 바깥 클릭으로 닫는다. 드롭다운은 포털이라 필드의
  // DOM 하위가 아니어서, 두 영역을 각각 확인해야 한다.
  useEffect(() => {
    // 모달은 자기 딤이 바깥 클릭을 받는다. 여기서 함께 듣게 두면 모달 안을 누르는 것이
    // '바깥 클릭'으로 잡혀 열자마자 닫힌다(모달은 필드의 DOM 하위가 아니다).
    if (browseIn === 'modal' || !browsing) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (fieldRef.current?.contains(t) || listRef.current?.contains(t)) return
      setBrowsing(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [browseIn, browsing])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = selected[selected.length - 1]
    if (e.key === 'Escape') {
      // 목록만 닫고 초점은 남긴다 — Esc는 '그만 보겠다'이지 '이 칸을 떠나겠다'가 아니다.
      setBrowsing(false)
      setDismissed(true)
      return
    }
    if (e.key === 'Backspace' && !q && last) {
      remove(getKey(last))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const first = matches[0]
      if (first) add(first)
      else runFreeTextAction()
    }
  }

  return (
    <div className="relative">
      <div
        ref={fieldRef}
        onClick={() => {
          // 이미 초점이 있는 칸을 다시 누르는 것은 '닫아 둔 목록을 다시 보겠다'는 뜻이다
          // (그때는 focus 이벤트가 오지 않으므로 여기서 되살린다).
          setDismissed(false)
          inputRef.current?.focus()
        }}
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
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true)
              setDismissed(false)
            }}
            // 칩·후보 행·돋보기는 mousedown을 막아 초점을 지키므로, 여기 오는 blur는 정말로
            // 칸을 떠난 것이다.
            onBlur={() => setFocused(false)}
            placeholder={selected.length > 0 ? '' : placeholder}
            className={cn(
              'min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-gray-900 outline-none placeholder:text-gray-400',
              s.text,
            )}
          />
        )}
        {/* 상한에 닿으면 드롭다운형은 펼칠 것이 없어 버튼을 거두지만, 모달형은 남긴다 —
            거기서는 고른 것도 함께 보여 '빼고 다른 것으로 바꾸기'가 그 버튼의 일이다. */}
        {browsable && !disabled && (browseIn === 'modal' || !atMax) && (
          // 검색어 없이 후보 전체를 펼치는 버튼. 필드 안 오른쪽 끝에 두어 '이 칸의 목록'임을 드러낸다.
          <button
            type="button"
            // 입력에서 포커스가 빠져나가지 않도록 mousedown을 막는다(칩·드롭다운과 같은 규약).
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={(ev) => {
              // 필드 래퍼의 onClick(초점 되살리기)까지 함께 타면 모달을 열자마자 뒤 목록이 선다.
              ev.stopPropagation()
              changeQuery('')
              setBrowsing((v) => !v)
              // 모달을 열 때는 뒤 입력으로 초점을 되돌리지 않는다 — 초점은 열린 창에 있어야 한다.
              if (browseIn === 'dropdown') inputRef.current?.focus()
            }}
            aria-label={browseLabel}
            aria-expanded={browseIn === 'dropdown' ? browsing : undefined}
            aria-haspopup={browseIn === 'modal' ? 'dialog' : undefined}
            title={browseLabel}
            className={cn(
              'ml-auto grid shrink-0 place-items-center rounded-radius-md transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
              iconScale[d].box,
              browsing ? 'text-brand' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            <SearchGlyph size={iconScale[d].glyph} />
          </button>
        )}
      </div>
      {dropdownOpen &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            // fixed 로 뷰포트 기준 배치 → 모달 overflow 에 잘리지 않는다. 위치만 인라인이고
            // 층은 z 토큰이 답한다(모달 위 포털 팝오버 = z-popover, 8_z_index §3.1).
            style={{
              position: 'fixed',
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
            }}
            className="z-popover max-h-56 overflow-auto rounded-radius-md border border-gray-200 bg-white shadow-popover"
          >
          {rows.map((o) => {
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
          {showFreeTextRow && (
            // 후보가 없을 때 다음 행동을 유도하는 안내 행.
            <li>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={runFreeTextAction}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-fast hover:bg-gray-50"
              >
                <span className="text-body text-brand">{freeTextHint!(q.trim())}</span>
              </button>
            </li>
          )}
          </ul>,
          document.body,
        )}
      {browsable && browseIn === 'modal' && (
        <TokenBrowseModal<T>
          open={browsing}
          onClose={() => setBrowsing(false)}
          title={browseLabel}
          options={options ?? []}
          selected={selected}
          getKey={getKey}
          getLabel={getLabel}
          onToggle={toggle}
          max={max}
          emptyText={browseEmptyText}
        />
      )}
    </div>
  )
}
