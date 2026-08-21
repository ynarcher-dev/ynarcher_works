import { EmptyState, ListToolbar, PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ListActions } from '@/components/ListActions'
import {
  MINUTE_VISIBILITY_LABEL,
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

/**
 * 목록 탭 — 공개범위로 가른다.
 *
 * 표의 '공개범위' 열은 한 줄씩 확인하는 표기라, 회의록이 쌓이면 "참석자만 보는 것"만 따로 훑기가
 * 어렵다. 열은 그대로 두고 탭으로 한 번 더 가른다. 탭은 **이미 받아 온 목록을 나누기만** 한다 —
 * 무엇을 볼 수 있는지는 여전히 RLS(`app.can_read_minute`)가 정하므로, 탭이 열람 범위를 넓히거나
 * 좁히지 않는다.
 */
const VISIBILITY_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'OFFICE', label: '전체공개' },
  { key: 'PARTICIPANTS', label: '일부공개' },
] as const

type VisibilityTab = (typeof VISIBILITY_TABS)[number]['key']

/** 기존 회의록 편집: 상세를 불러와 초기값으로 넘긴다. */
function EditExisting({ id, onDone }: { id: string; onDone: (id: string) => void }) {
  const { data, isLoading } = useMinute(id)
  if (isLoading) return <Spinner />
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
  const [tab, setTab] = useState<VisibilityTab>('ALL')
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

  // 검색을 먼저 걸고 그 결과를 탭이 다시 나눈다 — 탭 옆 건수가 지금 화면에서 셀 수 있는 수와 같아야 한다.
  const searched = (minutes ?? []).filter((m) => matchesKeyword(m, keyword))
  const filtered = tab === 'ALL' ? searched : searched.filter((m) => m.visibility === tab)
  const countOf = (key: VisibilityTab) =>
    key === 'ALL' ? searched.length : searched.filter((m) => m.visibility === key).length
  const emptyText = keyword.trim()
    ? '검색 결과가 없습니다.'
    : tab === 'ALL'
      ? '등록된 회의록이 없습니다.'
      : `${MINUTE_VISIBILITY_LABEL[tab]} 회의록이 없습니다.`

  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader title="회의록" />
      {/* 탭이 먼저다 — 공개 범위가 목록의 자리를 가르고, 검색은 그 자리 안에서 걸린다(자산 관리와 같은 순서). */}
      <Tabs
        items={VISIBILITY_TABS.map((t) => ({ key: t.key, label: t.label, count: countOf(t.key) }))}
        value={tab}
        onChange={(key) => setTab(key as VisibilityTab)}
      />
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="제목·작성자 검색"
        actions={
          <ListActions
            createLabel="회의록 등록"
            onCreate={() => setView({ mode: 'edit', id: null })}
          />
        }
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <MinutesTable
          // 탭을 바꾸면 표를 새로 세운다 — 3페이지에서 옮겨 왔는데 빈 페이지가 열리지 않게.
          key={tab}
          minutes={filtered}
          attachmentIds={attachmentIds ?? new Set()}
          emptyText={emptyText}
          onSelect={(m) => openDetail(m.id)}
        />
      )}
    </div>
  )
}
