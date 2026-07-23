import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'
import type { MinuteVisibility } from '@/features/office/minutes/minutesApi'

/**
 * 역방향 조회 — 특정 사업/스타트업에 연동된 회의록 목록.
 * meeting_minute_links를 target으로 걸어 조회하되, 링크 SELECT RLS(app.can_read_minute)가
 * 열람 불가·삭제된 회의록의 링크 행을 애초에 제거하므로 별도 필터 없이 볼 수 있는 것만 돌아온다.
 * 프로그램/스타트업 상세의 '관련 회의록' 패널에서 사용한다.
 */
export interface RelatedMinute {
  id: string
  title: string
  meetingDate: string | null
  visibility: MinuteVisibility
  authorName: string | null
}

interface LinkRow {
  meeting_minutes: {
    id: string
    title: string
    meeting_date: string | null
    visibility: MinuteVisibility
    author_name: string | null
  } | null
}

/** 대상(사업/스타트업)에 연동된, 요청자가 열람 가능한 회의록. 회의일 내림차순. */
export function useRelatedMinutes(targetType: MinuteLinkTargetType, targetId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'minutes', 'related', targetType, targetId],
    enabled: Boolean(targetId),
    queryFn: async (): Promise<RelatedMinute[]> => {
      // meeting_minute_links.minute_id → meeting_minutes.id FK가 유일하므로 테이블명 임베드로 부모를 끌어온다.
      const { data, error } = await supabase
        .from('meeting_minute_links')
        .select('meeting_minutes(id, title, meeting_date, visibility, author_name)')
        .eq('target_type', targetType)
        .eq('target_id', targetId as string)
      if (error) throw error

      const items = ((data ?? []) as unknown as LinkRow[])
        .map((r) => r.meeting_minutes)
        .filter((m): m is NonNullable<LinkRow['meeting_minutes']> => m != null)
        .map((m) => ({
          id: m.id,
          title: m.title,
          meetingDate: m.meeting_date,
          visibility: m.visibility,
          authorName: m.author_name,
        }))

      // 회의일 내림차순(null은 뒤로). PostgREST 임베드 정렬 대신 클라이언트에서 정렬한다.
      return items.sort((a, b) => (b.meetingDate ?? '').localeCompare(a.meetingDate ?? ''))
    },
  })
}
