import { TextArea, cn } from '@ynarcher/ui'
import { useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { useEmployees } from '@/features/management/hooks'

/** 태그 후보(임직원 최소 표시 정보). */
interface MentionCandidate {
  id: string
  name: string
  email: string | null
}

/** 캐럿 직전의 `@질의`를 찾는다. 없으면 null(팝업 닫힘). */
function findQuery(value: string, caret: number): { start: number; text: string } | null {
  const upto = value.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at < 0) return null
  // '@'는 문자열 시작이거나 공백 뒤에 와야 멘션 트리거로 본다(이메일 등 오탐 방지).
  if (at > 0 && !/\s/.test(value.charAt(at - 1))) return null
  const text = upto.slice(at + 1)
  // 멘션 토큰은 공백 없는 한 덩어리 — 공백이 끼면 질의 아님.
  if (/\s/.test(text)) return null
  return { start: at, text }
}

/**
 * @멘션 자동완성이 붙은 코멘트 입력창. 내부 임직원(useEmployees)을 후보로 띄우고,
 * 고른 사람은 본문에 `@이름 `으로 삽입한다. onChange로 (본문, 멘션 user id[])를 함께 올린다.
 * 멘션 id는 "지금 본문에 `@이름`이 남아 있는" 사람만 산출하므로, 텍스트를 지우면 태그도 풀린다.
 */
export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  rows = 2,
}: {
  value: string
  /** 본문과, 현재 본문에 살아있는 멘션 대상 user id 배열을 함께 올린다. */
  onChange: (value: string, mentionedUserIds: string[]) => void
  /** 팝업이 닫힌 상태에서 Enter를 눌렀을 때(코멘트 등록). */
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // 이 입력창에서 한 번이라도 고른 사람(이름→id). 본문 잔존 여부로 실제 멘션을 판정한다.
  const pickedRef = useRef<Map<string, string>>(new Map())
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null)
  const [active, setActive] = useState(0)

  const meId = useAuthStore((s) => s.user?.id)
  const { data: employees } = useEmployees()

  /** 본문에 `@이름`이 남아 있는 사람의 id만 추린다(중복 제거). */
  const resolveIds = (text: string): string[] => {
    const ids: string[] = []
    for (const [name, id] of pickedRef.current) {
      if (text.includes(`@${name}`) && !ids.includes(id)) ids.push(id)
    }
    return ids
  }

  const candidates = useMemo<MentionCandidate[]>(() => {
    if (!query || !employees) return []
    const q = query.text.toLowerCase()
    return employees
      // 본인도 태그 가능(자기 코멘트에 스스로 알림 = 메모/북마크 용도).
      .filter((e) => q === '' || e.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((e) => ({ id: e.id, name: e.name, email: e.email }))
  }, [query, employees])

  const open = query != null && candidates.length > 0

  const refreshQuery = (text: string, caret: number) => {
    setQuery(findQuery(text, caret))
    setActive(0)
  }

  const emit = (text: string) => onChange(text, resolveIds(text))

  const pick = (c: MentionCandidate) => {
    const el = ref.current
    if (!el || !query) return
    pickedRef.current.set(c.name, c.id)
    const caret = el.selectionStart
    const before = value.slice(0, query.start)
    const after = value.slice(caret)
    const inserted = `@${c.name} `
    const next = before + inserted + after
    emit(next)
    setQuery(null)
    // 삽입 지점 뒤로 캐럿 이동(다음 렌더 이후 DOM 반영).
    const pos = before.length + inserted.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative">
      <TextArea
        ref={ref}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          emit(e.target.value)
          refreshQuery(e.target.value, e.target.selectionStart)
        }}
        onKeyUp={(e) => {
          // 캐럿만 옮기는 키는 질의 위치를 다시 계산(텍스트 변경은 onChange가 처리).
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            refreshQuery(value, e.currentTarget.selectionStart)
          }
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (i + 1) % candidates.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (i - 1 + candidates.length) % candidates.length)
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              // 팝업이 열려 있으면 Enter는 "후보 선택"이지 등록이 아니다.
              e.preventDefault()
              const chosen = candidates[active]
              if (chosen) pick(chosen)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setQuery(null)
            }
            return
          }
          // 팝업이 닫혀 있을 때만 Enter로 등록(IME 조합 중 제외).
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      {open && (
        <ul
          className={cn(
            'absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto',
            'rounded-radius-md border border-gray-200 bg-white py-1 shadow-lg',
          )}
        >
          {candidates.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                // onMouseDown: textarea blur보다 먼저 실행돼 캐럿·포커스를 잃지 않는다.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(c)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                  i === active ? 'bg-brand/10' : 'hover:bg-gray-50',
                )}
              >
                <span className="text-body font-medium text-gray-900">{c.name}</span>
                {c.id === meId && <span className="text-caption text-brand">(나)</span>}
                {c.email && <span className="text-caption text-gray-400">{c.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
