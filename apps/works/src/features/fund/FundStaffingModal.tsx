import { Button, Modal, useToast } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { useSetFundStaffing } from '@/features/fund/hooks'

interface Emp {
  id: string
  name: string
}

/**
 * 임직원 검색 typeahead + 선택 칩. single이면 1명만(대표), 아니면 다중(운용·관리).
 * ProgramManagerEditor의 검색 패턴을 펀드 인력 배정용으로 단순화했다.
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

interface Props {
  open: boolean
  onClose: () => void
  fundId: string
  initialManagerId: string | null
  initialOperators: string[]
  initialAdmins: string[]
}

/** 펀드 인력 배정 모달: 대표펀드매니저(단일) · 운용인력 · 관리인력(각 다중). */
export function FundStaffingModal({
  open,
  onClose,
  fundId,
  initialManagerId,
  initialOperators,
  initialAdmins,
}: Props) {
  const toast = useToast()
  const { data: employees } = useEmployees()
  const save = useSetFundStaffing()
  const [manager, setManager] = useState<string[]>([])
  const [operators, setOperators] = useState<string[]>([])
  const [admins, setAdmins] = useState<string[]>([])

  // 모달을 열 때마다 현재 배정으로 초기화한다.
  useEffect(() => {
    if (open) {
      setManager(initialManagerId ? [initialManagerId] : [])
      setOperators(initialOperators)
      setAdmins(initialAdmins)
    }
  }, [open, initialManagerId, initialOperators, initialAdmins])

  const list = (employees ?? []) as Emp[]

  // 한 사람이 운용·관리에 동시에 들어가지 않도록, 한쪽에 추가되면 다른 쪽에서 뺀다.
  const setOps = (next: string[]) => {
    setOperators(next)
    setAdmins((a) => a.filter((id) => !next.includes(id)))
  }
  const setAdm = (next: string[]) => {
    setAdmins(next)
    setOperators((o) => o.filter((id) => !next.includes(id)))
  }

  const onSubmit = async () => {
    try {
      await save.mutateAsync({
        fundId,
        managerId: manager[0] ?? null,
        operators,
        admins,
      })
      toast.show('인력을 배정했습니다.', 'success')
      onClose()
    } catch {
      toast.show('배정에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="인력 배정"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={save.isPending}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="대표펀드매니저">
          <MemberPicker
            employees={list}
            selected={manager}
            onChange={setManager}
            single
            placeholder="임직원 검색 후 대표 지정(1명)"
          />
        </Field>
        <Field label="운용인력">
          <MemberPicker
            employees={list}
            selected={operators}
            onChange={setOps}
            placeholder="임직원 검색 후 추가"
          />
        </Field>
        <Field label="관리인력">
          <MemberPicker
            employees={list}
            selected={admins}
            onChange={setAdm}
            placeholder="임직원 검색 후 추가"
          />
        </Field>
      </div>
    </Modal>
  )
}
