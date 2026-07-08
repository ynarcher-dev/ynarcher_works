import { Avatar, Button, Checkbox, Input, Modal } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import type { Employee } from '@/features/management/panels/departmentsMock'

interface DeptMemberModalProps {
  open: boolean
  onClose: () => void
  deptId: string
  deptName: string
  employees: Employee[]
  deptNames: Map<string, string>
  /** 임직원을 특정 부서로 배치(또는 null=배치 해제). 인사/부서 양쪽이 같은 관계를 편집한다. */
  onAssign: (employeeId: string, deptId: string | null) => void
}

/**
 * 인력 배치 — 인사관리 리스트를 그대로 가져와 이 부서로 배치/해제한다.
 * 임직원은 단일 소속이므로 다른 부서 소속을 체크하면 이 부서로 이동(재발령)한다.
 */
export function DeptMemberModal({
  open,
  onClose,
  deptId,
  deptName,
  employees,
  deptNames,
  onAssign,
}: DeptMemberModalProps) {
  const [keyword, setKeyword] = useState('')

  const assignedCount = employees.filter((e) => e.deptId === deptId).length
  const filtered = useMemo(() => {
    const q = keyword.trim()
    return q ? employees.filter((e) => e.name.includes(q)) : employees
  }, [employees, keyword])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`${deptName} · 인력 배치`}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-caption text-gray-500">
            이 부서 소속 <span className="font-semibold text-gray-800">{assignedCount}명</span>
          </p>
          <Input
            placeholder="임직원 이름 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-8 max-w-48"
          />
        </div>

        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-radius-md border border-gray-200">
          {filtered.map((e) => {
            const here = e.deptId === deptId
            const currentDept = e.deptId ? deptNames.get(e.deptId) : null
            return (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  checked={here}
                  onChange={() => onAssign(e.id, here ? null : deptId)}
                />
                <Avatar name={e.name} size="sm" />
                <span className="text-body text-gray-800">{e.name}</span>
                <span className="ml-auto text-caption text-gray-400">
                  {here ? '이 부서' : currentDept ? `현재: ${currentDept}` : '미배치'}
                </span>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-caption text-gray-400">
              검색 결과가 없습니다.
            </li>
          )}
        </ul>
        <p className="text-caption text-gray-400">
          · 다른 부서 소속을 체크하면 이 부서로 이동(재발령)합니다. 임직원은 한 부서에만 소속됩니다.
        </p>
      </div>
    </Modal>
  )
}
