import { TagChip } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import type { EventCompanion } from '@/features/hub/hooks'

/**
 * 업무 일정 동행자(내부 임직원) 선택기. 하나의 입력 필드 안에 선택된 사람이 칩으로 인라인으로
 * 남고, 그 뒤에서 이름을 검색해 추가한다. 검색어가 있을 때만 후보 드롭다운이 뜬다.
 * 칩을 누르면 제거되고, 입력이 빈 상태에서 Backspace를 누르면 마지막 칩이 지워진다.
 */
export function CompanionPicker({
  selected,
  onChange,
}: {
  selected: EventCompanion[]
  onChange: (next: EventCompanion[]) => void
}) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: employees } = useEmployees()

  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [selected])
  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return []
    return (employees ?? [])
      .filter((e) => !selectedIds.has(e.id))
      .filter(
        (e) =>
          e.name.toLowerCase().includes(kw) ||
          (e.email ?? '').toLowerCase().includes(kw),
      )
      .slice(0, 6)
  }, [employees, q, selectedIds])

  const add = (c: EventCompanion) => {
    onChange([...selected, c])
    setQ('')
    inputRef.current?.focus()
  }
  const remove = (id: string) => onChange(selected.filter((c) => c.id !== id))

  return (
    // relative 앵커 — 후보 목록을 절대 위치로 띄워 아래 내용 필드 위로 겹치게 한다(레이아웃을 밀지 않음).
    <div className="relative">
      {/* 토큰 입력: 선택 칩 + 검색 입력이 한 필드 안에 인라인으로 놓인다. */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-radius-md border border-gray-300 bg-white px-2 py-1.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10"
      >
        {selected.map((c) => (
          <TagChip
            key={c.id}
            selected
            onClick={() => remove(c.id)}
            title={`${c.name} 제거`}
            aria-label={`${c.name} 제거`}
          >
            {c.name}
            <X aria-hidden className="h-3 w-3" />
          </TagChip>
        ))}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            const last = selected[selected.length - 1]
            if (e.key === 'Backspace' && !q && last) remove(last.id)
          }}
          placeholder={selected.length > 0 ? '' : '동행자 이름 검색'}
          className="min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-body text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>
      {matches.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-40 overflow-auto rounded-radius-md border border-gray-200 bg-white shadow-lg">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => add({ id: e.id, name: e.name })}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-50"
              >
                <span className="text-body text-gray-800">{e.name}</span>
                {e.email && <span className="text-caption text-gray-400">{e.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
