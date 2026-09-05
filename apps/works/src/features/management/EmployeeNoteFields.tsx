import { TextArea } from '@ynarcher/ui'
import { type ReactNode } from 'react'
import { useTagTokenField } from '@/features/admin/TagTokenField'
import {
  INTEREST_TAG_TABLE,
  MAX_INTERESTS,
  type EmployeeNote,
} from '@/features/management/noteConfig'

interface Props {
  value: EmployeeNote
  onChange: (next: EmployeeNote) => void
}

/** 라벨 + 입력 한 칸(EmployeeForm의 Field와 같은 규격). */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  /**
   * 접지 않고 컨트롤 아래에 펴는 안내. **막힌 이유에만** 쓴다 — 이 폼에는 말풍선 인프라가 없어
   * 접을 자리가 없고, 접을 수 없는 것을 접는 척하느니 지시문만 받는 편이 정직하다.
   */
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-caption font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-caption text-gray-600">{hint}</p>}
    </div>
  )
}

/**
 * 노트 세 항목(액셀러레이터 철학 · 관심분야 · 한마디) 편집기.
 * 인사 관리 수정 폼과 마이페이지가 같은 화면을 쓰도록 분리했다 — 저장 규약은 noteConfig가 소유한다.
 * 관심분야는 자유 입력이 아니라 ADMIN 분야태그 관리 원장(industry_tags)에서 고른다.
 */
export function EmployeeNoteFields({ value, onChange }: Props) {
  const interestField = useTagTokenField({
    table: INTEREST_TAG_TABLE,
    noun: '분야',
    adminMenu: '분야 관리',
    value: value.interests,
    onChange: (next) => onChange({ ...value, interests: next }),
    max: MAX_INTERESTS,
  })

  return (
    <div className="space-y-4">
      <Field label="액셀러레이터 철학">
        <TextArea
          rows={5}
          value={value.philosophy}
          onChange={(e) => onChange({ ...value, philosophy: e.target.value })}
        />
      </Field>

      {/* 상한은 라벨이 이미 말하므로, 여기서는 원장이 비어 못 고를 때의 지시만 받는다. */}
      <Field
        label={`관심분야(${MAX_INTERESTS}개)`}
        hint={interestField.hintInline ? interestField.hint : undefined}
      >
        {interestField.control}
      </Field>

      <Field label="한마디">
        <TextArea
          rows={4}
          value={value.oneLiner}
          onChange={(e) => onChange({ ...value, oneLiner: e.target.value })}
        />
      </Field>
    </div>
  )
}
