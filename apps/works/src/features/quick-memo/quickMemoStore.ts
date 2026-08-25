export type QuickMemoType = 'NOTE' | 'CHECKLIST'
export type QuickMemoColor = 'cream' | 'rose' | 'blue' | 'mint' | 'lavender'

export interface QuickMemoItem {
  id: string
  content: string
  completed: boolean
}

export interface QuickMemo {
  id: string
  type: QuickMemoType
  title: string
  content: string
  items: QuickMemoItem[]
  pinned: boolean
  color?: QuickMemoColor
  createdAt: string
  updatedAt: string
}

/**
 * 퀵 메모의 **순수 모델 계층** — 타입, 초안 생성, 상태 판정, 그리고 화면 간 인계 값만 둔다.
 * 저장은 서버(`public.quick_memos`)가 맡고 그 경로는 `quickMemoApi.ts` 하나가 소유한다
 * (2026-08-25, 그전까지는 이 파일이 localStorage에 직접 썼다 — 브라우저·오리진·기기가
 * 바뀌면 통째로 사라지던 자리였다).
 */

/**
 * 슬라이드오버를 특정 상태로 열기 위한 인계 값. 대시보드 카드가 심어 두면 패널이 마운트하며
 * 한 번 집어 가고 비운다(뒤로 가기·재열기 때 예전 선택이 되살아나지 않게).
 *
 * 두 가지를 인계한다 — 이미 있는 메모를 펼치기(`open`)와 **아직 저장하지 않은 새 초안**을
 * 넘기기(`draft`). 초안을 넘기는 쪽이 필요한 이유는 "새 체크리스트" 버튼이 빈 행을 서버에
 * 먼저 만들지 않기 때문이다 — 제목도 항목도 없이 닫으면 지워야 할 껍데기만 남는다.
 */
export type QuickMemoIntent = { open: string } | { draft: QuickMemo }

let pendingIntent: QuickMemoIntent | null = null

export function focusQuickMemo(id: string) {
  pendingIntent = { open: id }
}

export function draftQuickMemo(memo: QuickMemo) {
  pendingIntent = { draft: memo }
}

export function takeQuickMemoIntent(): QuickMemoIntent | null {
  const intent = pendingIntent
  pendingIntent = null
  return intent
}

/** 새 메모 초안. id는 여기서 정해 서버 저장(upsert)까지 같은 값을 쓴다. */
export function createQuickMemo(type: QuickMemoType): QuickMemo {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), type, title: '', content: '', pinned: false, color: 'cream',
    items: type === 'CHECKLIST' ? [{ id: crypto.randomUUID(), content: '', completed: false }] : [],
    createdAt: now, updatedAt: now,
  }
}

export function isQuickMemoEmpty(memo: QuickMemo) {
  return !memo.title.trim() && !memo.content.trim() && !memo.items.some((item) => item.content.trim())
}

/**
 * 다 끝낸 체크리스트인가 — 내용이 있는 항목이 하나 이상이고 그것들이 모두 완료된 상태.
 *
 * 비어 있는 줄(작성 중 남긴 빈 항목)은 세지 않는다. 세면 다 처리한 목록이 빈 줄 하나 때문에
 * 영영 '진행중'으로 남아 대시보드에서도 사라지지 않는다.
 *
 * 판정을 여기 한곳에 둔 이유는 **감추는 쪽(대시보드)과 회색으로 칠하는 쪽(타일 배지)이 같은
 * 답을 써야** 하기 때문이다 — 갈리면 배지는 '완료'인데 홈에는 그대로 남는 일이 생긴다.
 */
export function isChecklistDone(memo: QuickMemo) {
  const items = memo.items.filter((item) => item.content.trim())
  return memo.type === 'CHECKLIST' && items.length > 0 && items.every((item) => item.completed)
}

/** 패널 목록·대시보드 카드가 함께 쓰는 정렬: 고정 먼저, 그다음 최근 수정 순. */
export function sortQuickMemos(memos: QuickMemo[]): QuickMemo[] {
  return [...memos].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
  )
}
