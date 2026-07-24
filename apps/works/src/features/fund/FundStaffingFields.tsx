import { useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'

interface Emp {
  id: string
  name: string
}

/** 대표(단일)·운용·관리(다중) 배정 상태. user_id 배열. */
export interface FundStaffing {
  manager: string[]
  operators: string[]
  admins: string[]
}

/** initial Fund.operators/manager → FundStaffing 초기값. */
export function toStaffing(
  managerId: string | null | undefined,
  operators: { user_id: string; role: string; is_lead: boolean }[] | undefined,
): FundStaffing {
  const ops = operators ?? []
  return {
    manager: managerId ? [managerId] : [],
    operators: ops.filter((o) => o.role === 'OPERATION' && !o.is_lead).map((o) => o.user_id),
    admins: ops.filter((o) => o.role === 'ADMIN').map((o) => o.user_id),
  }
}

/**
 * 임직원 검색 typeahead + 선택 칩. single이면 1명만(대표), 아니면 다중(운용·관리).
 */
function MemberPicker({
  employees,
  selected,
  onChange,
  single,
  placeholder,
}: {
  employees: Emp[]
  selected: string[]
  onChange: (next: string[]) => void
  single?: boolean
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees])
  const kw = query.trim().toLowerCase()
  const filtered = employees.filter(
    (e) => !selected.includes(e.id) && (e.name ?? '').toLowerCase().includes(kw),
  )

  const add = (id: string) => {
    onChange(single ? [id] : [...selected, id])
    setQuery('')
    setOpen(false)
  }
  const remove = (id: string) => onChange(selected.filter((x) => x !== id))

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {selected.length === 0 ? (
          <span className="text-body text-gray-500">미지정</span>
        ) : (
          selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-radius-md border border-gray-300 bg-gray-50 px-2 py-0.5 text-body text-gray-800"
            >
              {byId.get(id)?.name ?? '알 수 없음'}
              <button
                type="button"
                aria-label="제거"
                onClick={() => remove(id)}
                className="text-gray-400 transition-colors hover:text-brand"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div className="relative">
        {open && (
          <div className="fixed inset-0 z-dropdown" aria-hidden onClick={() => setOpen(false)} />
        )}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="relative z-dropdown min-h-ctl-page w-full rounded-radius-md border border-gray-300 bg-white px-3 py-1.5 text-body text-gray-900 outline-none transition-colors duration-fast placeholder:text-gray-400 focus:border-brand"
        />
        {open && (
          <div className="absolute left-0 right-0 z-dropdown mt-1 max-h-56 overflow-auto rounded-radius-lg border border-gray-300 bg-white p-1 shadow-popover">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-caption text-gray-500">
                {employees.length === 0 ? '불러오는 중…' : '검색 결과가 없습니다.'}
              </div>
            ) : (
              filtered.slice(0, 30).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => add(e.id)}
                  className="block w-full rounded-radius-md px-3 py-1.5 text-left text-body text-gray-800 transition-colors duration-fast hover:bg-gray-50"
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-body font-medium text-gray-800">{label}</p>
      {children}
    </div>
  )
}

/**
 * 펀드 인력 배정 필드(컨트롤드): 대표펀드매니저(단일)·운용인력·관리인력(각 다중).
 * 한 사람이 운용·관리에 동시에 들어가지 않도록 한쪽 추가 시 다른 쪽에서 뺀다.
 */
export function FundStaffingFields({
  value,
  onChange,
}: {
  value: FundStaffing
  onChange: (next: FundStaffing) => void
}) {
  const { data: employees } = useEmployees()
  const list = (employees ?? []) as Emp[]

  const setOps = (next: string[]) =>
    onChange({ ...value, operators: next, admins: value.admins.filter((id) => !next.includes(id)) })
  const setAdm = (next: string[]) =>
    onChange({ ...value, admins: next, operators: value.operators.filter((id) => !next.includes(id)) })

  return (
    <div className="space-y-4">
      <Field label="대표펀드매니저">
        <MemberPicker
          employees={list}
          selected={value.manager}
          onChange={(manager) => onChange({ ...value, manager })}
          single
          placeholder="임직원 검색 후 대표 지정(1명)"
        />
      </Field>
      <Field label="운용인력">
        <MemberPicker employees={list} selected={value.operators} onChange={setOps} placeholder="임직원 검색 후 추가" />
      </Field>
      <Field label="관리인력">
        <MemberPicker employees={list} selected={value.admins} onChange={setAdm} placeholder="임직원 검색 후 추가" />
      </Field>
    </div>
  )
}
