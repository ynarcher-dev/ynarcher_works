import { Badge, Button, Card, Input, Spinner, TextArea, useToast } from '@ynarcher/ui'
import { ExternalLink, ImageUp, Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FieldBuilder } from '@/features/ac/recruitment/FieldBuilder'
import {
  PRESET_FIELDS,
  applyUrl,
  posterUrl,
  uploadPoster,
  useApplicationForm,
  useSetApplicationForm,
  type FormField,
  type LandingContent,
  type PublicStatus,
} from '@/features/ac/recruitment/recruitmentHooks'

const STATUS_OPTIONS: { value: PublicStatus; label: string }[] = [
  { value: 'PRIVATE', label: '비공개' },
  { value: 'OPEN', label: '공개 모집중' },
  { value: 'CLOSED', label: '마감' },
]

/** 랜딩 장문 텍스트 항목(단일 소스). landing_title만 별도 단문 입력. */
const LANDING_FIELDS: { key: keyof LandingContent; label: string; rows: number; placeholder: string }[] = [
  { key: 'overview', label: '모집 개요', rows: 4, placeholder: '사업 소개·모집 취지를 안내합니다.' },
  { key: 'schedule', label: '모집/사업 일정', rows: 3, placeholder: '- 서류 평가 기간 : ...' },
  { key: 'target', label: '지원 대상', rows: 3, placeholder: '- 전담기업·아이템·투자검증 ...' },
  { key: 'doc_guide', label: '제출 서류 안내 (한 줄에 하나)', rows: 3, placeholder: '사업자등록증\n회사소개서' },
  { key: 'privacy_consent_text', label: '개인정보 수집·이용 동의 문구', rows: 3, placeholder: '수집 항목·목적·보유기간을 안내합니다.' },
  { key: 'contact', label: '문의처 (선택)', rows: 2, placeholder: '와이앤아처(주) 스케일업그룹 1팀\n070-0000-0000' },
]

/**
 * 모집 설정(폼빌더): 공개 상태·배포 URL·포스터·랜딩 콘텐츠 + 신청 항목 빌더.
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
  const [landing, setLanding] = useState<LandingContent>({})
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
    setLanding(form?.landing ?? {})
    setFields(form ? form.fields.map((f) => ({ ...f })) : PRESET_FIELDS.map((f) => ({ ...f })))
  }, [form, isLoading])

  if (isLoading) return <Spinner />

  const url = applyUrl(form?.public_token)
  const poster = posterUrl(landing.poster_path)
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
    try {
      await save.mutateAsync({
        formId: form?.id ?? null,
        title: landing.landing_title?.trim() || '모집 신청서',
        publicStatus: status,
        landing,
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
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-body font-semibold text-gray-900">모집 설정</h3>
          <p className="text-caption text-gray-500">
            포스터·모집 안내·제출 서류·개인정보 문구를 설정합니다. 최초 저장 시 공개 URL이 생성됩니다.
          </p>
        </div>
        <Badge tone="neutral" size="sm">{`콘텐츠 ${fields.length}`}</Badge>
      </div>

      {/* 공개 상태 세그먼트 */}
      <div className="flex items-center gap-3">
        <span className="text-body font-medium text-gray-800">공개 상태</span>
        <div className="inline-flex rounded-radius-md border border-gray-300 p-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatus(o.value)}
              className={`rounded-radius-sm px-3 py-1 text-caption font-medium transition-colors duration-fast ${
                status === o.value ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-25'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 공개 URL */}
      <div>
        <span className="text-body font-medium text-gray-800">공개 URL</span>
        {url ? (
          <div className="mt-1 flex items-center gap-2">
            <Input readOnly value={url} className="flex-1 text-caption" />
            <Button variant="secondary" size="sm" type="button" onClick={copyUrl}>
              <Link2 className="mr-1 h-3.5 w-3.5" /> URL 복사
            </Button>
            <a href={url} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm" type="button">
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> 새 탭에서 열기
              </Button>
            </a>
          </div>
        ) : (
          <p className="mt-1 rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-500">
            저장하면 배포용 공개 URL이 생성됩니다.
          </p>
        )}
      </div>

      {/* 랜딩 제목 */}
      <div>
        <label className="text-body font-medium text-gray-800" htmlFor="lp-title">
          랜딩 제목
        </label>
        <Input
          id="lp-title"
          placeholder="예: 2026 글로벌 액셀러레이팅 참여기업 모집"
          value={landing.landing_title ?? ''}
          onChange={(e) => patchLanding({ landing_title: e.target.value })}
        />
      </div>

      {/* 포스터 */}
      <div>
        <span className="text-body font-medium text-gray-800">포스터 이미지</span>
        <div className="mt-1 flex items-start gap-3">
          <div className="grid h-40 w-32 shrink-0 place-items-center overflow-hidden rounded-radius-md border border-gray-200 bg-gray-25">
            {poster ? (
              <img src={poster} alt="모집 포스터" className="h-full w-full object-cover" />
            ) : (
              <ImageUp className="h-6 w-6 text-gray-300" />
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void onPickPoster(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? '업로드 중…' : '포스터 변경'}
            </Button>
            <p className="text-caption text-gray-400">JPG·PNG·WEBP · 최대 5MB</p>
          </div>
        </div>
      </div>

      {/* 랜딩 장문 콘텐츠 */}
      {LANDING_FIELDS.map((lf) => (
        <div key={lf.key}>
          <label className="text-body font-medium text-gray-800" htmlFor={`lp-${lf.key}`}>
            {lf.label}
          </label>
          <TextArea
            id={`lp-${lf.key}`}
            rows={lf.rows}
            placeholder={lf.placeholder}
            value={landing[lf.key] ?? ''}
            onChange={(e) => patchLanding({ [lf.key]: e.target.value })}
          />
        </div>
      ))}

      <div className="border-t border-gray-100 pt-3">
        <FieldBuilder fields={fields} onChange={setFields} />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void onSave()} disabled={save.isPending || uploading}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </Card>
  )
}
