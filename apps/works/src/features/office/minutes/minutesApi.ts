import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * OFFICE 회의록(meeting_minutes) 서버 훅.
 * 열람 범위는 전적으로 DB RLS(app.can_read_minute)가 강제한다 — 목록/상세 쿼리는
 * 필터를 걸지 않아도 볼 수 있는 회의록만 돌아온다. 명단 쓰기는 set_minute_people RPC 전용.
 * 원장/정책: supabase/migrations/20260723140000_office_meeting_minutes.sql
 */
export type MinuteVisibility = 'OFFICE' | 'PARTICIPANTS'
export type MinutePersonRole = 'ATTENDEE' | 'REFERENCE'

/** 공개범위 표시 라벨(목록·상세·편집 공용). OFFICE=전체공개 / PARTICIPANTS=일부공개. */
export const MINUTE_VISIBILITY_LABEL: Record<MinuteVisibility, string> = {
  OFFICE: '전체공개',
  PARTICIPANTS: '일부공개',
}

/** 회의록 첨부의 attachments.target_type. RLS가 office_minute만 회의록 접근범위에 종속시킨다. */
export const MINUTE_ATTACHMENT_TYPE = 'office_minute'

export interface MinutePerson {
  userId: string
  name: string
  role: MinutePersonRole
}

export interface MinuteListItem {
  id: string
  title: string
  meetingDate: string | null
  visibility: MinuteVisibility
  authorId: string | null
  authorName: string | null
  createdAt: string
  /** 누적 조회수(app.increment_minute_view로 집계). */
  viewCount: number
}

export interface MinuteDetail extends MinuteListItem {
  location: string | null
  body: string | null
  people: MinutePerson[]
  externalAttendees: string[]
}

/** 저장 payload(등록·수정 공용). id가 있으면 수정, 없으면 신규. */
export interface MinuteDraft {
  id?: string
  title: string
  meetingDate: string | null
  location: string | null
  body: string | null
  visibility: MinuteVisibility
  people: { userId: string; role: MinutePersonRole }[]
  externalAttendees: string[]
}

const MINUTES_KEY = ['office', 'minutes']

const LIST_COLUMNS =
  'id, title, meeting_date, visibility, author_id, author_name, created_at, view_count'
const DETAIL_COLUMNS =
  'id, title, meeting_date, location, body, visibility, author_id, author_name, created_at, view_count, external_attendees, meeting_minute_people(user_id, role, users:user_id(name))'

interface ListRow {
  id: string
  title: string
  meeting_date: string | null
  visibility: MinuteVisibility
  author_id: string | null
  author_name: string | null
  created_at: string
  view_count: number | null
}

function toListItem(r: ListRow): MinuteListItem {
  return {
    id: r.id,
    title: r.title,
    meetingDate: r.meeting_date,
    visibility: r.visibility,
    authorId: r.author_id,
    authorName: r.author_name,
    createdAt: r.created_at,
    viewCount: r.view_count ?? 0,
  }
}

/** 열람 가능한 회의록 목록(미삭제). 회의일 › 등록순 내림차순. */
export function useMinutes() {
  return useQuery({
    queryKey: MINUTES_KEY,
    queryFn: async (): Promise<MinuteListItem[]> => {
      const { data, error } = await supabase
        .from('meeting_minutes')
        .select(LIST_COLUMNS)
        .is('deleted_at', null)
        .order('meeting_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as ListRow[]).map(toListItem)
    },
  })
}

/**
 * 회의록 조회수 +1(상세 진입 시 1회). 원장 UPDATE RLS는 작성자/관리자만 허용하므로
 * 열람 권한자도 올릴 수 있게 SECURITY DEFINER RPC를 경유한다(볼 수 없는 회의록은 서버가 무시).
 * 성공 시 목록 캐시를 무효화해 되돌아왔을 때 갱신된 조회수가 보이게 한다.
 */
export function useIncrementMinuteView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('increment_minute_view', { p_minute_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MINUTES_KEY })
    },
  })
}

/** 회의록 상세(본문 + 참석자·참조 명단). RLS가 막으면 null. */
export function useMinute(id: string | null) {
  return useQuery({
    queryKey: [...MINUTES_KEY, id],
    enabled: !!id,
    queryFn: async (): Promise<MinuteDetail | null> => {
      const { data, error } = await supabase
        .from('meeting_minutes')
        .select(DETAIL_COLUMNS)
        .eq('id', id as string)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // PostgREST 임베드(users:user_id)는 to-one이지만 생성 타입 없이는 배열로 추론되어
      // unknown 경유로 캐스팅하고 배열/객체 양쪽을 정규화한다.
      const row = data as unknown as ListRow & {
        location: string | null
        body: string | null
        external_attendees: string[] | null
        meeting_minute_people: {
          user_id: string
          role: MinutePersonRole
          users: { name: string } | { name: string }[] | null
        }[]
      }
      return {
        ...toListItem(row),
        location: row.location,
        body: row.body,
        externalAttendees: row.external_attendees ?? [],
        people: (row.meeting_minute_people ?? []).map((p) => {
          const u = Array.isArray(p.users) ? p.users[0] : p.users
          return { userId: p.user_id, name: u?.name ?? '알 수 없음', role: p.role }
        }),
      }
    },
  })
}

/** 회의록 등록·수정(본문 저장 후 명단을 RPC로 일괄 교체). */
export function useSaveMinute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: MinuteDraft): Promise<string> => {
      const title = draft.title.trim()
      if (!title) throw new Error('제목을 입력하세요.')
      const fields = {
        title,
        meeting_date: draft.meetingDate || null,
        location: draft.location?.trim() || null,
        body: draft.body?.trim() || null,
        visibility: draft.visibility,
        external_attendees: draft.externalAttendees.map((n) => n.trim()).filter(Boolean),
      }

      let minuteId = draft.id
      if (minuteId) {
        const { error } = await supabase.from('meeting_minutes').update(fields).eq('id', minuteId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('meeting_minutes')
          .insert(fields)
          .select('id')
          .single()
        if (error) throw error
        minuteId = (data as { id: string }).id
      }

      const { error: peopleError } = await supabase.rpc('set_minute_people', {
        p_minute_id: minuteId,
        p_people: draft.people.map((p) => ({ user_id: p.userId, role: p.role })),
      })
      if (peopleError) throw peopleError
      return minuteId
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: MINUTES_KEY })
      qc.invalidateQueries({ queryKey: [...MINUTES_KEY, id] })
    },
  })
}

/** 첨부가 하나라도 있는 회의록 id 집합(목록의 첨부 아이콘 표시용). RLS로 열람 가능한 것만 돌아온다. */
export function useMinuteAttachmentIds() {
  return useQuery({
    queryKey: [...MINUTES_KEY, 'attachment-ids'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('target_id')
        .eq('target_type', MINUTE_ATTACHMENT_TYPE)
        .is('deleted_at', null)
      if (error) throw error
      return new Set((data ?? []).map((r) => (r as { target_id: string }).target_id))
    },
  })
}

/** 회의록 소프트 삭제(작성자·admin, RLS 강제). */
export function useDeleteMinute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meeting_minutes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MINUTES_KEY }),
  })
}
