import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  MINUTE_LINK_TARGETS,
  type MinuteLink,
  type MinuteLinkRef,
  type MinuteLinkTargetType,
} from '@/features/office/minutes/minuteLinks'

export type { MinuteLink, MinuteLinkRef } from '@/features/office/minutes/minuteLinks'

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
  /** 주요 안건(단문 요약). 본문(body)과 별개 필드. */
  agenda: string | null
  body: string | null
  people: MinutePerson[]
  externalAttendees: string[]
  /** 연동된 사업/스타트업(cross-reference). 접근 불가 대상은 label=null. */
  links: MinuteLink[]
}

/** 저장 payload(등록·수정 공용). id가 있으면 수정, 없으면 신규. */
export interface MinuteDraft {
  id?: string
  title: string
  meetingDate: string | null
  location: string | null
  agenda: string | null
  body: string | null
  visibility: MinuteVisibility
  people: { userId: string; role: MinutePersonRole }[]
  externalAttendees: string[]
  /** 연동 대상(종류+id). 저장 시 set_minute_links RPC로 일괄 교체. */
  links: MinuteLinkRef[]
}

const MINUTES_KEY = ['office', 'minutes']

const LIST_COLUMNS =
  'id, title, meeting_date, visibility, author_id, author_name, created_at, view_count'
const DETAIL_COLUMNS =
  'id, title, meeting_date, location, agenda, body, visibility, author_id, author_name, created_at, view_count, external_attendees, meeting_minute_people(user_id, role, users:user_id(name))'

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

/**
 * 회의록에 연동된 대상을 로드하고 각 원장에서 제목을 채운다.
 * 링크 자체는 meeting_minute_links(RLS: 회의록 열람 가능자)에서, 제목은 종류별 원장을
 * id 묶음으로 조회한다 — 원장 RLS로 접근 불가한 대상은 행이 안 돌아와 label=null이 된다.
 */
async function loadMinuteLinks(minuteId: string): Promise<MinuteLink[]> {
  const { data, error } = await supabase
    .from('meeting_minute_links')
    .select('target_type, target_id')
    .eq('minute_id', minuteId)
  if (error) throw error
  const rows = (data ?? []) as { target_type: MinuteLinkTargetType; target_id: string }[]
  if (rows.length === 0) return []

  // 종류별로 id를 모아 원장 한 번씩만 조회한다.
  const byType = new Map<MinuteLinkTargetType, string[]>()
  for (const r of rows) {
    const list = byType.get(r.target_type) ?? []
    list.push(r.target_id)
    byType.set(r.target_type, list)
  }

  const labelMap = new Map<string, { label: string; code: string | null }>()
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const meta = MINUTE_LINK_TARGETS[type]
      const cols = ['id', meta.titleColumn, meta.codeColumn].filter(Boolean).join(', ')
      const { data: rowsData, error: rowsError } = await supabase
        .from(meta.table)
        .select(cols)
        .in('id', ids)
        .is('deleted_at', null)
      if (rowsError) throw rowsError
      for (const row of (rowsData ?? []) as unknown as Record<string, string | null>[]) {
        labelMap.set(`${type}:${row.id}`, {
          label: (row[meta.titleColumn] as string) ?? '(제목 없음)',
          code: meta.codeColumn ? ((row[meta.codeColumn] as string | null) ?? null) : null,
        })
      }
    }),
  )

  return rows.map((r) => {
    const hit = labelMap.get(`${r.target_type}:${r.target_id}`)
    return {
      targetType: r.target_type,
      targetId: r.target_id,
      label: hit?.label ?? null,
      code: hit?.code ?? null,
    }
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
        agenda: string | null
        body: string | null
        external_attendees: string[] | null
        meeting_minute_people: {
          user_id: string
          role: MinutePersonRole
          users: { name: string } | { name: string }[] | null
        }[]
      }
      const links = await loadMinuteLinks(row.id)
      return {
        ...toListItem(row),
        location: row.location,
        agenda: row.agenda,
        body: row.body,
        externalAttendees: row.external_attendees ?? [],
        people: (row.meeting_minute_people ?? []).map((p) => {
          const u = Array.isArray(p.users) ? p.users[0] : p.users
          return { userId: p.user_id, name: u?.name ?? '알 수 없음', role: p.role }
        }),
        links,
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
        agenda: draft.agenda?.trim() || null,
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

      const { error: linksError } = await supabase.rpc('set_minute_links', {
        p_minute_id: minuteId,
        p_links: draft.links.map((l) => ({
          target_type: l.targetType,
          target_id: l.targetId,
        })),
      })
      if (linksError) throw linksError
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
