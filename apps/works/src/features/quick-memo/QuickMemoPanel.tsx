import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckSquare2, Pin, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { Button, Checkbox, IconButton, Input, TextArea, cardText, formText, cn } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import { QuickMemoTile } from './QuickMemoTile'
import { MEMO_COLORS, memoSurface } from './quickMemoColors'
import {
  createQuickMemo, isQuickMemoEmpty, loadQuickMemos, saveQuickMemos, takeFocusedQuickMemo,
  type QuickMemo, type QuickMemoType,
} from './quickMemoStore'

export function QuickMemoPanel() {
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonymous'
  const [memos, setMemos] = useState<QuickMemo[]>(() => loadQuickMemos(userId))
  // 대시보드 타일에서 넘어왔다면 그 메모를 펼친 채로 연다(없으면 목록으로 시작).
  const [selectedId, setSelectedId] = useState<string | null>(() => takeFocusedQuickMemo())
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(true)
  const loadedUserId = useRef(userId)

  useEffect(() => {
    // 첫 렌더의 적재는 위 초기값이 이미 했다 — 여기서 다시 세우면 인계받은 선택이 지워진다.
    if (loadedUserId.current === userId) return
    loadedUserId.current = userId
    setMemos(loadQuickMemos(userId))
    setSelectedId(null)
  }, [userId])

  useEffect(() => {
    setSaved(false)
    const timer = window.setTimeout(() => {
      saveQuickMemos(userId, memos)
      setSaved(true)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [memos, userId])

  const selected = memos.find((memo) => memo.id === selectedId)
  const visibleMemos = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR')
    return [...memos]
      .filter((memo) => !isQuickMemoEmpty(memo))
      .filter((memo) => !needle || [memo.title, memo.content, ...memo.items.map((item) => item.content)]
        .join(' ').toLocaleLowerCase('ko-KR').includes(needle))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }, [memos, query])

  const updateSelected = (update: (memo: QuickMemo) => QuickMemo) => {
    setMemos((current) => current.map((memo) => memo.id === selectedId
      ? { ...update(memo), updatedAt: new Date().toISOString() }
      : memo))
  }

  const addMemo = (type: QuickMemoType) => {
    const memo = createQuickMemo(type)
    setMemos((current) => [memo, ...current])
    setSelectedId(memo.id)
  }

  const closeEditor = () => {
    setMemos((current) => current.filter((memo) => memo.id !== selectedId || !isQuickMemoEmpty(memo)))
    setSelectedId(null)
  }

  if (selected) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2">
          <IconButton variant="ghost" label="목록으로 돌아가기" onClick={closeEditor}
            icon={<ArrowLeft aria-hidden className="size-5" strokeWidth={1.8} />} />
          <div className="flex items-center gap-1">
            <span className={`mr-1 ${formText.hint}`}>{saved ? '저장됨' : '저장 중…'}</span>
            <IconButton variant="ghost" label={selected.pinned ? '고정 해제' : '상단 고정'}
              onClick={() => updateSelected((memo) => ({ ...memo, pinned: !memo.pinned }))}
              className={cn(selected.pinned && 'bg-brand-subtle text-brand')}
              icon={<Pin aria-hidden className="size-4" strokeWidth={1.8} />} />
            <IconButton variant="ghost" label="메모 삭제"
              onClick={() => { setMemos((current) => current.filter((memo) => memo.id !== selected.id)); setSelectedId(null) }}
              icon={<Trash2 aria-hidden className="size-4" strokeWidth={1.8} />} />
          </div>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', memoSurface(selected.color))}>
          <div className="mb-3 flex items-center gap-2" aria-label="메모 색상">
            {MEMO_COLORS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                aria-label={`${option.label} 색상`}
                aria-pressed={(selected.color ?? 'cream') === option.value}
                onClick={() => updateSelected((memo) => ({ ...memo, color: option.value }))}
                className={cn(
                  'size-6 rounded-full border border-black/5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
                  option.swatch,
                  (selected.color ?? 'cream') === option.value && 'ring-2 ring-gray-700 ring-offset-2',
                )}
              />
            ))}
          </div>
          <Input autoFocus value={selected.title}
            onChange={(event) => updateSelected((memo) => ({ ...memo, title: event.target.value }))}
            placeholder={selected.type === 'NOTE' ? '메모 제목' : '체크리스트 제목'} aria-label="메모 제목" />
          {selected.type === 'NOTE' ? (
            <TextArea value={selected.content}
              onChange={(event) => updateSelected((memo) => ({ ...memo, content: event.target.value }))}
              placeholder="내용을 입력하세요…" aria-label="메모 내용"
              className="mt-3 min-h-[24rem] resize-none" />
          ) : (
            <div className="mt-3 space-y-2">
              {selected.items.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox checked={item.completed} aria-label={`${item.content || '빈 항목'} 완료`}
                    onChange={(event) => updateSelected((memo) => ({ ...memo, items: memo.items.map((row) => row.id === item.id ? { ...row, completed: event.target.checked } : row) }))} />
                  <Input value={item.content} placeholder="할 일을 입력하세요"
                    onChange={(event) => updateSelected((memo) => ({ ...memo, items: memo.items.map((row) => row.id === item.id ? { ...row, content: event.target.value } : row) }))}
                    className={cn(item.completed && 'text-gray-400 line-through')} />
                  <IconButton variant="ghost" label="항목 삭제"
                    onClick={() => updateSelected((memo) => ({ ...memo, items: memo.items.filter((row) => row.id !== item.id) }))}
                    icon={<Trash2 aria-hidden className="size-4" strokeWidth={1.8} />} />
                </div>
              ))}
              <Button variant="ghost" className="w-full justify-start text-gray-500"
                onClick={() => updateSelected((memo) => ({ ...memo, items: [...memo.items, { id: crypto.randomUUID(), content: '', completed: false }] }))}>
                <Plus aria-hidden className="size-4" /> 항목 추가
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-gray-100 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => addMemo('NOTE')}><StickyNote aria-hidden className="size-4" /> 메모</Button>
          <Button variant="secondary" onClick={() => addMemo('CHECKLIST')}><CheckSquare2 aria-hidden className="size-4" /> 체크리스트</Button>
        </div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="메모 검색" aria-label="메모 검색"
          icon={<Search aria-hidden className="size-4" strokeWidth={1.8} />} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {visibleMemos.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <StickyNote aria-hidden className="mb-3 size-9 text-gray-300" strokeWidth={1.5} />
            <p className={cardText.subhead}>{query ? '검색 결과가 없습니다.' : '아직 작성한 메모가 없습니다.'}</p>
            {!query && <p className={`mt-1 ${cardText.subtitle}`}>생각이나 할 일을 빠르게 기록해보세요.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleMemos.map((memo) => (
              <QuickMemoTile key={memo.id} memo={memo} onClick={() => setSelectedId(memo.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
