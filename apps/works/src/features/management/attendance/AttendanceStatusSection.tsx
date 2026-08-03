import {
  Badge,
  Button,
  DashedAddButton,
  Input,
  Select,
  Switch,
  TextAction,
  type BadgeTone,
} from '@ynarcher/ui'
import { useState } from 'react'
import {
  useSaveAttendanceStatus,
  type AttendanceStatusInput,
} from '@/features/management/attendance/attendanceConfigApi'
import type {
  AttendanceKind,
  AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  statuses: AttendanceStatus[]
  onSaved: (message: string) => void
  onFailed: () => void
}

const TONES: { value: BadgeTone; label: string }[] = [
  { value: 'success', label: '정상(초록)' },
  { value: 'warning', label: '주의(주황)' },
  { value: 'danger', label: '경고(빨강)' },
  { value: 'info', label: '정보(파랑)' },
  { value: 'neutral', label: '중립(회색)' },
]

const KINDS: { value: AttendanceKind; label: string }[] = [
  { value: 'WORK', label: '근무' },
  { value: 'LEAVE', label: '휴가' },
  { value: 'ABSENT', label: '결근' },
]

const EMPTY: AttendanceStatusInput = {
  code: '',
  label: '',
  tone: 'info',
  kind: 'LEAVE',
  isPaid: true,
  sortOrder: 200,
  isActive: true,
}

/**
 * 근태 상태 탭 — 상태 값을 코드가 아니라 원장으로 관리한다.
 *
 * 시스템 상태 5종(정상·지각·조기퇴근·지각·조기퇴근·결근)은 규칙이 자동으로 매기는 결과라
 * 코드와 구분(kind)을 잠근다. 코드가 바뀌면 판정 함수가 없는 값을 가리키게 되고, 구분이 바뀌면
 * 집계에서 근무와 휴가가 뒤섞인다. 라벨과 색은 회사가 부르는 말이므로 열어 둔다.
 */
export function AttendanceStatusSection({ statuses, onSaved, onFailed }: Props) {
  const save = useSaveAttendanceStatus()
  const [draft, setDraft] = useState<AttendanceStatusInput | null>(null)
  const [editingCode, setEditingCode] = useState<string | null>(null)

  const isSystemDraft = statuses.some((s) => s.code === editingCode && s.isSystem)

  const submit = async () => {
    if (!draft) return
    if (!draft.code.trim() || !draft.label.trim()) {
      onFailed()
      return
    }
    try {
      await save.mutateAsync(draft)
      onSaved('근태 상태를 저장했습니다.')
      setDraft(null)
      setEditingCode(null)
    } catch {
      onFailed()
    }
  }

  const open = (s?: AttendanceStatus) => {
    setEditingCode(s?.code ?? null)
    setDraft(
      s
        ? {
            code: s.code,
            label: s.label,
            tone: s.tone,
            kind: s.kind,
            isPaid: s.isPaid,
            sortOrder: s.sortOrder,
            isActive: s.isActive,
          }
        : EMPTY,
    )
  }

  if (draft) {
    const set = <K extends keyof AttendanceStatusInput>(k: K, v: AttendanceStatusInput[K]) =>
      setDraft({ ...draft, [k]: v })

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-caption text-gray-600">코드</span>
            <Input
              value={draft.code}
              disabled={editingCode !== null}
              placeholder="LEAVE_MATERNITY"
              onChange={(e) => set('code', e.target.value.toUpperCase())}
            />
          </label>
          <label className="space-y-1">
            <span className="text-caption text-gray-600">라벨</span>
            <Input
              value={draft.label}
              placeholder="출산휴가"
              onChange={(e) => set('label', e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-caption text-gray-600">배지 색</span>
            <Select value={draft.tone} onChange={(e) => set('tone', e.target.value as BadgeTone)}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-caption text-gray-600">구분(집계 축)</span>
            <Select
              value={draft.kind}
              disabled={isSystemDraft}
              onChange={(e) => set('kind', e.target.value as AttendanceKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-caption text-gray-600">정렬 순서</span>
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => set('sortOrder', Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-body text-gray-900">유급</p>
          <Switch checked={draft.isPaid} onChange={(on) => set('isPaid', on)} aria-label="유급" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-body text-gray-900">사용</p>
            <p className="text-caption text-gray-500">
              끄면 새로 고를 수 없되 이미 그 상태로 기록된 날은 그대로 남습니다.
            </p>
          </div>
          <Switch
            checked={draft.isActive}
            onChange={(on) => set('isActive', on)}
            aria-label="사용"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(null)
              setEditingCode(null)
            }}
          >
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            저장
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {statuses.map((s) => (
          <li
            key={s.code}
            className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2"
          >
            <Badge tone={s.tone}>{s.label}</Badge>
            <span className="text-caption tabular-nums text-gray-500">{s.code}</span>
            <span className="text-caption text-gray-600">
              {KINDS.find((k) => k.value === s.kind)?.label}
              {s.isPaid ? ' · 유급' : ' · 무급'}
            </span>
            {s.isSystem && <Badge tone="neutral">자동 판정</Badge>}
            {!s.isActive && <Badge tone="neutral">미사용</Badge>}
            <TextAction className="ml-auto" onClick={() => open(s)}>
              수정
            </TextAction>
          </li>
        ))}
      </ul>
      <DashedAddButton onClick={() => open()}>상태 추가</DashedAddButton>
    </div>
  )
}
