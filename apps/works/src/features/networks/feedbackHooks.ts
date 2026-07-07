import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** public.entity_feedback 레코드(피드백 패널 표시 단위). */
export interface Feedback {
  id: string
  target_type: string
  target_id: string
  author_id: string | null
  author_name: string | null
  body: string
  created_at: string
}

/** 레코드에 달린 피드백 목록(미삭제, 오래된 순 = 스레드 순서). */
export function useFeedback(targetType: string, targetId: string | undefined) {
  return useQuery({
    queryKey: ['feedback', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<Feedback[]> => {
      const { data, error } = await supabase
        .from('entity_feedback')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Feedback[]
    },
  })
}

/** 피드백 작성. author_id·author_name은 서버 트리거가 현재 유저로 스탬프한다. */
export function useCreateFeedback(targetType: string, targetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string): Promise<void> => {
      const { error } = await supabase.from('entity_feedback').insert({
        target_type: targetType,
        target_id: targetId,
        body,
      })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['feedback', targetType, targetId] }),
  })
}

/** 피드백 소프트 삭제(작성자/admin만, RLS 강제). 물리 삭제 금지. */
export function useDeleteFeedback(targetType: string, targetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('entity_feedback')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['feedback', targetType, targetId] }),
  })
}
