import { Avatar, Checkbox, Input, Tooltip, tooltipScale } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import type { OrgEditing } from '@/features/management/orgEditHooks'

interface DeptMemberPickerProps {
  editing: OrgEditing
  /** 배치 대상 부서(좌측 트리에서 고른 조직). */
  deptId: string
}

/**
 * 인력 배치 — 임직원 목록을 그대로 펴 놓고 체크로 이 부서에 넣고 뺀다.
 *
 * 임직원은 한 부서에만 속하므로 체크는 "추가"가 아니라 "이동(재발령)"이다. 그래서 다른 부서
 * 소속인 사람도 목록에서 감추지 않고 현재 소속을 옆에 적는다 — 감추면 "그 사람이 왜 없지"를
 * 확인하러 다른 화면을 열게 되고, 옮겨도 되는 사람인지 여기서 판단할 수 없다.
 */
export function DeptMemberPicker({ editing, deptId }: DeptMemberPickerProps) {
  const [keyword, setKeyword] = useState('')

  const assigned = editing.employees.filter((e) => e.deptId === deptId)
  const filtered = useMemo(() => {
    const q = keyword.trim()
    return q ? editing.employees.filter((e) => e.name.includes(q)) : editing.employees
  }, [editing.employees, keyword])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center text-caption text-gray-600">
          이 조직 소속 <span className="font-semibold text-gray-800">{assigned.length}명</span>
          <Tooltip
            label="소속 인력"
            content="체크로 배치하고, 해제로 미배치로 되돌립니다."
            className={tooltipScale.gap}
          />
        </p>
        <Input
          placeholder="임직원 이름 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="h-ctl-card max-w-56"
        />
      </div>

      <ul className="divide-y divide-gray-100 rounded-radius-md border border-gray-200">
        {filtered.map((e) => {
          const here = e.deptId === deptId
          // 소속은 최상위까지의 전체 경로로 적는다 — 같은 이름의 팀이 여러 본부에 있어
          // '3팀'만으로는 어디 소속인지 갈리지 않는다.
          const currentPath = e.deptId ? editing.pathOf(e.deptId) : ''
          return (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox checked={here} onChange={() => editing.assign(e.id, here ? null : deptId)} />
              <Avatar name={e.name} density="table" />
              <span className="shrink-0 text-body text-gray-800">{e.name}</span>
              <span
                className="ml-auto truncate text-caption text-gray-600"
                title={currentPath || undefined}
              >
                {here ? '이 조직' : currentPath ? `현재: ${currentPath}` : '미배치'}
              </span>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-caption text-gray-500">검색 결과가 없습니다.</li>
        )}
      </ul>
    </div>
  )
}
