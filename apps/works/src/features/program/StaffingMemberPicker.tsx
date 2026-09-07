import { Input } from '@ynarcher/ui'
import { useState } from 'react'
import type { StaffingPlacement } from '@/features/program/staffingPlacement'

/**
 * 한 부서 몫의 담당자 추가 typeahead.
 *
 * 검색 범위가 **그 부서에 배치된 인력**으로 좁혀져 있다는 것이 요점이다(2026-09-06). 종전에는
 * 담당자 칸이 부서 목록 밖에 하나뿐이라 지정 부서 전체에서 고른 뒤, 그 사람이 어느 부서로
 * 잡혔는지는 추가하고 나서야 표의 '부서' 열로 알 수 있었다. 부서 안에서 고르면 고르는 순간
 * 이미 어느 부서에 얹히는지가 정해져 있어 되읽을 것이 없다.
 */
export function StaffingMemberPicker({
  deptId,
  placement,
  taken,
  onPick,
}: {
  /** 이 칸이 속한 부서. 비어 있으면(부서 미선택) 고를 것이 없다. */
  deptId: string
  placement: StaffingPlacement
  /** 이미 이 부서에 올라 있는 사람 — 목록에서 빼지 않고 표기만 눌러 둔다(구간 추가가 정상이다). */
  taken: Set<string>
  onPick: (userId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const candidates = placement.candidatesFor(deptId)
  const filtered = candidates.filter((e) =>
    (e.name ?? '').toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="relative">
      {open && (
        <div className="fixed inset-0 z-dropdown" aria-hidden onClick={() => setOpen(false)} />
      )}
      {/* 규격은 공용 Input이 갖는다 — 손으로 적어 두면 이 칸만 위 구간 행과 다른 높이·글자로 남는다. */}
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        aria-label="담당자 검색"
        placeholder={deptId ? '이 부서의 담당자 검색 후 추가' : '부서를 먼저 고르세요'}
        disabled={!deptId}
        className="relative z-dropdown"
      />
      {open && deptId && (
        <div className="absolute left-0 right-0 z-dropdown mt-1 max-h-56 overflow-auto rounded-radius-md border border-gray-300 bg-white p-1 shadow-popover">
          {filtered.length === 0 ? (
            // 왜 비었는지를 구분해 적는다 — 후보를 이 부서로 좁혔기 때문에, 아무 안내가 없으면
            // 사람이 없는 것인지 검색이 안 맞은 것인지 알 수 없다.
            <div className="px-3 py-2 text-body-sm text-gray-500">
              {!placement.ready
                ? '불러오는 중…'
                : candidates.length === 0
                  ? '이 부서에 배치된 인력이 없습니다.'
                  : '검색 결과가 없습니다.'}
            </div>
          ) : (
            // 동명이인·같은 성씨가 섞이는 목록이라 이름만으로는 누구인지 못 고른다. 소속은 이름과
            // 같은 크기로 두고 색으로만 눌러 한 줄 안에서 위계를 만든다. 적는 소속은 이 단계
            // 조직도상 본인 부서다(사업 지정 부서로 접기 전의 실제 배치).
            filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onPick(e.id)
                  setQuery('')
                }}
                className="flex w-full items-center justify-between gap-3 rounded-radius-md px-3 py-1.5 text-left text-body-sm transition-colors duration-fast hover:bg-gray-50"
              >
                <span className="truncate text-gray-800">
                  {e.name}
                  {taken.has(e.id) && <span className="ml-1 text-gray-500">(구간 추가)</span>}
                </span>
                <span
                  className="min-w-0 max-w-[60%] shrink-0 truncate text-gray-500"
                  title={placement.placementPathOf(e.id)}
                >
                  {placement.placementLabelOf(e.id)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
