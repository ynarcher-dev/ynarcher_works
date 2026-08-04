import { Banner, Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  useSetAttendanceStatusBulk,
  type AttendanceBulkTarget,
} from '@/features/management/attendance/attendanceApi'
import type { AttendanceStatus } from '@/features/management/attendance/attendanceModel'

interface Props {
  /** 고른 칸들. 비면 이 줄 자체를 렌더하지 않는다. */
  targets: AttendanceBulkTarget[]
  statuses: AttendanceStatus[]
  /** 고른 것을 세는 말 — 날짜별은 사람('명'), 인력별은 날('일')을 센다. */
  unit: string
  /** 반영 후 선택을 비운다(화면에서 사라진 것에 대한 선택이 남지 않게). */
  onDone: () => void
}

/**
 * 선택 요약 줄 + 상태 일괄 변경.
 *
 * 일괄이라고 사유가 면제되지 않는다. 근태는 급여·평가로 이어지는 기록이라 "누가 무엇을 왜
 * 바꿨는가"가 남아야 하고, 한 번에 열두 줄을 바꾸는 일일수록 그렇다. 빈 사유는 화면이 막고
 * DB의 not null이 최종 판정한다.
 *
 * 바꾸는 축은 상태 하나다. 시각·근무지·비고는 칸마다 다른 값이라 일괄로 맞출 대상이 아니며,
 * 서버가 원장 값 그대로 둔다.
 */
export function AttendanceBulkBar({ targets, statuses, unit, onDone }: Props) {
  const toast = useToast()
  const bulk = useSetAttendanceStatusBulk()
  const [open, setOpen] = useState(false)
  const [statusCode, setStatusCode] = useState('')
  const [reason, setReason] = useState('')

  if (!targets.length) return null

  const options = statuses.filter((s) => s.isActive)
  const trimmedReason = reason.trim()
  const canSave = Boolean(statusCode) && Boolean(trimmedReason) && !bulk.isPending

  const close = () => {
    setOpen(false)
    setStatusCode('')
    setReason('')
  }

  const submit = async () => {
    try {
      const changed = await bulk.mutateAsync({ targets, statusCode, reason: trimmedReason })
      // 이미 그 상태이던 칸은 서버가 건너뛴다 — 고른 수와 바뀐 수가 다르면 그 사실을 밝힌다.
      const skipped = targets.length - changed
      toast.show(
        `${changed}건의 상태를 변경했습니다.` +
          (skipped > 0 ? ` 이미 같은 상태이던 ${skipped}건은 그대로 뒀습니다.` : ''),
        'success',
      )
      close()
      onDone()
    } catch {
      toast.show('일괄 변경에 실패했습니다. 입력값과 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
        <span className="text-body font-semibold text-gray-900">
          {targets.length}
          {unit} 선택
        </span>
        <div className="ml-auto">
          <Button variant="outline" onClick={() => setOpen(true)}>
            상태 일괄 변경
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={close}
        title={`상태 일괄 변경 — ${targets.length}${unit}`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            <Button onClick={() => void submit()} disabled={!canSave}>
              변경
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Banner tone="info">
            고른 칸의 상태만 바뀝니다. 찍힌 출근·퇴근 시각과 근무지·비고는 그대로 둡니다.
          </Banner>

          <label className="block space-y-1">
            <span className="text-caption text-gray-600">상태</span>
            <Select value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
              <option value="">상태 선택</option>
              {options.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-caption text-gray-600">사유 (필수)</span>
            <Input
              value={reason}
              maxLength={60}
              placeholder="예: 창립기념일 휴무 일괄 반영, 워크숍 공가 처리"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
      </Modal>
    </>
  )
}
