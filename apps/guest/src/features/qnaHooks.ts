import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 사업 QNA(1:1 문의함) — 게스트 쪽. **게스트 쓰기가 콘텐츠 원장에 열리는 첫 자리**다
 * (기존 게스트 쓰기는 예약·만족도·평가뿐). 본인 질문만 돌아온다는 판정은 화면이 아니라
 * RLS(program_questions_guest_select — created_by 본인 + 세션 고정 사업)가 하며,
 * INSERT도 본인 명의·세션 사업·답변 열 비움을 정책이 강제한다.
 */

/** 내 질문 1건. answer_body가 비어 있으면 답변 대기다. */
export interface GuestQuestion {
  id: string
  title: string
  body: string | null
  answer_body: string | null
  answered_at: string | null
  created_at: string
}

/** 내가 올린 질문 목록(최신순). */
export function useMyQuestions() {
  const client = useGuestClient()
  const programId = useGuestStore((s) => s.program)?.id
  return useQuery({
    queryKey: ['guest', 'my-questions', programId],
    enabled: Boolean(client && programId),
    queryFn: async (): Promise<GuestQuestion[]> => {
      const { data, error } = await client!
        .from('program_questions')
        .select('id, title, body, answer_body, answered_at, created_at')
        .eq('program_id', programId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as GuestQuestion[]
    },
  })
}

/** 질문 등록. created_by는 DB 기본값(현재 게스트)이 채운다. */
export function useCreateQuestion() {
  const client = useGuestClient()
  const qc = useQueryClient()
  const programId = useGuestStore((s) => s.program)?.id
  return useMutation({
    mutationFn: async (input: { title: string; body: string }) => {
      const { error } = await client!.from('program_questions').insert({
        program_id: programId,
        title: input.title,
        body: input.body,
      })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['guest', 'my-questions', programId] }),
  })
}
