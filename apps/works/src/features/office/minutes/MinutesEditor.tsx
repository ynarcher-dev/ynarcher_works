import { BackButton, Button, Input } from '@ynarcher/ui'
import { useState } from 'react'
import { RichTextEditor } from '@/components/RichTextEditor'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import {
  MINUTE_ATTACHMENT_TYPE,
  useSaveMinute,
  type MinuteDetail,
  type MinuteVisibility,
} from '@/features/office/minutes/minutesApi'
import { InternalPersonPicker, type PickerPerson } from '@/features/office/minutes/MinutePeoplePicker'
import { ExternalAttendeePicker } from '@/features/office/minutes/ExternalAttendeePicker'

interface Props {
  /** 수정 대상(신규면 null). */
  initial: MinuteDetail | null
  onSaved: (id: string) => void
  onCancel: () => void
}

const VISIBILITY_OPTS: { value: MinuteVisibility; label: string; help: string }[] = [
  { value: 'PARTICIPANTS', label: '일부공개', help: '작성자와 아래 참석자·참조로 태그된 사람만 열람합니다.' },
  { value: 'OFFICE', label: '전체공개', help: 'OFFICE를 볼 수 있는 임직원 전원이 열람합니다.' },
]

/**
 * 회의록 작성·편집 폼. 2:1 레이아웃 — 좌측에 본문(리치텍스트)·메타·공개범위·참석자,
 * 우측에 파일첨부. 신규는 저장 성공 후 보류 첨부를 일괄 업로드하고, 수정은 즉시 업로드한다.
 */
export function MinutesEditor({ initial, onSaved, onCancel }: Props) {
  const save = useSaveMinute()
  const pending = usePendingMaterials()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [meetingDate, setMeetingDate] = useState(initial?.meetingDate ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [agenda, setAgenda] = useState(initial?.agenda ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [visibility, setVisibility] = useState<MinuteVisibility>(initial?.visibility ?? 'PARTICIPANTS')
  const [people, setPeople] = useState<PickerPerson[]>(
    (initial?.people ?? []).map((p) => ({ userId: p.userId, role: p.role })),
  )
  const [externalAttendees, setExternalAttendees] = useState<string[]>(initial?.externalAttendees ?? [])

  const submit = () => {
    save.mutate(
      {
        id: initial?.id,
        title,
        meetingDate: meetingDate || null,
        location: location || null,
        agenda: agenda || null,
        body: body || null,
        visibility,
        people,
        externalAttendees,
      },
      {
        onSuccess: async (id) => {
          // 신규 등록: 저장으로 id가 생긴 직후 보류 첨부를 일괄 업로드한다.
          if (!initial?.id && pending.count > 0) await pending.flush(id)
          onSaved(id)
        },
      },
    )
  }

  const activeHelp = VISIBILITY_OPTS.find((o) => o.value === visibility)?.help

  return (
    <div className="space-y-5">
      {/* 상단 바 — 게시판 편집과 동일하게 좌측 뒤로가기, 우측 저장. */}
      <div className="flex items-center justify-between">
        <BackButton onClick={onCancel} />
        <Button onClick={submit} disabled={save.isPending || !title.trim()}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* 좌: 본문 2/3. 필드 위 라벨 대신 각 입력의 플레이스홀더로 무엇을 적는지 안내한다. */}
        <div className="space-y-4 lg:col-span-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="회의 제목"
            aria-label="제목"
          />

          <div className="flex flex-wrap gap-3">
            <div className="w-44">
              {/* 날짜 입력은 빈 값에 텍스트 플레이스홀더가 표시되지 않으므로 접근성 라벨만 부여한다. */}
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                aria-label="회의일"
                title="회의일"
              />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="장소 (회의실 등)"
                aria-label="장소"
              />
            </div>
          </div>

          {/* 공개범위: 세그먼트 토글(각 버튼이 스스로를 설명하므로 별도 라벨을 두지 않는다). */}
          <div>
            <div className="flex overflow-hidden rounded-radius-md border border-gray-300">
              {VISIBILITY_OPTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setVisibility(o.value)}
                  className={
                    'flex-1 px-3 py-1.5 text-body transition-colors duration-fast ' +
                    (visibility === o.value
                      ? 'bg-brand text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
            {activeHelp && <p className="mt-1 text-caption text-gray-500">{activeHelp}</p>}
          </div>

          <InternalPersonPicker
            role="ATTENDEE"
            people={people}
            onChange={setPeople}
            placeholder="내부 참석자 검색 후 추가"
          />

          <InternalPersonPicker
            role="REFERENCE"
            people={people}
            onChange={setPeople}
            placeholder="참조 대상 검색 후 추가"
          />

          <ExternalAttendeePicker value={externalAttendees} onChange={setExternalAttendees} />

          <Input
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="주요 안건 (예: 3분기 채용 계획 검토)"
            aria-label="주요 안건"
          />

          <RichTextEditor value={body} onChange={setBody} placeholder="회의 내용을 입력하세요…" />
        </div>

        {/* 우: 파일첨부 1/3 */}
        <div className="space-y-4 lg:col-span-1">
          {initial?.id ? (
            <MaterialPanel targetType={MINUTE_ATTACHMENT_TYPE} targetId={initial.id} title="첨부 파일" />
          ) : (
            <PendingMaterialPanel slot={MINUTE_ATTACHMENT_TYPE} pending={pending} title="첨부 파일" />
          )}
        </div>
      </div>

      {save.isError && (
        <p className="text-caption text-danger">
          {save.error instanceof Error ? save.error.message : '저장에 실패했습니다.'}
        </p>
      )}
    </div>
  )
}
