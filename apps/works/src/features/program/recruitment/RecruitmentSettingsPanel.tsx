import { Badge, Button, Card, Input, Spinner, TextArea, useToast, type BadgeTone } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { ExternalLink, ImageUp, Link2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FieldBuilder } from '@/features/program/recruitment/FieldBuilder'
import { GuideBuilder } from '@/features/program/recruitment/GuideBuilder'
import {
  PRESET_FIELDS,
  applyUrl,
  guideSectionsFromLanding,
  posterUrl,
  uploadPoster,
  useApplicationForm,
  useSetApplicationForm,
  type FormField,
  type GuideSection,
  type LandingContent,
  type PublicStatus,
} from '@/features/program/recruitment/recruitmentHooks'

const STATUS_OPTIONS: { value: PublicStatus; label: string }[] = [
  { value: 'PRIVATE', label: '비공개' },
  { value: 'OPEN', label: '공개 모집중' },
  { value: 'CLOSED', label: '마감' },
]

/** datetime-local 입력 공통 스타일(UI Input과 시각적 정합). */
const DATETIME_CLS =
  'h-11 rounded-radius-md border border-gray-300 bg-white px-3 text-body text-gray-900 shadow-soft ' +
  'transition-all duration-fast hover:border-gray-400 focus-visible:outline-none focus-visible:border-brand/50'

/** ISO 문자열 → datetime-local 입력값(로컬 시간, 분 단위). */
const toDatetimeInput = (iso: string | null): string => (iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm') : '')
/** datetime-local 입력값(로컬) → ISO 문자열. 빈 값이면 null. */
const fromDatetimeInput = (local: string): string | null => (local ? dayjs(local).toISOString() : null)

/**
 * 공개 상태 + 공개 기간으로 "지금 실제로 공개 중인지"를 계산한다(서버 게이트와 동일 규칙).
 * 운영자에게 현재 노출 상태를 배지로 알려주기 위한 표시용.
 */
function effectiveStatus(
  status: PublicStatus,
  openAt: string | null,
  closeAt: string | null,
): { label: string; tone: BadgeTone } {
  if (status === 'PRIVATE') return { label: '비공개', tone: 'neutral' }
  if (status === 'CLOSED') return { label: '마감', tone: 'neutral' }
  const now = dayjs()
  if (openAt && now.isBefore(dayjs(openAt))) return { label: '시작 예정', tone: 'warning' }
  if (closeAt && now.isAfter(dayjs(closeAt))) return { label: '기간 종료(마감)', tone: 'neutral' }
  return { label: '공개중', tone: 'success' }
}

/** 라벨 + 입력 래퍼(전 페이지 공통 필드 규격). */
function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-caption font-medium text-gray-600" htmlFor={htmlFor}>
        {label}
        {hint && <span className="ml-1 font-normal text-gray-600">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/**
 * 모집 설정(폼빌더): 3블록 구성 — 기본 세팅(상태·URL·제목·포스터) /
 * 안내 설정(커스터마이즈 안내 섹션 + 문의처) / 신청 설정(신청 항목 빌더).
 * 최초 저장 시 신청서가 생성되고 공개 URL 토큰이 발급된다(set_application_form).
 */
export function RecruitmentSettingsPanel({
  programId,
  moduleId,
}: {
  programId: string
  moduleId: string
}) {
  const toast = useToast()
  const { data: form, isLoading } = useApplicationForm(moduleId)
  const save = useSetApplicationForm(programId, moduleId)
  const fileRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<PublicStatus>('PRIVATE')
  const [openAt, setOpenAt] = useState<string | null>(null)
  const [closeAt, setCloseAt] = useState<string | null>(null)
  const [landing, setLanding] = useState<LandingContent>({})
  const [sections, setSections] = useState<GuideSection[]>([])
  const [fields, setFields] = useState<FormField[]>(PRESET_FIELDS.map((f) => ({ ...f })))
  const [uploading, setUploading] = useState(false)
  // 로드된 폼으로 로컬 상태 동기화(신규면 프리셋 유지). form.id 변경 시 1회.
  const syncedId = useRef<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    const key = form?.id ?? 'new'
    if (syncedId.current === key) return
    syncedId.current = key
    setStatus(form?.public_status ?? 'PRIVATE')
    setOpenAt(form?.open_at ?? null)
    setCloseAt(form?.close_at ?? null)
    setLanding(form?.landing ?? {})
    setSections(guideSectionsFromLanding(form?.landing ?? {}))
    setFields(form ? form.fields.map((f) => ({ ...f })) : PRESET_FIELDS.map((f) => ({ ...f })))
  }, [form, isLoading])

  if (isLoading) return <Spinner />

  const url = applyUrl(form?.public_token)
  const poster = posterUrl(landing.poster_path)
  const eff = effectiveStatus(status, openAt, closeAt)
  const patchLanding = (part: Partial<LandingContent>) => setLanding((prev) => ({ ...prev, ...part }))

  const onPickPoster = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const path = await uploadPoster(moduleId, file)
      patchLanding({ poster_path: path })
      toast.show('포스터를 업로드했습니다. 저장을 눌러 반영하세요.', 'success')
    } catch {
      toast.show('포스터 업로드에 실패했습니다.', 'danger')
    } finally {
      setUploading(false)
    }
  }

  const onSave = async () => {
    if (fields.some((f) => !f.label.trim())) {
      toast.show('이름이 비어 있는 신청 항목이 있습니다.', 'warning')
      return
    }
    if (sections.some((s) => !s.title.trim())) {
      toast.show('제목이 비어 있는 안내 섹션이 있습니다.', 'warning')
      return
    }
    if (openAt && closeAt && !dayjs(closeAt).isAfter(dayjs(openAt))) {
      toast.show('모집 마감 일시는 시작 일시보다 뒤여야 합니다.', 'warning')
      return
    }
    try {
      // sections를 SSOT로 저장하고 레거시 안내 키는 제거한다(중복 방지).
      const { overview: _o, schedule: _s, target: _t, doc_guide: _d, ...rest } = landing
      await save.mutateAsync({
        formId: form?.id ?? null,
        title: landing.landing_title?.trim() || '모집 신청서',
        publicStatus: status,
        openAt,
        closeAt,
        landing: { ...rest, sections },
        fields,
      })
      toast.show('모집 설정을 저장했습니다.', 'success')
    } catch {
      toast.show('저장에 실패했습니다. 권한과 입력값을 확인하세요.', 'danger')
    }
  }

  const copyUrl = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.show('공개 URL을 복사했습니다.', 'success')
    } catch {
      toast.show('복사에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. 기본 세팅 */}
      <Card
        title="기본 세팅"
        subtitle="공개 상태·배포 URL·랜딩 제목·포스터를 설정합니다. 최초 저장 시 공개 URL이 생성됩니다."
      >
        <div className="space-y-5">
          <Field label="공개 상태">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-radius-md border border-gray-300 p-0.5">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setStatus(o.value)}
                    className={`rounded-radius-sm px-3.5 py-1.5 text-caption font-medium transition-colors duration-fast ${
                      status === o.value ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-25'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span className="inline-flex items-center gap-1.5 text-caption text-gray-600">
                현재 <Badge tone={eff.tone}>{eff.label}</Badge>
              </span>
            </div>
          </Field>

          <Field
            label="모집 기간"
            hint="(공개 모집중일 때 이 기간에만 자동으로 열립니다 · 비우면 무기한)"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                aria-label="모집 시작 일시"
                className={DATETIME_CLS}
                value={toDatetimeInput(openAt)}
                onChange={(e) => setOpenAt(fromDatetimeInput(e.target.value))}
              />
              <span className="text-body text-gray-400">~</span>
              <input
                type="datetime-local"
                aria-label="모집 마감 일시"
                className={DATETIME_CLS}
                value={toDatetimeInput(closeAt)}
                onChange={(e) => setCloseAt(fromDatetimeInput(e.target.value))}
              />
              {(openAt || closeAt) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenAt(null)
                    setCloseAt(null)
                  }}
                  className="text-caption text-gray-600 underline-offset-2 hover:text-gray-600 hover:underline"
                >
                  기간 지우기
                </button>
              )}
            </div>
          </Field>

          <Field label="공개 URL">
            {url ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={url} className="min-w-0 flex-1 text-caption" />
                <Button variant="secondary" type="button" onClick={copyUrl}>
                  <Link2 className="mr-1 h-3.5 w-3.5" /> URL 복사
                </Button>
                <a href={url} target="_blank" rel="noreferrer">
                  <Button variant="secondary" type="button">
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> 새 탭에서 열기
                  </Button>
                </a>
              </div>
            ) : (
              <p className="rounded-radius-md border border-gray-200 bg-gray-25 px-3.5 py-2.5 text-caption text-gray-500">
                저장하면 배포용 공개 URL이 생성됩니다.
              </p>
            )}
          </Field>

          <Field label="랜딩 제목" htmlFor="lp-title">
            <Input
              id="lp-title"
              placeholder="예: 2026 글로벌 액셀러레이팅 참여기업 모집"
              value={landing.landing_title ?? ''}
              onChange={(e) => patchLanding({ landing_title: e.target.value })}
            />
          </Field>

          <Field label="포스터 이미지" hint="(JPG·PNG·WEBP · 최대 5MB)">
            <div className="flex items-start gap-4">
              <div className="grid h-40 w-32 shrink-0 place-items-center overflow-hidden rounded-radius-md border border-gray-200 bg-gray-25">
                {poster ? (
                  <img src={poster} alt="모집 포스터" className="h-full w-full object-cover" />
                ) : (
                  <ImageUp className="h-6 w-6 text-gray-300" />
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void onPickPoster(e.target.files?.[0])}
              />
              <Button
                variant="secondary"
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? '업로드 중…' : '포스터 변경'}
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      {/* 2. 안내 설정 */}
      <Card
        title="안내 설정"
        subtitle="공개 신청 페이지에 노출될 안내 문구를 구성합니다. 섹션은 자유롭게 추가·정렬할 수 있습니다."
      >
        <div className="space-y-5">
          <GuideBuilder sections={sections} onChange={setSections} />

          <div className="space-y-5 border-t border-gray-100 pt-5">
            <Field label="문의처" hint="(선택 · 공개 페이지 하단 노출)" htmlFor="lp-contact">
              <TextArea
                id="lp-contact"
                rows={2}
                placeholder="와이앤아처(주) 스케일업그룹 1팀&#10;070-0000-0000"
                value={landing.contact ?? ''}
                onChange={(e) => patchLanding({ contact: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* 3. 신청 설정 */}
      <Card
        title="신청 설정"
        subtitle="지원자가 작성할 신청 항목과 개인정보 동의 문구를 구성합니다."
        actions={<Badge tone="neutral">{`항목 ${fields.length}`}</Badge>}
      >
        <div className="space-y-5">
          <Field
            label="개인정보 수집·이용 동의 문구"
            hint="(동의 체크 영역에 노출)"
            htmlFor="lp-privacy"
          >
            <TextArea
              id="lp-privacy"
              rows={3}
              placeholder="수집 항목·목적·보유기간을 안내합니다."
              value={landing.privacy_consent_text ?? ''}
              onChange={(e) => patchLanding({ privacy_consent_text: e.target.value })}
            />
          </Field>

          <div className="border-t border-gray-100 pt-5">
            <FieldBuilder fields={fields} onChange={setFields} />
          </div>
        </div>
      </Card>

      {/* 저장 바 */}
      <div className="flex justify-end">
        <Button type="button" onClick={() => void onSave()} disabled={save.isPending || uploading}>
          {save.isPending ? '저장 중…' : '모집 설정 저장'}
        </Button>
      </div>
    </div>
  )
}
