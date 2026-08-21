import { Button, CardHeading, IconButton, Input } from '@ynarcher/ui'
import { Plus, Trash2 } from 'lucide-react'
import {
  CAREER_SECTIONS,
  emptyRow,
  type CareerData,
  type CareerSection,
} from '@/features/management/careerConfig'

interface Props {
  value: CareerData
  onChange: (next: CareerData) => void
}

/** 약력 편집기: 학력/경력/자격증/수상 섹션별로 항목을 추가·수정·삭제한다. */
export function CareerEditor({ value, onChange }: Props) {
  const setRows = (key: string, rows: CareerData[string]) =>
    onChange({ ...value, [key]: rows })

  return (
    <div className="space-y-6">
      {CAREER_SECTIONS.map((section) => (
        <SectionBlock
          key={section.key}
          section={section}
          rows={value[section.key] ?? []}
          onRows={(rows) => setRows(section.key, rows)}
        />
      ))}
    </div>
  )
}

function SectionBlock({
  section,
  rows,
  onRows,
}: {
  section: CareerSection
  rows: CareerData[string]
  onRows: (rows: CareerData[string]) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <CardHeading level="subhead">{section.title}</CardHeading>
        <Button variant="outline" onClick={() => onRows([...rows, emptyRow(section)])}>
          <Plus className="size-3.5" aria-hidden /> 추가
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-caption text-gray-600">
          항목이 없습니다. "추가"로 입력하세요.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              {section.fields.map((f) => (
                <div key={f.key} className="min-w-0 flex-1">
                  <Input
                    placeholder={f.placeholder}
                    value={row[f.key] ?? ''}
                    onChange={(e) =>
                      onRows(
                        rows.map((r, ri) =>
                          ri === i ? { ...r, [f.key]: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <IconButton
                variant="ghost"
                danger
                label="삭제"
                onClick={() => onRows(rows.filter((_, ri) => ri !== i))}
                icon={<Trash2 className="size-4" aria-hidden />}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
