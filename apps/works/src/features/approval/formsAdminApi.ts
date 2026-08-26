import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FormField } from '@/features/approval/fields'

interface FormMeta {
  name: string
  category: string
  abbrev: string
  retention: string
  security_grade: string
  sort_order: number
}

/** 양식 신설 + 버전 1 발행. 쓰기 권한(admin)은 RLS가 강제한다. */
export function useCreateApprovalForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: FormMeta & { fields: FormField[] }): Promise<string> => {
      const { data: form, error } = await supabase
        .from('approval_forms')
        .insert({
          name: v.name,
          category: v.category,
          abbrev: v.abbrev,
          retention: v.retention,
          security_grade: v.security_grade,
          sort_order: v.sort_order,
        })
        .select('id')
        .single()
      if (error) throw error

      const versionId = await insertVersion(form.id as string, 1, v.fields)
      const { error: ue } = await supabase
        .from('approval_forms')
        .update({ current_version_id: versionId })
        .eq('id', form.id)
      if (ue) throw ue
      return form.id as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'forms'] })
    },
  })
}

async function insertVersion(
  formId: string,
  versionNo: number,
  fields: FormField[],
): Promise<string> {
  const { data, error } = await supabase
    .from('approval_form_versions')
    .insert({ form_id: formId, version_no: versionNo, fields })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

/**
 * 양식 수정. 이름·보존연한 같은 메타는 제자리에서 고치지만, **필드 스키마를 고치면
 * 언제나 새 버전을 발행한다** — 버전 행은 불변이고(UPDATE 정책 없음), 과거 문서는
 * 자기 기안 시점 버전을 계속 가리켜야 내용이 깨지지 않는다.
 */
export function useUpdateApprovalForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      id: string
      meta: FormMeta
      /** 지정 시 새 버전을 발행하고 현재 버전으로 올린다. */
      fields?: FormField[]
      /** 현재 최신 버전 번호(새 버전 = +1). */
      latestVersionNo?: number
    }) => {
      const patch: Record<string, unknown> = { ...v.meta }
      if (v.fields) {
        patch.current_version_id = await insertVersion(
          v.id,
          (v.latestVersionNo ?? 0) + 1,
          v.fields,
        )
      }
      const { error } = await supabase.from('approval_forms').update(patch).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'forms'] })
    },
  })
}

/**
 * 양식 활성/비활성. 비활성 양식은 새 기안에서 고를 수 없지만 그 양식으로 이미 쓴 문서는
 * 그대로 열린다(물리 삭제 금지 — 과거 문서의 스키마가 사라지면 내용을 그릴 수 없다).
 */
export function useSetApprovalFormActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('approval_forms')
        .update({ is_active: v.isActive })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approval', 'forms'] })
    },
  })
}
