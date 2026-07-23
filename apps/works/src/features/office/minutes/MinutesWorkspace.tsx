import { Button, EmptyState, Input, PageHeader } from '@ynarcher/ui'
import { useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import {
  useIncrementMinuteView,
  useMinute,
  useMinuteAttachmentIds,
  useMinutes,
  type MinuteListItem,
} from '@/features/office/minutes/minutesApi'
import { MinutesDetail } from '@/features/office/minutes/MinutesDetail'
import { MinutesEditor } from '@/features/office/minutes/MinutesEditor'
import { MinutesTable } from '@/features/office/minutes/MinutesTable'

type View = { mode: 'list' } | { mode: 'detail'; id: string } | { mode: 'edit'; id: string | null }

/** 기존 회의록 편집: 상세를 불러와 초기값으로 넘긴다. */
function EditExisting({ id, onDone }: { id: string; onDone: (id: string) => void }) {
  const { data, isLoading } = useMinute(id)
  if (isLoading) return <p className="py-10 text-center text-body text-gray-400">불러오는 중…</p>
  if (!data) return <EmptyState title="열람할 수 없습니다" description="수정 권한이 없거나 삭제된 회의록입니다." />
  return <MinutesEditor initial={data} onSaved={() => onDone(id)} onCancel={() => onDone(id)} />
}

function matchesKeyword(m: MinuteListItem, kw: string): boolean {
  const q = kw.trim().toLowerCase()
  if (!q) return true
  return m.title.toLowerCase().includes(q) || (m.authorName ?? '').toLowerCase().includes(q)
}

/**
 * OFFICE 회의록 워크스페이스: 목록(게시판형 표) ↔ 상세 ↔ 작성/편집.
 * 열람 범위(전사 공개/참석자 한정)는 DB RLS가 강제하므로 목록에는 볼 수 있는 회의록만 담긴다.
 */
export function MinutesWorkspace({ initialMinuteId }: { initialMinuteId?: string } = {}) {
  const userId = useAuthStore((s) => s.user?.id) ?? null
  // 딥링크(?minute=)로 진입하면 해당 상세를 초기 뷰로 연다(사업/스타트업 '관련 회의록'에서 이동).
  const [view, setView] = useState<View>(
    initialMinuteId ? { mode: 'detail', id: initialMinuteId } : { mode: 'list' },
  )
  const [keyword, setKeyword] = useState('')
  const { data: minutes, isLoading } = useMinutes()
  const { data: attachmentIds } = useMinuteAttachmentIds()
  const incView = useIncrementMinuteView()

  // 목록에서 상세로 진입할 때 조회수를 1 올린다(편집→상세 복귀는 열람이 아니므로 제외).
  const openDetail = (id: string) => {
    incView.mutate(id)
    setView({ mode: 'detail', id })
  }

  if (view.mode === 'edit') {
    // 제목 줄은 두지 않는다 — 상단 바(뒤로가기·저장)가 게시판 편집과 동일하게 맥락을 대신한다.
    return (
      <div className="space-y-5">
        {view.id ? (
          <EditExisting id={view.id} onDone={(id) => setView({ mode: 'detail', id })} />
        ) : (
          <MinutesEditor
            initial={null}
            onSaved={(id) => setView({ mode: 'detail', id })}
            onCancel={() => setView({ mode: 'list' })}
          />
        )}
      </div>
    )
  }

  if (view.mode === 'detail') {
    // 제목 줄은 두지 않는다 — 상세 상단 바(뒤로가기·삭제·수정)가 맥락을 대신한다(편집 화면과 동일).
    return (
      <div className="space-y-5">
        <MinutesDetail
          minuteId={view.id}
          currentUserId={userId}
          onBack={() => setView({ mode: 'list' })}
          onEdit={() => setView({ mode: 'edit', id: view.id })}
        />
      </div>
    )
  }

  const filtered = (minutes ?? []).filter((m) => matchesKeyword(m, keyword))

  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        title="회의록"
        search={
          <Input
            placeholder="제목·작성자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
        actions={<Button onClick={() => setView({ mode: 'edit', id: null })}>새 회의록</Button>}
      />
      {isLoading ? (
        <p className="py-10 text-center text-body text-gray-400">불러오는 중…</p>
      ) : (
        <MinutesTable
          minutes={filtered}
          attachmentIds={attachmentIds ?? new Set()}
          emptyText={keyword.trim() ? '검색 결과가 없습니다.' : '등록된 회의록이 없습니다.'}
          onSelect={(m) => openDetail(m.id)}
        />
      )}
    </div>
  )
}
