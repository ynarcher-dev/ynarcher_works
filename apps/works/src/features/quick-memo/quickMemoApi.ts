import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  sortQuickMemos,
  type QuickMemo, type QuickMemoColor, type QuickMemoItem, type QuickMemoType,
} from './quickMemoStore'

/**
 * 퀵 메모·체크리스트 서버 훅(public.quick_memos). 상단바 슬라이드오버와 OFFICE 대시보드
 * 체크리스트 카드가 공유한다.
 *
 * 열람·수정 범위는 DB RLS가 강제한다 — **본인 행만**이며 관리자 우회도 없다. 소유자(user_id)는
 * 서버 트리거가 스탬프하므로 클라이언트가 실어 보내지 않는다.
 * 원장/정책: supabase/migrations/20260825120000_quick_memos.sql
 */

const QUICK_MEMOS_KEY = ['office', 'quick-memos']
const COLUMNS = 'id, type, title, content, items, pinned, color, created_at, updated_at'

interface MemoRow {
  id: string
  type: QuickMemoType
  title: string
  content: string
  items: QuickMemoItem[] | null
  pinned: boolean
  color: QuickMemoColor
  created_at: string
  updated_at: string
}

function toMemo(row: MemoRow): QuickMemo {
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? '',
    content: row.content ?? '',
    items: Array.isArray(row.items) ? row.items : [],
    pinned: row.pinned,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 저장 payload. `user_id`는 넣지 않는다(서버 트리거가 현재 사용자로 덮어쓴다).
 * `updated_at`을 실어 보내는 이유는 UPDATE 트리거가 어차피 now()로 다시 쓰기 때문에
 * INSERT 경로에서만 의미가 있고, 그 덕에 아래 레거시 이관이 원래 수정 시각을 지킬 수 있다.
 */
function toRow(memo: QuickMemo) {
  return {
    id: memo.id,
    type: memo.type,
    title: memo.title,
    content: memo.content,
    items: memo.items,
    pinned: memo.pinned,
    color: memo.color ?? 'cream',
    created_at: memo.createdAt,
    updated_at: memo.updatedAt,
  }
}

const LEGACY_PREFIX = 'ynarcher:quick-memos:'

/**
 * localStorage 시절 메모 1회 이관(2026-08-25). 서버 원장이 생기기 전 브라우저에 쌓여 있던
 * 것을 첫 조회 때 한 번 올려 보내고 그 키를 지운다 — 키를 지우는 것이 곧 완료 표시라 두 번
 * 올라가지 않는다(id를 그대로 쓰므로 중복 실행되더라도 upsert가 같은 행에 떨어진다).
 *
 * 실패해도 목록 조회를 막지 않는다. 여기서 던지면 이관할 것이 없는 대다수 사용자의 화면까지
 * 같이 비게 되므로, 이관은 어디까지나 부수적인 정리로 둔다.
 */
async function importLegacyMemos(userId: string) {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(`${LEGACY_PREFIX}${userId}`)
  } catch {
    return
  }
  if (!raw) return
  try {
    const parsed: unknown = JSON.parse(raw)
    const legacy = (Array.isArray(parsed) ? parsed : []) as QuickMemo[]
    if (legacy.length > 0) {
      const { error } = await supabase.from('quick_memos').upsert(legacy.map(toRow))
      if (error) throw error
    }
    localStorage.removeItem(`${LEGACY_PREFIX}${userId}`)
  } catch {
    // 이관 실패 시 키를 남겨 둔다 — 다음 조회에서 다시 시도한다.
  }
}

/** 내 메모 전체(미삭제). 정렬은 목록·카드가 함께 쓰는 sortQuickMemos 규칙. */
export function useQuickMemos(userId: string) {
  return useQuery({
    queryKey: [...QUICK_MEMOS_KEY, userId],
    enabled: Boolean(userId) && userId !== 'anonymous',
    queryFn: async (): Promise<QuickMemo[]> => {
      await importLegacyMemos(userId)
      const { data, error } = await supabase
        .from('quick_memos')
        .select(COLUMNS)
        .is('deleted_at', null)
      if (error) throw error
      return sortQuickMemos(((data ?? []) as MemoRow[]).map(toMemo))
    },
  })
}

/**
 * 메모 한 장 저장(신규·수정 겸용 upsert). id를 클라이언트가 정하므로 첫 저장인지 아닌지를
 * 호출부가 알 필요가 없다 — 편집 중 자동 저장이 같은 함수를 계속 부르면 된다.
 */
export function useSaveQuickMemo(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memo: QuickMemo) => {
      const { error } = await supabase.from('quick_memos').upsert(toRow(memo))
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUICK_MEMOS_KEY, userId] })
    },
  })
}

/** 메모 삭제 — 물리 삭제가 아니라 deleted_at 스탬프(원장 규칙: soft delete). */
export function useDeleteQuickMemo(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('quick_memos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUICK_MEMOS_KEY, userId] })
    },
  })
}
