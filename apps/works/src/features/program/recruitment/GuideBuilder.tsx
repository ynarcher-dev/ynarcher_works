import { Button, IconButton, Input, TextArea } from '@ynarcher/ui'
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { DEFAULT_GUIDE_SECTIONS, type GuideSection } from '@/features/program/recruitment/recruitmentHooks'

/**
 * 공개 랜딩 안내 섹션(제목+본문) 빌더. 신청 항목 빌더와 동일한 조작 모델로
 * 추가/삭제/정렬/편집한다. 배열 순서가 곧 공개 페이지 노출 순서다.
 */
export function GuideBuilder({
  sections,
  onChange,
}: {
  sections: GuideSection[]
  onChange: (next: GuideSection[]) => void
}) {
  const patch = (idx: number, part: Partial<GuideSection>) =>
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...part } : s)))

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    const a = sections[idx]
    const b = sections[j]
    if (!a || !b) return
    const next = [...sections]
    next[idx] = b
    next[j] = a
    onChange(next)
  }

  const remove = (idx: number) => onChange(sections.filter((_, i) => i !== idx))
  const add = () => onChange([...sections, { title: '', body: '' }])
  const resetPreset = () => onChange(DEFAULT_GUIDE_SECTIONS.map((s) => ({ ...s })))

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-gray-700">안내 섹션</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={resetPreset} type="button">
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> 기본값
          </Button>
          <Button variant="secondary" onClick={add} type="button">
            <Plus className="mr-1 h-3.5 w-3.5" /> 섹션 추가
          </Button>
        </div>
      </div>

      {sections.length === 0 && (
        <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-600">
          안내 섹션이 없습니다. 기본값을 불러오거나 섹션을 추가하세요.
        </p>
      )}

      <ul className="space-y-2.5">
        {sections.map((s, idx) => (
          <li key={idx} className="rounded-radius-md border border-gray-200 bg-white p-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col pt-1.5">
                <IconButton
                  variant="ghost"
                  label="위로"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  icon={<ChevronUp className="h-4 w-4" />}
                />
                <IconButton
                  variant="ghost"
                  label="아래로"
                  onClick={() => move(idx, 1)}
                  disabled={idx === sections.length - 1}
                  icon={<ChevronDown className="h-4 w-4" />}
                />
              </div>

              <div className="flex-1 space-y-2">
                <Input
                  aria-label="섹션 제목"
                  placeholder="섹션 제목 (예: 모집 개요)"
                  value={s.title}
                  onChange={(e) => patch(idx, { title: e.target.value })}
                />
                <TextArea
                  aria-label="섹션 내용"
                  rows={3}
                  placeholder="공개 페이지에 노출될 안내 내용을 입력하세요."
                  value={s.body}
                  onChange={(e) => patch(idx, { body: e.target.value })}
                />
              </div>

              <IconButton
                variant="ghost"
                danger
                label="섹션 삭제"
                onClick={() => remove(idx)}
                className="mt-1.5"
                icon={<Trash2 className="h-4 w-4" />}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
