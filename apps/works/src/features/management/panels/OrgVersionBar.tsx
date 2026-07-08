import { Badge, Button, Input, Modal, Select } from '@ynarcher/ui'
import { CopyPlus } from 'lucide-react'
import { useState } from 'react'
import type { OrgVersion } from '@/features/management/hooks'

/** 가용기간 표기: 시작 ~ 종료(없으면 무기한). */
function periodLabel(v: OrgVersion): string {
  return `${v.effective_from} ~ ${v.effective_to ?? '무기한'}`
}

/** 버전 상태 배지: 활성(오늘 유효) / 예정(미래 발효) / 지난(대체됨) / 초안. */
function versionState(
  v: OrgVersion,
  activeId: string | null,
): { label: string; tone: 'success' | 'info' | 'neutral' } {
  if (v.status === 'DRAFT') return { label: '초안', tone: 'neutral' }
  if (v.id === activeId) return { label: '활성', tone: 'success' }
  const today = new Date().toISOString().slice(0, 10)
  if (v.effective_from > today) return { label: '예정', tone: 'info' }
  return { label: '지난', tone: 'neutral' }
}

export interface CloneInput {
  srcVersionId: string
  label: string
  effectiveFrom: string
  effectiveTo: string | null
}

interface OrgVersionBarProps {
  versions: OrgVersion[]
  selectedId: string
  activeId: string | null
  onSelect: (id: string) => void
  onClone: (input: CloneInput) => void
  cloning: boolean
}

/**
 * 조직 버전(가용기간) 툴바 — 버전 선택 드롭다운 + 상태 배지 + "새 버전 복제" 모달.
 * 선택 버전이 오늘의 유효 버전이 아니면 편집 대상이 유효 조직도가 아님을 안내한다.
 */
export function OrgVersionBar({
  versions,
  selectedId,
  activeId,
  onSelect,
  onClone,
  cloning,
}: OrgVersionBarProps) {
  const selected = versions.find((v) => v.id === selectedId)
  const state = selected ? versionState(selected, activeId) : null
  const notActive = Boolean(selected && activeId && selected.id !== activeId)

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const openClone = () => {
    setLabel(selected ? `${selected.label} 복제` : '새 조직 버전')
    setFrom('')
    setTo('')
    setError(null)
    setOpen(true)
  }

  const submit = () => {
    if (!selected) return
    if (!label.trim()) return setError('버전 이름을 입력하세요.')
    if (!from) return setError('시작일을 입력하세요.')
    if (to && to <= from) return setError('종료일은 시작일보다 뒤여야 합니다.')
    onClone({
      srcVersionId: selected.id,
      label: label.trim(),
      effectiveFrom: from,
      effectiveTo: to || null,
    })
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedId} onChange={(e) => onSelect(e.target.value)} className="max-w-72">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} · {periodLabel(v)}
            </option>
          ))}
        </Select>
        {state && (
          <Badge tone={state.tone} size="sm">
            {state.label}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={openClone} disabled={!selected || cloning}>
          <CopyPlus size={14} /> 새 버전 복제
        </Button>
      </div>

      {notActive && (
        <p className="rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2 text-caption text-warning">
          편집 중인 버전은 오늘의 유효 조직도가 아닙니다. 미래·과거 조직도를 미리 설계·보관하는 용도입니다.
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="새 조직 버전 복제"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button size="sm" onClick={submit} disabled={cloning}>
              복제 생성
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-caption text-gray-500">
            <span className="font-semibold text-gray-800">{selected?.label}</span> 의 조직 트리를
            새 가용기간으로 복사합니다.
          </p>
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-gray-600">버전 이름</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-caption font-semibold text-gray-600">시작일</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-caption font-semibold text-gray-600">종료일(비우면 무기한)</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9"
              />
            </label>
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
          <p className="text-caption text-gray-400">
            · 가용기간이 다른 발효 버전과 겹치면 저장이 거부됩니다(겹침 금지).
          </p>
        </div>
      </Modal>
    </div>
  )
}
