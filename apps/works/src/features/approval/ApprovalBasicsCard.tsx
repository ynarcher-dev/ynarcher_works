import { Card, Select } from '@ynarcher/ui'
import { ApprovalInfoTable } from '@/features/approval/ApprovalInfoTable'
import { approvalHeaderPairs } from '@/features/approval/approvalHeader'
import type { ApprovalForm } from '@/features/approval/approvalApi'

interface Props {
  /** 분류 → 그 분류의 양식들(살아 있는 양식에서 파생한 목록). */
  groups: { category: string; forms: ApprovalForm[] }[]
  categoryForms: ApprovalForm[]
  category: string
  onCategoryChange: (next: string) => void
  formId: string
  onFormChange: (id: string) => void
  form: ApprovalForm | null
  /** 보완 중에는 양식을 바꾸지 못한다 — 이미 찍힌 도장의 뜻이 달라진다. */
  locked: boolean
  docNo: string | null
  deptName: string
  drafter: { name: string; jobTitle: string }
  amount: string
  createdAt: string | null
}

/**
 * 기안 화면의 '기본 설정' 카드 — 문서 종류(대분류 > 양식)와 표준 머리.
 *
 * 상세 화면과 **같은 격자 표**를 쓴다(ApprovalInfoTable) — 무엇을 적고 있는지와 무엇이
 * 적혔는지가 같은 자리에서 읽혀야 한다. 보존 연한·보안 등급은 양식이 정하므로 여기서
 * 고르지 않고 고른 양식의 값을 그대로 보인다.
 */
export function ApprovalBasicsCard({
  groups,
  categoryForms,
  category,
  onCategoryChange,
  formId,
  onFormChange,
  form,
  locked,
  docNo,
  deptName,
  drafter,
  amount,
  createdAt,
}: Props) {
  return (
    <Card title="기본 설정">
      <div className="space-y-4">
        <ApprovalInfoTable
          pairs={approvalHeaderPairs({
            // 문서 종류는 두 단이다 — 대분류를 고른 뒤 그 안의 양식을 고른다.
            // 양식이 늘어날수록 한 줄짜리 목록은 훑기 어려워진다.
            formPath: (
              // 대분류와 양식은 한 줄에 나란히 선다(`대분류 > 양식`을 읽는 순서 그대로).
              // 줄바꿈을 허용하면 좁은 칸에서 둘이 위아래로 갈려 두 단 관계가 흐려진다.
              <div className="flex items-center gap-2">
                <Select
                  density="table"
                  className="min-w-0 flex-1"
                  value={category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  disabled={locked}
                >
                  <option value="">분류 선택</option>
                  {groups.map((g) => (
                    <option key={g.category} value={g.category}>
                      {g.category}
                    </option>
                  ))}
                </Select>
                <Select
                  density="table"
                  className="min-w-0 flex-1"
                  value={formId}
                  onChange={(e) => onFormChange(e.target.value)}
                  disabled={!category || locked}
                >
                  <option value="">양식 선택</option>
                  {categoryForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </div>
            ),
            // 채번·완료 일시는 아직 없다. 자리는 그대로 두고 값만 비운다.
            docNo,
            deptName,
            drafter,
            retentionGrade: form ? `${form.retention} / ${form.security_grade}` : null,
            // 금액은 지금 입력 중인 값에서 곧바로 파생한다(상신 후 집계될 값과 같은 셈).
            amount,
            createdAt,
            completedAt: null,
          })}
        />
      </div>
    </Card>
  )
}
