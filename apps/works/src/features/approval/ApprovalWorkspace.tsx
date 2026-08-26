import { ListToolbar, PageHeader, Spinner } from '@ynarcher/ui'
import { useCallback, useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ListActions } from '@/components/ListActions'
import { ApprovalDetail } from '@/features/approval/ApprovalDetail'
import { ApprovalDocboxNav } from '@/features/approval/ApprovalDocboxNav'
import { ApprovalEditor } from '@/features/approval/ApprovalEditor'
import { ApprovalSummaryTiles } from '@/features/approval/ApprovalSummaryTiles'
import { ApprovalTable } from '@/features/approval/ApprovalTable'
import { useApprovalDocuments } from '@/features/approval/approvalApi'
import {
  APPROVAL_BOX_GROUPS,
  type ApprovalBoxKey,
  type ApprovalProgressKey,
} from '@/features/approval/config'
import { inBox, matchesKeyword, progressBucket } from '@/features/approval/model'
import { useEmployees } from '@/features/management/hooks'

const ALL_BOXES: ApprovalBoxKey[] = APPROVAL_BOX_GROUPS.flatMap((g) => g.boxes.map((b) => b.key))

/** 목록 ↔ 상세 ↔ 기안 작성. 회의록 워크스페이스와 같은 판별 유니온 전환. */
type View = { mode: 'list' } | { mode: 'detail'; id: string } | { mode: 'create' }

/**
 * OFFICE 전자결재 문서함 — 상단 진행 중 타일(필터) + 좌측 문서함 패널 + 문서 목록.
 * 타일과 문서함은 배타적 관점이다: 타일을 켜면 문서함 선택이 풀리고, 문서함을 고르면
 * 타일이 꺼진다(같은 목록을 두 기준이 동시에 좁히면 지금 무엇을 보고 있는지 흐려진다).
 * 보이는 문서의 범위 자체는 서버 RLS가 가른다.
 */
export function ApprovalWorkspace({ initialDocumentId }: { initialDocumentId?: string } = {}) {
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: docs, isLoading: docsLoading } = useApprovalDocuments()
  const { data: employees, isLoading: empLoading } = useEmployees()

  const [view, setView] = useState<View>(
    initialDocumentId ? { mode: 'detail', id: initialDocumentId } : { mode: 'list' },
  )
  const [box, setBox] = useState<ApprovalBoxKey>('mine-all')
  const [progress, setProgress] = useState<ApprovalProgressKey | null>(null)
  const [keyword, setKeyword] = useState('')

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees ?? []) m.set(e.id, e.name)
    return m
  }, [employees])
  const nameOf = useCallback(
    (id: string | null) => (id ? (nameById.get(id) ?? '-') : '-'),
    [nameById],
  )

  const myDeptId = useMemo(
    () => (employees ?? []).find((e) => e.id === uid)?.department_id ?? null,
    [employees, uid],
  )

  const rows = useMemo(() => docs ?? [], [docs])

  // 진행 중 타일 건수 — 문서함·검색과 무관하게 "지금 나의 처리가 필요한 것"의 전량.
  const progressCounts = useMemo(() => {
    const counts: Record<ApprovalProgressKey, number> = {
      all: 0,
      waiting: 0,
      confirm: 0,
      upcoming: 0,
      ongoing: 0,
    }
    if (!uid) return counts
    for (const row of rows) {
      const bucket = progressBucket(row, uid)
      if (!bucket) continue
      counts[bucket] += 1
      counts.all += 1
    }
    return counts
  }, [rows, uid])

  const boxCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_BOXES.map((k) => [k, 0])) as Record<
      ApprovalBoxKey,
      number
    >
    if (!uid) return counts
    for (const row of rows)
      for (const key of ALL_BOXES) if (inBox(row, key, uid, myDeptId)) counts[key] += 1
    return counts
  }, [rows, uid, myDeptId])

  const visibleRows = useMemo(() => {
    if (!uid) return []
    const scoped = progress
      ? rows.filter((row) => {
          const bucket = progressBucket(row, uid)
          return progress === 'all' ? bucket !== null : bucket === progress
        })
      : rows.filter((row) => inBox(row, box, uid, myDeptId))
    return scoped.filter((row) => matchesKeyword(row, keyword, nameOf(row.drafter_id)))
  }, [rows, uid, progress, box, myDeptId, keyword, nameOf])

  // 기안 작성·상세는 문서함 전체를 대신 차지한다(문서 한 건에 집중하는 화면이라
  // 목록·현황판을 함께 띄우면 어디를 보고 있는지가 흐려진다).
  if (view.mode === 'create') {
    return (
      <ApprovalEditor
        onSaved={(id) => setView({ mode: 'detail', id })}
        onCancel={() => setView({ mode: 'list' })}
      />
    )
  }
  if (view.mode === 'detail') {
    return <ApprovalDetail documentId={view.id} onBack={() => setView({ mode: 'list' })} />
  }

  if ((docsLoading && !docs) || (empLoading && !employees)) {
    return (
      <div className="space-y-5">
        <PageHeader title="전자결재" />
        <Spinner />
      </div>
    )
  }

  const emptyText = keyword.trim() ? '검색 결과가 없습니다.' : '전자결재 문서가 없습니다.'

  return (
    <div className="space-y-5">
      <PageHeader title="전자결재" />
      <ApprovalSummaryTiles
        counts={progressCounts}
        selected={progress}
        onSelect={setProgress}
      />
      <div className="flex gap-5">
        <ApprovalDocboxNav
          selected={progress ? null : box}
          onSelect={(key) => {
            setBox(key)
            setProgress(null)
          }}
          counts={boxCounts}
        />
        <div className="min-w-0 flex-1 space-y-4">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            searchPlaceholder="제목, 문서 번호, 종류, 기안자 검색"
            actions={
              <ListActions createLabel="기안 작성" onCreate={() => setView({ mode: 'create' })} />
            }
          />
          <ApprovalTable
            rows={visibleRows}
            uid={uid ?? ''}
            myDeptId={myDeptId}
            nameOf={nameOf}
            onRowClick={(row) => setView({ mode: 'detail', id: row.id })}
            emptyText={emptyText}
          />
        </div>
      </div>
    </div>
  )
}
