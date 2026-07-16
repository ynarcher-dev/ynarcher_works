import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 신청 필드 타입. select=단일선택, file=서류 제출, consent=동의 체크. */
export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'consent'

/** 파일 필드 제약(제출 서류). accept는 input accept 문자열, max_mb는 상한. */
export interface FileConstraints {
  accept?: string
  max_mb?: number
}

/** 신청서 필드 1개(application_form_fields 행과 1:1). id 없으면 신규. */
export interface FormField {
  id?: string
  field_type: FieldType
  label: string
  is_required: boolean
  options: string[]
  file_constraints: FileConstraints
  sort_order: number
}

/** 랜딩 콘텐츠(application_forms.landing jsonb). 운영자가 쓰는 공개 안내 텍스트. */
export interface LandingContent {
  landing_title?: string
  poster_path?: string
  overview?: string
  schedule?: string
  target?: string
  doc_guide?: string
  privacy_consent_text?: string
  contact?: string
}

/** 공개 상태: 비공개 / 공개 모집중 / 마감. */
export type PublicStatus = 'PRIVATE' | 'OPEN' | 'CLOSED'

export interface ApplicationForm {
  id: string
  program_id: string
  program_module_id: string | null
  title: string
  public_token: string | null
  public_status: PublicStatus
  landing: LandingContent
  fields: FormField[]
}

/**
 * 프리셋 표준 항목(레퍼런스 기준). 인스턴스 최초 편집 시 시드로 채우고,
 * 프로젝트별로 켜기/끄기·추가·정렬·필수토글·고유 서류를 자유롭게 조정한다.
 */
export const PRESET_FIELDS: FormField[] = [
  { field_type: 'text', label: '기업명', is_required: true, options: [], file_constraints: {}, sort_order: 0 },
  { field_type: 'text', label: '담당자명', is_required: true, options: [], file_constraints: {}, sort_order: 1 },
  { field_type: 'tel', label: '연락처', is_required: true, options: [], file_constraints: {}, sort_order: 2 },
  { field_type: 'email', label: '이메일', is_required: true, options: [], file_constraints: {}, sort_order: 3 },
  { field_type: 'select', label: '사업분야', is_required: false, options: [], file_constraints: {}, sort_order: 4 },
  {
    field_type: 'file',
    label: '회사소개서',
    is_required: false,
    options: [],
    file_constraints: { accept: '.pdf,.ppt,.pptx', max_mb: 20 },
    sort_order: 5,
  },
  {
    field_type: 'consent',
    label: '개인정보 수집·이용 동의',
    is_required: true,
    options: [],
    file_constraints: {},
    sort_order: 6,
  },
]

/** 필드 타입 표시 라벨. */
export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: '단문 텍스트',
  textarea: '장문 텍스트',
  email: '이메일',
  tel: '연락처',
  select: '단일 선택',
  file: '파일(서류)',
  consent: '동의 체크',
}

const POSTER_BUCKET = 'program-posters'

const FORM_COLS =
  'id, program_id, program_module_id, title, public_token, public_status, landing, ' +
  'fields:application_form_fields(id, field_type, label, is_required, options, file_constraints, sort_order)'

/** 모집 인스턴스(program_module_id)에 연결된 신청서 + 필드 조회. 없으면 null(미생성). */
export function useApplicationForm(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'appform', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<ApplicationForm | null> => {
      const { data, error } = await supabase
        .from('application_forms')
        .select(FORM_COLS)
        .eq('program_module_id', moduleId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as ApplicationForm & { fields?: FormField[] }
      return {
        ...row,
        landing: (row.landing ?? {}) as LandingContent,
        fields: [...(row.fields ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      }
    },
  })
}

/** 신청서 저장(생성/수정) — set_application_form RPC. {id, public_token} 반환. */
export function useSetApplicationForm(programId: string, moduleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      formId: string | null
      title: string
      publicStatus: PublicStatus
      landing: LandingContent
      fields: FormField[]
    }): Promise<{ id: string; public_token: string }> => {
      const { data, error } = await supabase.rpc('set_application_form', {
        p_program_id: programId,
        p_program_module_id: moduleId,
        p_form_id: input.formId,
        p_title: input.title,
        p_public_status: input.publicStatus,
        p_landing: input.landing,
        // sort_order를 배열 순서로 재정렬해 전송(드래그·이동 결과 반영).
        p_fields: input.fields.map((f, i) => ({ ...f, sort_order: i })),
      })
      if (error) throw error
      return data as { id: string; public_token: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ac', 'appform', moduleId] }),
  })
}

/** 파일명을 Storage 키 안전 문자열로 변환. */
function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

/** 포스터 업로드(공개 버킷) → 저장 경로 반환. landing.poster_path에 보관한다. */
export async function uploadPoster(moduleId: string, file: File): Promise<string> {
  const path = `${moduleId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return path
}

/** 포스터 저장 경로 → 공개 URL(없으면 null). */
export function posterUrl(path: string | undefined | null): string | null {
  if (!path) return null
  return supabase.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl
}

/** 공개 신청 랜딩 URL(/apply/:token). 배포 오리진은 환경변수, 없으면 현재 오리진. */
export function applyUrl(token: string | null | undefined): string | null {
  if (!token) return null
  const base =
    (import.meta.env.VITE_APPLY_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
    `${window.location.origin}/apply`
  return `${base}/${token}`
}
