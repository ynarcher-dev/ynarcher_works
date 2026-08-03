import { Badge, Button, DashedAddButton, EmptyState, Select, TextAction } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { AttendancePolicyFields } from '@/features/management/attendance/AttendancePolicyFields'
import {
  useDeleteAttendancePolicy,
  useSaveAttendancePolicy,
  type AttendancePolicyInput,
} from '@/features/management/attendance/attendanceConfigApi'
import {
  timeText,
  workMinutesText,
  workdaysText,
  type AttendancePolicy,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  policies: AttendancePolicy[]
  onSaved: (message: string) => void
  onFailed: () => void
}

/** 폼 초기값 — 새 예외는 전사 기본을 그대로 물려받고 대상만 비운다. */
function draftFrom(base: AttendancePolicy | undefined, userId: string | null): AttendancePolicyInput {
  return {
    userId,
    checkInFrom: base?.checkInFrom ?? '07:00',
    checkInTo: base?.checkInTo ?? '09:00',
    workMinutes: base?.workMinutes ?? 540,
    workdays: base?.workdays ?? [1, 2, 3, 4, 5],
    allowExternal: base?.allowExternal ?? true,
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    note: null,
  }
}

/** 정책 한 줄 요약 — 목록에서 기준을 펼치지 않고도 읽힌다. */
function summary(p: AttendancePolicy): string {
  return [
    `${timeText(p.checkInFrom)}~${timeText(p.checkInTo)}`,
    workMinutesText(p.workMinutes),
    workdaysText(p.workdays),
    p.allowExternal ? '외부근무 허용' : '사내만',
  ].join(' · ')
}

/**
 * 근무 기준 탭 — 전사 기본 한 벌과 임직원별 예외 목록.
 *
 * 기준을 고치면 기존 행을 덮어쓰지 않고 적용 시작일이 다르면 새 행이 선다(같은 날짜면 그 행을
 * 고친다). 과거 판정을 되돌리지 않기 위해서이며, 짝이 되는 유니크 인덱스가 DB에 있다.
 */
export function AttendancePolicySection({ policies, onSaved, onFailed }: Props) {
  const { data: employees } = useEmployees()
  const save = useSaveAttendancePolicy()
  const remove = useDeleteAttendancePolicy()

  // 전사 기본은 발효일 최신 한 벌만 보여 준다(목록은 이미 발효일 내림차순).
  const base = useMemo(() => policies.find((p) => p.userId === null), [policies])
  const exceptions = useMemo(() => policies.filter((p) => p.userId !== null), [policies])

  const [draft, setDraft] = useState<AttendancePolicyInput | null>(null)

  const nameOf = useMemo(() => {
    const byId = new Map((employees ?? []).map((e) => [e.id, e.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? '알 수 없음' : '전사 기본')
  }, [employees])

  const submit = async (value: AttendancePolicyInput) => {
    if (value.checkInFrom >= value.checkInTo) {
      onFailed()
      return
    }
    try {
      await save.mutateAsync(value)
      onSaved('근무 기준을 저장했습니다.')
      setDraft(null)
    } catch {
      onFailed()
    }
  }

  const drop = async (p: AttendancePolicy) => {
    if (!window.confirm(`${nameOf(p.userId)}의 예외 기준을 해제하시겠습니까? 전사 기본을 따르게 됩니다.`))
      return
    try {
      await remove.mutateAsync(p.id)
      onSaved('예외 기준을 해제했습니다.')
    } catch {
      onFailed()
    }
  }

  // 편집 중인 폼(전사 기본 또는 예외 한 건). 열려 있지 않으면 목록만 보인다.
  if (draft) {
    return (
      <div className="space-y-4">
        {draft.userId !== null && (
          <label className="block space-y-1">
            <span className="text-caption text-gray-600">적용 대상</span>
            <Select
              value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
            >
              <option value="">임직원 선택</option>
              {(employees ?? []).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        <AttendancePolicyFields value={draft} onChange={setDraft} />

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="secondary" onClick={() => setDraft(null)}>
            취소
          </Button>
          <Button
            onClick={() => void submit(draft)}
            disabled={save.isPending || (draft.userId !== null && !draft.userId)}
          >
            저장
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-body font-semibold text-gray-900">전사 기본</p>
          <TextAction onClick={() => setDraft(base ? { ...base, note: base.note } : draftFrom(undefined, null))}>
            수정
          </TextAction>
        </div>
        {base ? (
          <div className="rounded-radius-md border border-gray-300 bg-white px-3 py-2">
            <p className="text-body text-gray-900">{summary(base)}</p>
            <p className="mt-0.5 text-caption text-gray-500">
              {base.effectiveFrom}부터 적용
            </p>
          </div>
        ) : (
          <EmptyState title="전사 기본 기준이 없습니다." />
        )}
      </section>

      <section className="space-y-2">
        <p className="text-body font-semibold text-gray-900">임직원별 예외</p>
        {exceptions.length === 0 ? (
          <p className="text-caption text-gray-500">
            예외가 없습니다. 모든 임직원이 전사 기본을 따릅니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {exceptions.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2"
              >
                <Badge tone="neutral">{nameOf(p.userId)}</Badge>
                <span className="text-body text-gray-700">{summary(p)}</span>
                <span className="text-caption text-gray-500">{p.effectiveFrom}부터</span>
                <span className="ml-auto flex items-center gap-3">
                  <TextAction onClick={() => setDraft({ ...p })}>수정</TextAction>
                  <TextAction className="text-danger-700" onClick={() => void drop(p)}>
                    해제
                  </TextAction>
                </span>
              </li>
            ))}
          </ul>
        )}
        <DashedAddButton onClick={() => setDraft(draftFrom(base, ''))}>
          예외 추가
        </DashedAddButton>
      </section>
    </div>
  )
}
