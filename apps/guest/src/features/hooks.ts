import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useGuestClient } from '@/lib/useGuestClient'
import { useGuestStore } from '@/auth/guestStore'

/** 내가 참여 중인 프로그램(program_participants) 목록. */
export function useMyPrograms() {
  const client = useGuestClient()
  const me = useGuestStore((s) => s.user)?.id
  return useQuery({
    queryKey: ['guest', 'my-programs', me],
    enabled: Boolean(client && me),
    queryFn: async (): Promise<{ program_id: string; role: string }[]> => {
      const { data } = await client!
        .from('program_participants')
        .select('program_id, role')
        .eq('user_id', me)
      return (data ?? []) as { program_id: string; role: string }[]
    },
  })
}

export interface TimelineItem {
  id: string
  title: string
  item_type: string | null
  starts_at: string | null
  ends_at: string | null
}

/** 참여 프로그램 공식 일정(내부 전용 제외). */
export function useTimeline(programIds: string[]) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'timeline', programIds],
    enabled: Boolean(client) && programIds.length > 0,
    queryFn: async (): Promise<TimelineItem[]> => {
      const { data } = await client!
        .from('program_timeline_items')
        .select('id, title, item_type, starts_at, ends_at, visibility')
        .in('program_id', programIds)
        .neq('visibility', 'INTERNAL_ONLY')
        .order('starts_at', { ascending: true })
      return (data ?? []) as TimelineItem[]
    },
  })
}

export interface Slot {
  id: string
  starts_at: string | null
  ends_at: string | null
  status: string
}

/** 예약 가능한 매칭 슬롯(AVAILABLE). */
export function useAvailableSlots() {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'slots'],
    enabled: Boolean(client),
    queryFn: async (): Promise<Slot[]> => {
      const { data } = await client!
        .from('matching_slots')
        .select('id, starts_at, ends_at, status')
        .eq('status', 'AVAILABLE')
        .order('starts_at', { ascending: true })
      return (data ?? []) as Slot[]
    },
  })
}

/** 슬롯 예약 신청(간편 예약). */
export function useBookSlot() {
  const client = useGuestClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await client!
        .from('matching_bookings')
        .insert({ slot_id: slotId, allocation_type: 'FCFS' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guest', 'slots'] }),
  })
}

export interface MentoringSession {
  id: string
  round_no: number
  scheduled_at: string | null
  status: string
}

/** 내 멘토링 세션(만족도 평가 대상). */
export function useMentoringSessions() {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'mentoring-sessions'],
    enabled: Boolean(client),
    queryFn: async (): Promise<MentoringSession[]> => {
      const { data } = await client!
        .from('mentoring_sessions')
        .select('id, round_no, scheduled_at, status')
        .order('scheduled_at', { ascending: false })
      return (data ?? []) as MentoringSession[]
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
