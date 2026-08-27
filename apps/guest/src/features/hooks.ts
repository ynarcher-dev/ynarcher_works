import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useGuestClient } from '@/lib/useGuestClient'

export interface Slot {
  id: string
  starts_at: string | null
  ends_at: string | null
  status: string
}

/**
 * 이 메뉴에서 예약할 수 있는 시간대.
 *
 * 사업 전체가 아니라 **모듈 하나**로 좁힌다 — 게스트 메뉴가 곧 모듈이므로, 사업에 매칭 메뉴가
 * 둘 이상 열리면 한 화면에 남의 시간대가 섞여 어느 메뉴의 예약인지 알 수 없게 된다.
 * (RLS는 여전히 '공개 모듈의 슬롯'까지만 열어 주므로, 이 조건은 범위를 넓히지 않는다.)
 */
export function useModuleSlots(moduleId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'slots', moduleId],
    enabled: Boolean(client && moduleId),
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await client!
        .from('matching_slots')
        .select('id, starts_at, ends_at, status, matching_events!inner(program_module_id)')
        .eq('matching_events.program_module_id', moduleId)
        .eq('status', 'AVAILABLE')
        .order('starts_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as Slot[]
    },
  })
}

/** 슬롯 예약 신청(간편 예약). */
export function useBookSlot(moduleId: string | undefined) {
  const client = useGuestClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await client!
        .from('matching_bookings')
        .insert({ slot_id: slotId, allocation_type: 'FCFS' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guest', 'slots', moduleId] }),
  })
}

export interface MentoringSession {
  id: string
  round_no: number
  scheduled_at: string | null
  status: string
}

/** 이 메뉴의 멘토링 세션(만족도 평가 대상). 슬롯과 같은 이유로 모듈 스코프다. */
export function useModuleMentoringSessions(moduleId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'mentoring-sessions', moduleId],
    enabled: Boolean(client && moduleId),
    queryFn: async (): Promise<MentoringSession[]> => {
      const { data, error } = await client!
        .from('mentoring_sessions')
        .select(
          'id, round_no, scheduled_at, status, mentoring_relationships!inner(program_module_id)',
        )
        .eq('mentoring_relationships.program_module_id', moduleId)
        .order('scheduled_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as MentoringSession[]
    },
  })
}

/**
 * 전문가 뷰의 세션 목록.
 *
 * 모듈 스코프가 아니다 — 전문가에게 보이는 것은 사업이 연 메뉴가 아니라 **본인에게 배정된
 * 일**이며, 범위는 RLS(app.guest_mentoring_session_ids)가 정한다.
 */
export function useMentoringSessions() {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'mentoring-sessions'],
    enabled: Boolean(client),
    queryFn: async (): Promise<MentoringSession[]> => {
      const { data, error } = await client!
        .from('mentoring_sessions')
        .select('id, round_no, scheduled_at, status')
        .order('scheduled_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as MentoringSession[]
    },
  })
}

/** 멘토 만족도 평가 제출(스타트업 → 멘토). */
export function useSubmitSatisfaction() {
  const client = useGuestClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      mentoring_session_id: string
      score: number
      feedback_text: string | null
    }) => {
      const { error } = await client!
        .from('mentor_satisfaction_records')
        .insert(v)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['guest', 'mentoring-sessions'] }),
  })
}

/** 전문가 상담일지 제출(booking 기준). */
export function useSubmitCounseling() {
  const client = useGuestClient()
  return useMutation({
    mutationFn: async (v: {
      booking_id: string
      summary: string
      next_steps: string | null
    }) => {
      const { error } = await client!.from('counseling_logs').insert({
        ...v,
        submitted_at: new Date().toISOString(),
      })
      if (error) throw error
    },
  })
}

/** 전문가 → 스타트업 5대 정량지표 평가 제출. */
export function useSubmitFeedback() {
  const client = useGuestClient()
  return useMutation({
    mutationFn: async (v: {
      mentoring_session_id: string
      score_technology: number
      score_business_model: number
      score_credibility: number
      score_collaboration: number
      score_matching_feasibility: number
      advisory_comment: string | null
    }) => {
      const { error } = await client!.from('mentor_feedback_records').insert(v)
      if (error) throw error
    },
  })
}

/**
 * 파일첨부 모듈의 파일 다운로드.
 *
 * 클라이언트가 스스로 서명 URL을 만들지 않는다 — Storage의 직접 접근 경로는 닫혀 있고,
 * material-download Edge Function만이 RLS 재검증과 access_logs 적재를 거쳐 60초짜리 URL을
 * 내준다. 로그를 남기지 못하면 URL도 없다(로그 없는 반출 금지).
 */
export function useDownloadModuleFile() {
  const client = useGuestClient()
  return useMutation({
    mutationFn: async (file: { id: string; file_name: string }) => {
      const { data, error } = await client!.functions.invoke<{
        url: string
        fileName: string
      }>('material-download', { body: { attachmentId: file.id } })
      if (error || !data?.url) throw error ?? new Error('download_failed')
      const a = document.createElement('a')
      a.href = data.url
      a.download = file.file_name
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
  })
}
