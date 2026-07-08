import { Button, Modal } from '@ynarcher/ui'
import {
  resolveByLevel,
  type DeptNode,
  type Employee,
  type OrgLevel,
} from '@/features/management/panels/departmentsMock'

interface HrReflectPreviewProps {
  open: boolean
  onClose: () => void
  levels: OrgLevel[]
  nodes: DeptNode[]
  employees: Employee[]
}

/**
 * 인사관리 반영 미리보기 — 조직관리에서 정한 레벨이 인사관리 컬럼으로 어떻게 파생되는지 보여준다.
 * 각 임직원의 소속 부서를 조상 경로로 펼쳐 레벨별 소속명을 채운다(회사/본부/팀/파트 + 직책·직급은 별도 필드).
 */
export function HrReflectPreview({ open, onClose, levels, nodes, employees }: HrReflectPreviewProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="인사관리 반영 미리보기"
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-2">
        <p className="text-caption text-gray-500">
          조직 레벨 정의가 그대로 인사관리 컬럼이 됩니다. 레벨을 추가/이름변경하면 아래 컬럼도 바뀝니다.
        </p>
        <div className="max-h-96 overflow-auto rounded-radius-md border border-gray-200">
          <table className="w-full border-collapse text-caption">
            <thead className="sticky top-0 bg-gray-50 text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">이름</th>
                {levels.map((lv) => (
                  <th
                    key={lv.id}
                    className="whitespace-nowrap px-3 py-2 text-left font-semibold text-info"
                  >
                    {lv.name}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-gray-300">
                  직책·직급 …
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const path = resolveByLevel(nodes, levels, e.deptId)
                return (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-800">{e.name}</td>
                    {levels.map((lv) => (
                      <td key={lv.id} className="whitespace-nowrap px-3 py-1.5 text-gray-600">
                        {path[lv.id] === '-' ? <span className="text-gray-300">-</span> : path[lv.id]}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-gray-300">-</td>
                  </tr>
                )
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={levels.length + 2} className="px-3 py-6 text-center text-gray-400">
                    임직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
