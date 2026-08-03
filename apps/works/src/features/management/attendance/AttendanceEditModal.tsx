import { Banner, Button, Input, Modal, Select, Spinner, TextArea, useToast } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { AttendanceEditHistory } from '@/features/management/attendance/AttendanceEditHistory'
import {
  useAttendanceEdits,
  useSetAttendanceRecord,
} from '@/features/management/attendance/attendanceApi'
import {
  PLACE_LABELS,
  WEEKDAY_LABELS,
  displayStatusCode,
  statusOf,
  timeText,
  type AttendanceEntry,
  type AttendancePlace,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

/** 정정 대상 한 칸(누구의 어느 날인가 + 그 칸의 현재 값). */
export interface AttendanceTarget {
  userId: string
  userName: string
  workDate: string
  entry: AttendanceEntry
}

interface Props {
  target: AttendanceTarget | null
  statuses: AttendanceStatus[]
  onClose: () => void
}

/** ISO 시각 → 'HH:mm'(time 입력값). 값이 없으면 빈 문자열. */
const toTimeInput = (iso: string | null) => timeText(iso) ?? ''

/** 'HH:mm' + 날짜 → ISO. 비어 있으면 null(기록 없음). */
function toIso(dateKey: string, hhmm: string): string | null {
  if (!hhmm) return null
  const d = dayjs(`${dateKey}T${hhmm}`)
  return d.isValid() ? d.toISOString() : null
}

/**
 * 근태 정정 모달 — 그 사람의 그날 한 칸을 고친다.
 *
 * 사유 없이 저장할 수 없다. 근태는 급여·평가로 이어지는 기록이라 "누가 무엇을 왜 고쳤는가"가
 * 남아야 하며, 빈 사유는 화면이 막고 DB의 not null이 최종 판정한다.
 *
 * 자동 판정값은 상태 셀렉트 옆에 읽기 전용으로 둔다. 무엇을 무엇으로 바꾸는지가 보이지 않으면
 * 정정이 아니라 그냥 입력이 된다.
 */
export function AttendanceEditModal({ target, statuses, onClose }: Props) {
  const toast = useToast()
  const save = useSetAttendanceRecord()
  const { data: edits, isLoading: editsLoading } = useAttendanceEdits(target?.entry.dayId)

  const [place, setPlace] = useState<AttendancePlace>('INTERNAL')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [statusCode, setStatusCode] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')

  // 대상이 바뀔 때마다 그 칸의 현재 값으로 폼을 되돌린다(사유는 매번 새로 받는다).
  useEffect(() => {
    if (!target) return
    const e = target.entry
    setPlace(e.workPlace ?? 'INTERNAL')
    setCheckIn(toTimeInput(e.checkInAt))
    setCheckOut(toTimeInput(e.checkOutAt))
    setStatusCode(displayStatusCode(e, target.workDate) ?? '')
    setNote(e.note ?? '')
    setReason('')
  }, [target])

  if (!target) return null

  const date = dayjs(target.workDate)
  const auto = statusOf(statuses, target.entry.autoStatusCode)
  // 비활성 상태는 새로 고를 수 없되, 지금 걸려 있는 값이면 목록에 남겨 둔다(고르지 않았는데
  // 사라지면 저장할 때 값이 바뀌어 버린다).
  const options = statuses.filter((s) => s.isActive || s.code === statusCode)

  const trimmedReason = reason.trim()
  const canSave = Boolean(statusCode) && Boolean(trimmedReason) && !save.isPending

  const submit = async () => {
    const inIso = toIso(target.workDate, checkIn)
    const outIso = toIso(target.workDate, checkOut)
    if (outIso && !inIso) {
      toast.show('출근 기록 없이 퇴근만 남길 수 없습니다.', 'danger')
      return
    }
    if (inIso && outIso && dayjs(outIso).isBefore(dayjs(inIso))) {
      toast.show('퇴근 시각이 출근 시각보다 이릅니다.', 'danger')
      return
    }
    try {
      await save.mutateAsync({
        userId: target.userId,
        workDate: target.workDate,
        statusCode,
        checkInAt: inIso,
        checkOutAt: outIso,
        workPlace: place,
        note: note.trim() || null,
        reason: trimmedReason,
      })
      toast.show('근태를 정정했습니다.', 'success')
      onClose()
    } catch {
      toast.show('정정에 실패했습니다. 입력값과 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`근태 수정 — ${target.userName} / ${date.format('YYYY-MM-DD')} (${WEEKDAY_LABELS[date.day()]})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!target.entry.isWorkday && (
          <Banner tone="info">근무 기준상 근무일이 아닌 날입니다.</Banner>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-caption text-gray-600">근무지</span>
            <Select value={place} onChange={(e) => setPlace(e.target.value as AttendancePlace)}>
              {(Object.keys(PLACE_LABELS) as AttendancePlace[]).map((p) => (
                <option key={p} value={p}>
                  {PLACE_LABELS[p]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-caption text-gray-600">출근 시각</span>
            <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-caption text-gray-600">퇴근 시각</span>
            <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-caption text-gray-600">
            상태
            {auto && <span className="ml-2 text-gray-500">자동 판정: {auto.label}</span>}
          </span>
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
            placeholder="예: 오전 반차 결재 승인, 출근 기록 누락 보정"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-caption text-gray-600">비고</span>
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="border-t border-gray-100 pt-3">
          <p className="mb-2 text-caption font-medium text-gray-700">정정 이력</p>
          {editsLoading ? <Spinner /> : <AttendanceEditHistory edits={edits ?? []} statuses={statuses} />}
        </div>
      </div>
    </Modal>
  )
}
