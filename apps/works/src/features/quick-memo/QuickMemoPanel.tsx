import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckSquare2, Pin, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { Button, Checkbox, IconButton, Input, Spinner, TextArea, cardText, formText, cn } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import { QuickMemoTile } from './QuickMemoTile'
import { MEMO_COLORS, memoSurface } from './quickMemoColors'
import { useDeleteQuickMemo, useQuickMemos, useSaveQuickMemo } from './quickMemoApi'
import {
  createQuickMemo, isQuickMemoEmpty, takeQuickMemoIntent,
  type QuickMemo, type QuickMemoType,
} from './quickMemoStore'

/** 편집 중인 메모 한 장. */
interface Editing {
  memo: QuickMemo
  /** 마지막 저장 이후 바뀐 것이 있는가 — 열어 보기만 한 메모를 다시 저장하지 않기 위한 표시. */
  dirty: boolean
  /** 서버에 행이 있는가 — 저장된 적 없는 초안은 비운 채 닫아도 지울 것이 없다. */
  stored: boolean
}

const AUTOSAVE_DELAY = 600

/**
 * 퀵 메모 슬라이드오버 — 목록과 편집기를 한 자리에서 오간다.
 *
 * 저장은 서버(`public.quick_memos`)가 맡는다(2026-08-25). 그전에는 목록 전체를 브라우저
 * localStorage에 통째로 덮어썼는데, 브라우저·오리진·기기가 달라지면 통째로 사라지는 자리였다.
 * 지금은 **편집 중인 한 장만** 자동 저장(upsert)하므로, 다른 탭에서 고친 다른 메모를
 * 되돌려 놓을 일도 없다.
 *
 * 새 메모는 버튼을 누른 순간 서버에 만들지 않고 초안으로만 든다 — 제목도 내용도 없이 닫으면
 * 지워야 할 껍데기만 남기 때문이다. 첫 글자가 들어와야(=비어 있지 않아야) 행이 생긴다.
 */
export function QuickMemoPanel() {
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonymous'
  const { data: memos = [], isLoading } = useQuickMemos(userId)
  const { mutate: saveMemo } = useSaveQuickMemo(userId)
  const { mutate: removeMemo } = useDeleteQuickMemo(userId)

  // 대시보드에서 넘어온 인계 값: 새 초안을 들고 왔으면 바로 편집기로, 기존 메모를 펼치라는
  // 지시면 목록이 도착한 뒤 아래 효과가 집어 든다.
  const [intent] = useState(takeQuickMemoIntent)
  const [editing, setEditing] = useState<Editing | null>(() =>
    intent && 'draft' in intent ? { memo: intent.draft, dirty: false, stored: false } : null)
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(
    intent && 'open' in intent ? intent.open : null)
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    if (!pendingOpenId) return
    const target = memos.find((memo) => memo.id === pendingOpenId)
    if (!target) return
    setEditing({ memo: target, dirty: false, stored: true })
    setPendingOpenId(null)
  }, [pendingOpenId, memos])

  // 자동 저장: 고친 것이 있을 때만 움직인다. 열어 보기만 해도 저장하면 수정 시각이 올라가
  // 읽기만 한 메모가 목록 맨 위로 튀어 오른다.
  useEffect(() => {
    if (!editing?.dirty || isQuickMemoEmpty(editing.memo)) return
    const target = editing.memo
    const timer = window.setTimeout(() => {
      saveMemo(target, {
        onSuccess: () => {
          setSaved(true)
          // 저장하는 동안 또 고쳤다면 dirty를 내리지 않는다(그 편집이 다음 차례를 기다린다).
          setEditing((current) => current && current.memo === target
            ? { ...current, dirty: false, stored: true }
            : current)
        },
      })
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [editing, saveMemo])

  // 패널을 닫으면 이 컴포넌트가 통째로 사라진다. 디바운스가 아직 안 끝난 마지막 편집은
  // 여기서 흘려보낸다 — 안 그러면 "쓰던 중에 X를 눌렀다"가 곧 유실이다.
  const editingRef = useRef(editing)
  editingRef.current = editing
  useEffect(() => () => {
    const last = editingRef.current
    if (last?.dirty && !isQuickMemoEmpty(last.memo)) saveMemo(last.memo)
  }, [saveMemo])

  // 정렬은 서버 훅이 이미 끝냈다(고정 우선 · 최근 수정 순). 여기서는 걸러내기만 한다.
  const visibleMemos = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR')
    return memos
      .filter((memo) => !isQuickMemoEmpty(memo))
      .filter((memo) => !needle || [memo.title, memo.content, ...memo.items.map((item) => item.content)]
        .join(' ').toLocaleLowerCase('ko-KR').includes(needle))
  }, [memos, query])

  const updateSelected = (update: (memo: QuickMemo) => QuickMemo) => {
    setSaved(false)
    setEditing((current) => current && {
      ...current,
      memo: { ...update(current.memo), updatedAt: new Date().toISOString() },
      dirty: true,
    })
  }

  const addMemo = (type: QuickMemoType) => {
    setEditing({ memo: createQuickMemo(type), dirty: false, stored: false })
    setSaved(true)
  }

  const closeEditor = () => {
    if (editing) {
      if (isQuickMemoEmpty(editing.memo)) {
        // 내용을 다 지우고 나가면 목록에서도 걷는다(저장된 적 없는 초안은 지울 것이 없다).
        if (editing.stored) removeMemo(editing.memo.id)
      } else if (editing.dirty) {
        saveMemo(editing.memo) // 디바운스가 끝나기 전에 닫아도 잃지 않는다.
      }
    }
    setEditing(null)
    setSaved(true)
  }

  const deleteEditing = () => {
    if (editing?.stored) removeMemo(editing.memo.id)
    setEditing(null)
    setSaved(true)
  }

  const selected = editing?.memo

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
            <IconButton variant="ghost" label="메모 삭제" onClick={deleteEditing}
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
        {isLoading ? (
          // 도착 전에는 빈 상태를 보이지 않는다 — 메모가 있는 사람에게 "없습니다"가 스쳐
          // 지나가면 그것 자체가 유실 신호로 읽힌다.
          <div className="flex min-h-64 items-center justify-center"><Spinner /></div>
        ) : visibleMemos.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <StickyNote aria-hidden className="mb-3 size-9 text-gray-300" strokeWidth={1.5} />
            <p className={cardText.subhead}>{query ? '검색 결과가 없습니다.' : '아직 작성한 메모가 없습니다.'}</p>
            {!query && <p className={`mt-1 ${cardText.subtitle}`}>생각이나 할 일을 빠르게 기록해보세요.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleMemos.map((memo) => (
              <QuickMemoTile key={memo.id} memo={memo}
                onClick={() => setEditing({ memo, dirty: false, stored: true })} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
