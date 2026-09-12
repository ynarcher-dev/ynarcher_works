import { Button, Checkbox, Input, Modal, TextArea, cn, formText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { CompanionPicker } from '@/features/hub/CompanionPicker'
import {
  encodeEventBody,
  parseEventMeta,
  useCreateSystemEvent,
  useDeleteSystemEvent,
  useUpdateSystemEvent,
  type EventCompanion,
  type SystemEvent,
} from '@/features/hub/hooks'

/** 좌측 라벨 + 우측 컨트롤 한 줄. tall이면 라벨을 위쪽에 맞춘다(내용·동행자). */
function Row({
  label,
  tall,
  children,
}: {
  label: string
  tall?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <span
        className={cn(
          formText.label,
          tall ? 'self-start pt-2' : 'self-center',
        )}
      >
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </>
  )
}

/**
 * 전사 일정 등록/수정 모달. `event`가 주어지면 그 일정을 수정하고 삭제 버튼을 띄운다.
 * 좌측 라벨 행 구성 — 제목 · 시작(날짜·시간) · 종료(날짜·시간·종일) · 작성자 · 동행자 · 내용.
 * 시작/종료를 각각 날짜+시간으로 지정해 여러 날에 걸친 일정도 만들 수 있다.
 *
 * **사람이 손으로 만드는 일정은 업무 하나다**(2026-09-11 사용자 확정). 휴가(`LEAVE`)는 전자결재
 * 승인이 자동으로 배정할 것이라 여기에 선택지로 두면 같은 휴가가 두 경로로 생겨 어느 쪽이 사실인지
 * 판정할 근거가 없어진다(결재 없이 캘린더에만 선 휴가, 캘린더에서 지웠는데 결재에는 승인으로 남은
 * 휴가). 그래서 **만드는 자리만** 닫고 보는 자리는 그대로 둔다 — 원장·조회(`useSystemEvents`)·
 * 상세 묶음(`DayAgenda`의 '휴가')·색(`eventStyle`)은 손대지 않는다.
 *
 * 이미 있는 휴가 행은 계속 열어 고칠 수 있어 `category` 상태는 남는다 — 값이 사라지면 휴가 행을
 * 열어 저장하는 순간 업무로 조용히 바뀌고, 구분을 고르는 칸이 없으니 담당자는 그 사실을 화면에서
 * 알 길이 없다.
 */
export function EventEditorModal({
  open,
  dateKey,
  event,
  onClose,
}: {
  open: boolean
  dateKey: string
  event: SystemEvent | null
  onClose: () => void
}) {
  const create = useCreateSystemEvent()
  const update = useUpdateSystemEvent()
  const del = useDeleteSystemEvent()
  const userName = useAuthStore((s) => s.user?.name ?? '사용자')

  const [title, setTitle] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [memo, setMemo] = useState('')
  const [companions, setCompanions] = useState<EventCompanion[]>([])
  const [err, setErr] = useState('')

  const isEdit = !!event
  const busy = create.isPending || update.isPending || del.isPending

  // 열릴 때마다 대상(등록/수정)에 맞춰 폼을 초기화한다.
  useEffect(() => {
    if (!open) return
    if (event) {
      const meta = parseEventMeta(event.body)
      const s = event.starts_at ? dayjs(event.starts_at) : dayjs(dateKey)
      const e = event.ends_at ? dayjs(event.ends_at) : null
      setTitle(event.title ?? '')
      setAllDay(meta.allDay)
      setStartDate(s.format('YYYY-MM-DD'))
      setStartTime(meta.allDay ? '' : s.format('HH:mm'))
      setEndDate((e ?? s).format('YYYY-MM-DD'))
      setEndTime(!meta.allDay && e ? e.format('HH:mm') : '')
      setMemo(meta.memo)
      setCompanions(meta.companions)
    } else {
      setTitle('')
      setAllDay(false)
      setStartDate(dateKey)
      setStartTime('')
      setEndDate(dateKey)
      setEndTime('')
      setMemo('')
      setCompanions([])
    }
    setErr('')
  }, [open, event, dateKey])

  /** keepOpen=true(저장 후 계속 추가)이면 제목·내용·동행자만 비우고 모달을 유지한다. */
  const submit = (keepOpen: boolean) => {
    const t = title.trim()
    if (!t) {
      setErr('제목을 입력하세요.')
      return
    }

    if (!startDate) {
      setErr('시작 날짜를 선택하세요.')
      return
    }
    const end = endDate || startDate

    let startsAt: string
    let endsAt: string | null
    if (allDay) {
      startsAt = dayjs(`${startDate}T00:00`).toISOString()
      endsAt = end > startDate ? dayjs(`${end}T23:59`).toISOString() : null
    } else {
      if (!startTime) {
        setErr('시작 시간을 입력하거나 종일을 선택하세요.')
        return
      }
      startsAt = dayjs(`${startDate}T${startTime}`).toISOString()
      endsAt = endTime ? dayjs(`${end}T${endTime}`).toISOString() : null
      if (endsAt && endsAt < startsAt) {
        setErr('종료가 시작보다 빠릅니다.')
        return
      }
    }
    const body = encodeEventBody({
      allDay,
      memo: memo.trim(),
      companions,
    })
    setErr('')
    // 구분은 고정이다 — 휴가는 전자결재가 서버에서 만든다(RLS가 화면발 LEAVE 삽입을 막는다).
    const payload = { event_type: 'WORK' as const, title: t, starts_at: startsAt, ends_at: endsAt, body }
    if (event) {
      update.mutate({ id: event.id, ...payload }, { onSuccess: onClose })
      return
    }
    create.mutate(payload, {
      onSuccess: () => {
        if (!keepOpen) {
          onClose()
          return
        }
        setTitle('')
        setMemo('')
        setCompanions([])
        setErr('')
      },
    })
  }

  const remove = () => {
    if (event && window.confirm('이 일정을 삭제할까요?')) {
      del.mutate(event.id, { onSuccess: onClose })
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={onClose}
      title={isEdit ? '일정 수정' : '일정 추가'}
      footer={
        <>
          {isEdit && (
            <Button variant="outline-danger" className="mr-auto" onClick={remove} disabled={busy}>
              삭제
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          {!isEdit && (
            <Button
              variant="outline"
              onClick={() => submit(true)}
              disabled={busy || !title.trim()}
            >
              저장 후 계속 추가
            </Button>
          )}
          <Button
            onClick={() => submit(false)}
            disabled={busy || !title.trim()}
          >
            {busy ? '처리 중…' : '저장'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-4 gap-y-3">
        <Row label="제목">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요."
            autoFocus
          />
        </Row>

        <Row label="시작">
          <div className="grid grid-cols-[10rem_7rem_auto] items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {!allDay && (
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="시작 시간"
              />
            )}
          </div>
        </Row>

        <Row label="종료">
          <div className="grid grid-cols-[10rem_7rem_auto] items-center gap-2">
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {/* 종일이면 시간칸이 사라지므로 '종일'이 날짜 바로 옆(시간칸 자리)으로 당겨진다. */}
            {!allDay && (
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="종료 시간"
              />
            )}
            <Checkbox checked={allDay} onChange={(e) => setAllDay(e.target.checked)} label="종일" />
          </div>
        </Row>

        <Row label="작성자">
          {/* 고정값이라 텍스트로 세운다 — 지울 수 없는 값이 동행자 칩과 같은 모양으로 서면
              지울 수 있다고 말하는 컨트롤이 된다. */}
          <span className="text-body text-gray-900">{userName}</span>
        </Row>

        <Row label="동행자" tall>
          <CompanionPicker selected={companions} onChange={setCompanions} />
        </Row>

        <Row label="내용" tall>
          <TextArea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="내용을 입력하세요."
            rows={3}
          />
        </Row>
      </div>

      {err && <p className={cn('mt-3', formText.error)}>{err}</p>}
    </Modal>
  )
}
