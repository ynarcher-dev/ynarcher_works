import { TextArea, TokenMultiSelect } from '@ynarcher/ui'
import { useMemo, type ReactNode } from 'react'
import { useTags } from '@/features/admin/hooks'
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
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

/**
 * 노트 세 항목(액셀러레이터 철학 · 관심분야 · 한마디) 편집기.
 * 인사 관리 수정 폼과 마이페이지가 같은 화면을 쓰도록 분리했다 — 저장 규약은 noteConfig가 소유한다.
 * 관심분야는 자유 입력이 아니라 ADMIN 분야태그 관리 원장(industry_tags)에서 고른다.
 */
export function EmployeeNoteFields({ value, onChange }: Props) {
  const { data: tags } = useTags(INTEREST_TAG_TABLE)
  // 태그 목록에 없는 기존 값도 칩으로 남아야 하므로 후보에 합쳐 둔다.
  const options = useMemo(() => {
    const names = (tags ?? []).map((t) => t.name)
    return [...names, ...value.interests.filter((n) => !names.includes(n))]
  }, [tags, value.interests])

  return (
    <div className="space-y-4">
      <Field label="액셀러레이터 철학">
        <TextArea
          rows={5}
          value={value.philosophy}
          onChange={(e) => onChange({ ...value, philosophy: e.target.value })}
        />
      </Field>

      <Field label={`관심분야(${MAX_INTERESTS}개)`}>
        <TokenMultiSelect<string>
          selected={value.interests}
          onChange={(next) => onChange({ ...value, interests: next })}
          getKey={(n) => n}
          getLabel={(n) => n}
          options={options}
          max={MAX_INTERESTS}
          placeholder="분야 태그 검색"
          // 태그 이름을 외우고 있을 리 없으므로 돋보기로 원장 전체를 펼쳐 고를 수 있게 한다.
          browsable
        />
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
