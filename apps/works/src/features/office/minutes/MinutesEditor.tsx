import { BackButton, Button, DetailTopBar, formText } from '@ynarcher/ui'
import { useState } from 'react'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import {
  MINUTE_ATTACHMENT_TYPE,
  MINUTE_VOICE_ATTACHMENT_TYPE,
  useSaveMinute,
  type MinuteDetail,
  type MinuteVisibility,
} from '@/features/office/minutes/minutesApi'
import { MinuteFormFields } from '@/features/office/minutes/MinuteFormFields'
import type { PickerPerson } from '@/features/office/minutes/MinutePeoplePicker'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'
import { VoiceMinutePanel } from '@/features/office/minutes/voice/VoiceMinutePanel'
import type { MinuteDraft } from '@/features/office/minutes/voice/voiceMinuteApi'
import { attachRecording } from '@/features/office/minutes/voice/recordingApi'

interface Props {
  /** 수정 대상(신규면 null). */
  initial: MinuteDetail | null
  onSaved: (id: string) => void
  onCancel: () => void
}

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
  const [externalPeople, setExternalPeople] = useState<MinuteLink[]>(initial?.externalPeople ?? [])
  const [externalAttendees, setExternalAttendees] = useState<string[]>(initial?.externalAttendees ?? [])
  const [links, setLinks] = useState<MinuteLink[]>(initial?.links ?? [])
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [recordingActive, setRecordingActive] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  /** 음성 초안(STT)에 힌트로 넘길 외부 참석자 이름 — 참조든 옛 표기든 화면에 적힌 이름 그대로. */
  const externalNames = [
    ...externalPeople.map((p) => p.label ?? ''),
    ...externalAttendees,
  ].filter(Boolean)

  const submit = () => {
    setSubmitError(null)
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
        externalPeople: externalPeople.map((l) => ({
          targetType: l.targetType,
          targetId: l.targetId,
        })),
        links: links.map((l) => ({ targetType: l.targetType, targetId: l.targetId })),
      },
      {
        onSuccess: async (id) => {
          try {
            // 분할 녹음은 이미 안전 저장돼 있고, 신규 회의록이면 여기서 논리 세션만 연결한다.
            if (recordingId && !initial?.id) await attachRecording(recordingId, id)
            if (pending.count > 0) {
              const result = await pending.flush(id)
              if (result.failed > 0) throw new Error(`첨부 ${result.failed}건 저장에 실패했습니다. 다시 저장해 주세요.`)
            }
            onSaved(id)
          } catch (error) {
            setSubmitError(error instanceof Error ? error.message : '녹음 또는 첨부 연결에 실패했습니다.')
          }
        },
      },
    )
  }

  // AI 초안 반영: 비어 있는 필드만 채우고, 본문은 기존 내용을 덮지 않도록 뒤에 잇는다.
  const applyDraft = (draft: MinuteDraft): (() => void) => {
    const before = { title, agenda, body }
    if (draft.title && !title.trim()) setTitle(draft.title)
    if (draft.agenda && !agenda.trim()) setAgenda(draft.agenda)
    if (draft.body) {
      const hasBody = body.replace(/<[^>]*>/g, '').trim().length > 0
      setBody(hasBody ? `${body}${draft.body}` : draft.body)
    }
    return () => {
      setTitle(before.title)
      setAgenda(before.agenda)
      setBody(before.body)
    }
  }

  // 한 번의 편집에서 새로 담는 녹음은 한 건이다. 다른 파일을 고르면 아직 저장되지 않은 앞 파일을
  // 교체하고, 서버에 이미 저장된 녹음은 건드리지 않는다.
  const queueAudio = (file: File) => {
    const current = pending.files(MINUTE_VOICE_ATTACHMENT_TYPE)
    for (let i = current.length - 1; i >= 0; i -= 1) pending.remove(MINUTE_VOICE_ATTACHMENT_TYPE, i)
    pending.add(MINUTE_VOICE_ATTACHMENT_TYPE, [file])
  }

  const removeQueuedAudio = () => {
    const current = pending.files(MINUTE_VOICE_ATTACHMENT_TYPE)
    for (let i = current.length - 1; i >= 0; i -= 1) pending.remove(MINUTE_VOICE_ATTACHMENT_TYPE, i)
  }

  const cancel = () => {
    if (recordingActive && !window.confirm('녹음 중입니다. 지금 나가면 현재 5분 구간은 저장되지 않을 수 있습니다. 나가시겠습니까?')) return
    onCancel()
  }

  return (
    <div className="space-y-5">
      {/* 상단 바 — 게시판 편집과 동일하게 좌측 뒤로가기, 우측 저장.
          한 줄 규격은 화면이 아니라 공용 `DetailTopBar`가 갖는다. */}
      <DetailTopBar
        back={<BackButton onClick={cancel} />}
        actions={
          <Button onClick={submit} disabled={save.isPending || recordingActive || !title.trim()}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <MinuteFormFields
          title={title}
          onTitleChange={setTitle}
          meetingDate={meetingDate}
          onMeetingDateChange={setMeetingDate}
          location={location}
          onLocationChange={setLocation}
          visibility={visibility}
          onVisibilityChange={setVisibility}
          people={people}
          onPeopleChange={setPeople}
          externalPeople={externalPeople}
          onExternalPeopleChange={setExternalPeople}
          externalAttendees={externalAttendees}
          onExternalAttendeesChange={setExternalAttendees}
          links={links}
          onLinksChange={setLinks}
          agenda={agenda}
          onAgendaChange={setAgenda}
          body={body}
          onBodyChange={setBody}
        />

        {/* 우: 일반 첨부 + 녹음·전사·AI 초안 통합 패널 1/3 */}
        <div className="space-y-4 lg:col-span-1">
          {initial?.id ? (
            <MaterialPanel targetType={MINUTE_ATTACHMENT_TYPE} targetId={initial.id} title="첨부 파일" />
          ) : (
            <PendingMaterialPanel slot={MINUTE_ATTACHMENT_TYPE} pending={pending} title="첨부 파일" />
          )}

          <VoiceMinutePanel
            context={{ title, meetingDate, attendees: externalNames, agenda }}
            onApplyDraft={applyDraft}
            onRecordingReady={setRecordingId}
            onRecordingStateChange={setRecordingActive}
            targetId={initial?.id}
            queuedAudio={pending.files(MINUTE_VOICE_ATTACHMENT_TYPE)[0] ?? null}
            onQueueAudio={queueAudio}
            onRemoveQueuedAudio={removeQueuedAudio}
          />
        </div>
      </div>

      {save.isError && (
        <p className={formText.error}>
          {save.error instanceof Error ? save.error.message : '저장에 실패했습니다.'}
        </p>
      )}
      {submitError && <p className={formText.error}>{submitError}</p>}
    </div>
  )
}
