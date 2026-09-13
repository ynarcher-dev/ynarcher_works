import { Card, Field, Input, SegmentedToggle } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { RichTextEditor } from '@/components/RichTextEditor'
import { ExternalAttendeePicker } from '@/features/office/minutes/ExternalAttendeePicker'
import { MinuteLinkPicker } from '@/features/office/minutes/MinuteLinkPicker'
import { InternalPersonPicker, type PickerPerson } from '@/features/office/minutes/MinutePeoplePicker'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'
import type { MinuteVisibility } from '@/features/office/minutes/minutesApi'

const VISIBILITY_OPTS: { value: MinuteVisibility; label: string; help: string }[] = [
  { value: 'PARTICIPANTS', label: '비공개', help: '작성자와 아래 참석자·참조로 태그된 사람만 열람합니다.' },
  { value: 'OFFICE', label: '전체공개', help: 'OFFICE를 볼 수 있는 임직원 전원이 열람합니다.' },
]

function FormSection({
  title,
  help,
  children,
}: {
  title: string
  help?: ReactNode
  children: ReactNode
}) {
  return (
    <Card title={title} help={help} bodyClassName="space-y-4">
      {children}
    </Card>
  )
}

interface Props {
  title: string
  onTitleChange: (value: string) => void
  meetingDate: string
  onMeetingDateChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  visibility: MinuteVisibility
  onVisibilityChange: (value: MinuteVisibility) => void
  people: PickerPerson[]
  onPeopleChange: (value: PickerPerson[]) => void
  externalPeople: MinuteLink[]
  onExternalPeopleChange: (value: MinuteLink[]) => void
  externalAttendees: string[]
  onExternalAttendeesChange: (value: string[]) => void
  links: MinuteLink[]
  onLinksChange: (value: MinuteLink[]) => void
  agenda: string
  onAgendaChange: (value: string) => void
  body: string
  onBodyChange: (value: string) => void
}

/** 회의록 왼쪽 입력을 사용 순서에 따라 다섯 섹션으로 묶는다. */
export function MinuteFormFields(props: Props) {
  const activeHelp = VISIBILITY_OPTS.find((option) => option.value === props.visibility)?.help

  return (
    <div className="space-y-6 lg:col-span-2">
      <FormSection title="회의 정보">
        <Field label="회의 제목" required>
          <Input value={props.title} onChange={(e) => props.onTitleChange(e.target.value)} placeholder="회의 제목" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Field label="회의일" className="w-44">
            <Input
              type="date"
              value={props.meetingDate}
              onChange={(e) => props.onMeetingDateChange(e.target.value)}
            />
          </Field>
          <Field label="장소" className="min-w-0 flex-1">
            <Input
              value={props.location}
              onChange={(e) => props.onLocationChange(e.target.value)}
              placeholder="장소 (회의실 등)"
            />
          </Field>
        </div>
        <Field label="주요 안건">
          <Input
            value={props.agenda}
            onChange={(e) => props.onAgendaChange(e.target.value)}
            placeholder="예: 3분기 채용 계획 검토"
          />
        </Field>
      </FormSection>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <FormSection title="참석자">
          <Field label="내부 참석자" as="div">
            <InternalPersonPicker
              role="ATTENDEE"
              people={props.people}
              onChange={props.onPeopleChange}
              placeholder="내부 참석자 검색 후 추가"
              searchTitle="내부 참석자 검색"
            />
          </Field>
          <Field label="외부 참석자" as="div">
            <ExternalAttendeePicker
              people={props.externalPeople}
              onPeopleChange={props.onExternalPeopleChange}
              legacyNames={props.externalAttendees}
              onLegacyChange={props.onExternalAttendeesChange}
            />
          </Field>
        </FormSection>

        <FormSection
          title="열람 설정"
          help="참조는 회의 참석자가 아니라 비공개 회의록을 함께 볼 사람입니다."
        >
          <Field label="공개범위" hint={activeHelp} as="div">
            <SegmentedToggle
              label="공개범위"
              options={VISIBILITY_OPTS.map((option) => ({ key: option.value, label: option.label }))}
              value={props.visibility}
              onChange={props.onVisibilityChange}
            />
          </Field>
          <Field label="참조" as="div">
            <InternalPersonPicker
              role="REFERENCE"
              people={props.people}
              onChange={props.onPeopleChange}
              placeholder={
                props.visibility === 'OFFICE'
                  ? '전체공개 회의록은 참조가 필요 없습니다'
                  : '참조 대상 검색 후 추가'
              }
              searchTitle="참조 대상 검색"
              disabled={props.visibility === 'OFFICE'}
            />
          </Field>
        </FormSection>
      </div>

      <FormSection title="관련 업무">
        <Field
          label="연동 대상"
          hint="관련 프로젝트·스타트업·네트워크를 연결하면 상호 참조됩니다. 비워 두면 일반 회의록입니다."
          as="div"
        >
          <MinuteLinkPicker value={props.links} onChange={props.onLinksChange} />
        </Field>
      </FormSection>

      <Field label="회의 내용" as="div">
        <RichTextEditor value={props.body} onChange={props.onBodyChange} placeholder="회의 내용을 입력하세요…" />
      </Field>
    </div>
  )
}
