import { useCallback, useSyncExternalStore } from 'react'

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

const STORAGE_PREFIX = 'ynarcher:quick-memos:'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

export function loadQuickMemos(userId: string): QuickMemo[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 저장 알림 구독자(대시보드 카드 등 "읽기만 하는" 자리). 슬라이드오버가 저장하면 함께 갱신된다. */
const listeners = new Set<() => void>()

export function saveQuickMemos(userId: string, memos: QuickMemo[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(memos))
  listeners.forEach((listener) => listener())
}

/**
 * 스냅샷 캐시 — `useSyncExternalStore`는 값이 그대로면 **같은 배열 참조**를 받아야 한다.
 * 저장된 원본 문자열이 바뀌었을 때만 새로 파싱해 무한 렌더를 막는다.
 */
let snapshot: { key: string; raw: string; memos: QuickMemo[] } | null = null

function quickMemoSnapshot(userId: string): QuickMemo[] {
  const key = storageKey(userId)
  let raw = '[]'
  try {
    raw = localStorage.getItem(key) ?? '[]'
  } catch {
    raw = '[]'
  }
  if (!snapshot || snapshot.key !== key || snapshot.raw !== raw) {
    snapshot = { key, raw, memos: loadQuickMemos(userId) }
  }
  return snapshot.memos
}

/**
 * 메모 목록 읽기 훅. **쓰기는 퀵 메모 슬라이드오버가 소유**하고 이 훅은 결과만 비춘다 —
 * 두 자리가 각자의 상태로 같은 원장을 쓰면 나중에 저장한 쪽이 상대의 편집을 덮어쓴다.
 * 다른 탭에서의 변경(`storage` 이벤트)도 같은 경로로 들어온다.
 */
export function useQuickMemos(userId: string): QuickMemo[] {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    window.addEventListener('storage', listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', listener)
    }
  }, [])
  return useSyncExternalStore(subscribe, () => quickMemoSnapshot(userId))
}

/**
 * 슬라이드오버를 "이 메모를 펼친 채로" 열기 위한 인계 값. 대시보드 타일이 심어 두면 패널이
 * 마운트하며 한 번 집어 가고 비운다(뒤로 가기·재열기 때 예전 선택이 되살아나지 않게).
 */
let focusedMemoId: string | null = null

export function focusQuickMemo(id: string) {
  focusedMemoId = id
}

export function takeFocusedQuickMemo(): string | null {
  const id = focusedMemoId
  focusedMemoId = null
  return id
}

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
