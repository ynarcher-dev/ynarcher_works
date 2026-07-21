import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BoardDef, BoardKind } from '@/features/hub/boardStore'

/**
 * 게시판 레지스트리(public.boards) 서버 훅.
 * ADMIN(게시판 관리)이 편집하고 OFFICE 사이드바·페이지가 소비하는 단일 원천이다.
 * RLS상 일반 사용자는 활성·read_scope='ALL' 게시판만, 관리자는 비활성 포함 전부를 읽는다.
 * 원장/정책: supabase/migrations/20260720200000_office_boards.sql
 */
const BOARD_COLUMNS = 'id, slug, label, kind, icon, is_system, is_active, sort_order'

const BOARDS_KEY = ['office', 'boards']

interface BoardRow {
  id: string
  slug: string
  label: string
  kind: BoardKind
  icon: string
  is_system: boolean
  is_active: boolean
  sort_order: number
}

function toBoardDef(row: BoardRow): BoardDef {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    kind: row.kind,
    icon: row.icon,
    isSystem: row.is_system,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

/** 게시판·자료실 목록(미삭제). 정렬은 종류 › 표시순 › 이름. */
export function useBoards() {
  return useQuery({
    queryKey: BOARDS_KEY,
    queryFn: async (): Promise<BoardDef[]> => {
      const { data, error } = await supabase
        .from('boards')
        .select(BOARD_COLUMNS)
        .is('deleted_at', null)
        .order('kind', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })
      if (error) throw error
      return ((data ?? []) as BoardRow[]).map(toBoardDef)
    },
  })
}

/**
 * 게시판·자료실 생성(ADMIN 전용, RLS로 강제).
 * slug는 라우팅 키이자 고유 제약 대상이라 생성 시각 기반으로 발급하고 이후 변경하지 않는다.
 */
export function useCreateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { label: string; icon: string; kind: BoardKind }) => {
      const label = v.label.trim()
      if (!label) throw new Error('게시판명을 입력하세요.')
      // 같은 종류의 마지막 순서 뒤에 붙인다(관리 화면에서 순서 조정 예정).
      const { data: last, error: readError } = await supabase
        .from('boards')
        .select('sort_order')
        .eq('kind', v.kind)
        .order('sort_order', { ascending: false })
        .limit(1)
      if (readError) throw readError
      const lastOrder = last?.[0]?.sort_order ?? 0
      const { error } = await supabase.from('boards').insert({
        slug: `board-${Date.now()}`,
        label,
        kind: v.kind,
        icon: v.icon,
        sort_order: lastOrder + 10,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  })
}

/** 게시판명·아이콘 수정. 구분(kind)과 slug는 기존 글의 소속이 바뀌므로 변경하지 않는다. */
export function useUpdateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; label: string; icon: string }) => {
      const label = v.label.trim()
      if (!label) throw new Error('게시판명을 입력하세요.')
      const { error } = await supabase
        .from('boards')
        .update({ label, icon: v.icon })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  })
}

/** 활성/비활성 토글(소프트). 기본 게시판도 비활성화는 가능하다. */
export function useSetBoardActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('boards')
        .update({ is_active: v.isActive })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARDS_KEY }),
  })
}
