import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/auth/authStore'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 QNA(1:1 문의함) 데이터 접근 — 담당자 쪽. 질문은 게스트가 쓰고(INSERT 정책이 게스트
 * 전용) 담당자는 전체를 읽어 답변·소프트 삭제만 한다. 게스트에게는 본인 질문만 보이므로
 * 작성자 표시는 이 화면(WORKS)만의 요구다 — users 임베드로 이름을 얻는다.
 * 원장은 게스트 로그인을 개방한 워크스페이스에만 있다(config.tables.questions 유무).
 */

/**
 * 질문 첨부의 다형 키. 귀속 단위는 **질문 1건**이며(target_id=질문 id), 담당자가 답변에
 * 곁들이는 파일이 여기 붙는다 — 게스트는 읽고 내려받기만 한다(게스트에게 첨부 업로드를
 * 열려면 attachments INSERT와 Storage 정책을 함께 열어야 하므로 별도 결정 사항이다).
 */
export const QUESTION_ATTACHMENT_TYPE = 'program_question'

/** 질문 1건(작성자 이름 포함). answer_body가 비어 있으면 답변 대기다. */
export interface ProgramQuestion {
  id: string
  title: string
  body: string | null
  answer_body: string | null
  answered_at: string | null
  created_at: string
  author: { name: string | null } | null
}

const COLS =
  'id, title, body, answer_body, answered_at, created_at, author:users!program_questions_created_by_fkey(name)'

/** 사업의 질문 전체(미삭제, 최신순). */
export function useQuestions(programId: string | undefined) {
  const config = useProgramWorkspace()
  const table = config.tables.questions
  return useQuery({
    queryKey: [config.key, 'program-questions', programId],
    enabled: Boolean(programId && table),
    queryFn: async (): Promise<ProgramQuestion[]> => {
      const { data, error } = await supabase
        .from(table!)
        .select(COLS)
        .eq('program_id', programId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as ProgramQuestion[]
    },
  })
}

/** 답변 저장(작성·수정 동일 — 답변은 질문당 하나다). 빈 본문이면 답변을 거둔 것으로 본다. */
export function useAnswerQuestion(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  const userId = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (input: { id: string; answerBody: string | null }) => {
      const table = config.tables.questions
      if (!table) throw new Error('이 워크스페이스는 QNA를 운용하지 않습니다.')
      const answered = input.answerBody !== null
      const { error } = await supabase
        .from(table)
        .update({
          answer_body: input.answerBody,
          answered_by: answered ? (userId ?? null) : null,
          answered_at: answered ? new Date().toISOString() : null,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'program-questions', programId] }),
  })
}

/** 질문 소프트 삭제(물리 삭제 금지 — 오등록·부적절 문의 정리용). */
export function useDeleteQuestion(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (id: string) => {
      const table = config.tables.questions
      if (!table) throw new Error('이 워크스페이스는 QNA를 운용하지 않습니다.')
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'program-questions', programId] }),
  })
}
