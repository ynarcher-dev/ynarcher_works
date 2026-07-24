import { useMemo } from 'react'
import { TokenMultiSelect } from '@ynarcher/ui'
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
 * 임직원 검색 typeahead + 선택 칩(공용 TokenMultiSelect 사용 — 칩이 입력 필드 안에 인라인으로 남는다).
 * 상위는 user_id 배열만 다루므로, 여기서 id↔Emp 객체를 오가며 변환한다.
 * single이면 max 1(대표): 새로 고르면 마지막 선택으로 대체된다.
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
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees])
  const asEmp = (id: string): Emp => byId.get(id) ?? { id, name: '알 수 없음' }

  return (
    <TokenMultiSelect<Emp>
      selected={selected.map(asEmp)}
      onChange={(next) => onChange(single ? next.slice(-1).map((e) => e.id) : next.map((e) => e.id))}
      options={employees}
      getKey={(e) => e.id}
      getLabel={(e) => e.name ?? '(이름 없음)'}
      getSearchText={(e) => e.name ?? ''}
      max={single ? 1 : undefined}
      placeholder={placeholder}
    />
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
