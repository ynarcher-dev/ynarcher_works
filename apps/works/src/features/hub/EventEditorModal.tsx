import { Button, Checkbox, Input, Modal, TagChip, TextArea, cn } from '@ynarcher/ui'
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
  type EventCategory,
  type EventCompanion,
  type SystemEvent,
} from '@/features/hub/hooks'

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: 'WORK', label: '업무' },
  { key: 'LEAVE', label: '휴가' },
]

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
          'text-caption font-medium text-gray-600',
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
 * 전사 캘린더 일정 등록/수정 모달. `event`가 주어지면 그 일정을 수정하고 삭제 버튼을 띄운다.
 * 좌측 라벨 행 구성 — 구분(업무/휴가) · 제목 · 시작(날짜·시간) · 종료(날짜·시간·종일) · 동행자 · 내용.
 * 시작/종료를 각각 날짜+시간으로 지정해 여러 날에 걸친 일정도 만들 수 있다.
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

  const [category, setCategory] = useState<EventCategory>('WORK')
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
      setCategory(event.event_type === 'LEAVE' ? 'LEAVE' : 'WORK')
      setTitle(event.title ?? '')
      setAllDay(meta.allDay)
      setStartDate(s.format('YYYY-MM-DD'))
      setStartTime(meta.allDay ? '' : s.format('HH:mm'))
      setEndDate((e ?? s).format('YYYY-MM-DD'))
      setEndTime(!meta.allDay && e ? e.format('HH:mm') : '')
      setMemo(meta.memo)
      setCompanions(meta.companions)
    } else {
      setCategory('WORK')
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
    let t = title.trim()
    if (category === 'WORK' && !t) {
      setErr('제목을 입력하세요.')
      return
    }
    if (category === 'LEAVE' && !t) t = `${userName} 휴가`

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
      companions: category === 'WORK' ? companions : [],
    })
    setErr('')
    const payload = { event_type: category, title: t, starts_at: startsAt, ends_at: endsAt, body }
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
              disabled={busy || (category === 'WORK' && !title.trim())}
            >
              저장 후 계속 추가
            </Button>
          )}
          <Button
            onClick={() => submit(false)}
            disabled={busy || (category === 'WORK' && !title.trim())}
          >
            {busy ? '처리 중…' : isEdit ? '저장' : '저장'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-4 gap-y-3">
        <Row label="구분">
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  'flex-1 rounded-radius-md border py-1.5 text-body font-semibold transition-colors duration-fast',
                  category === c.key
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Row>

        <Row label={category === 'WORK' ? '제목' : '제목(선택)'}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={category === 'WORK' ? '제목을 입력하세요.' : `비우면 '${userName} 휴가'로 등록`}
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
            <label className="flex items-center gap-1.5">
              <Checkbox checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span className="text-body text-gray-800">종일</span>
            </label>
          </div>
        </Row>

        {category === 'WORK' && (
          <>
            <Row label="작성자">
              {/* 작성자는 고정값(제거 불가) — 동행자 칩과 같은 규격을 위해 TagChip을 쓰되 클릭은 막는다. */}
              <TagChip selected tabIndex={-1} className="cursor-default">
                {userName}
              </TagChip>
            </Row>
            <Row label="동행자" tall>
              <CompanionPicker selected={companions} onChange={setCompanions} />
            </Row>
          </>
        )}

        <Row label="내용" tall>
          <TextArea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="내용을 입력하세요."
            rows={3}
          />
        </Row>
      </div>

      {err && <p className="mt-3 text-caption text-danger">{err}</p>}
    </Modal>
  )
}
