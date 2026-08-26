import { ListToolbar, PageHeader, Spinner } from '@ynarcher/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ListActions } from '@/components/ListActions'
import { ApprovalDetail } from '@/features/approval/ApprovalDetail'
import { ApprovalDocboxNav } from '@/features/approval/ApprovalDocboxNav'
import { ApprovalEditor } from '@/features/approval/ApprovalEditor'
import { ApprovalTable } from '@/features/approval/ApprovalTable'
import { useApprovalDocuments } from '@/features/approval/approvalApi'
import {
  APPROVAL_BOX_GROUPS,
  APPROVAL_DEPT_GROUP,
  APPROVAL_PROGRESS_GROUP,
  type ApprovalBoxKey,
  type ApprovalProgressKey,
} from '@/features/approval/config'
import {
  countByBox,
  countByProgress,
  inBox,
  matchesKeyword,
  progressBucket,
} from '@/features/approval/model'
import { useEmployees } from '@/features/management/hooks'

const PAGE_SIZE = 15

// 건수를 세는 대상은 좌패널에 서는 문서함 전부다 — 부서 문서함을 빠뜨리면 그 줄만 늘 0이 된다.
const ALL_BOXES: ApprovalBoxKey[] = [...APPROVAL_BOX_GROUPS, APPROVAL_DEPT_GROUP].flatMap((g) =>
  g.boxes.map((b) => b.key),
)

/**
 * URL로 들어온 필터(`?progress=` / `?box=`)를 좌패널 키로 옮긴다. 모르는 값이면 null —
 * 손으로 고친 주소나 옛 링크가 "아무것도 안 걸린 목록"으로 떨어지게 두고, 임의의 칸을
 * 골라 주지 않는다(무엇으로 걸러진 목록인지 화면과 주소가 어긋나기 때문).
 */
function parseProgress(raw: string | undefined): ApprovalProgressKey | null {
  if (!raw) return null
  return APPROVAL_PROGRESS_GROUP.boxes.find((b) => b.key === raw)?.key ?? null
}

function parseBox(raw: string | undefined): ApprovalBoxKey | null {
  if (!raw) return null
  return ALL_BOXES.find((k) => k === raw) ?? null
}

/** 목록 ↔ 상세 ↔ 기안 작성. 회의록 워크스페이스와 같은 판별 유니온 전환. */
type View =
  | { mode: 'list' }
  | { mode: 'detail'; id: string }
  // 기안 작성과 임시저장 수정은 같은 화면이다(id가 있으면 수정).
  | { mode: 'create'; id?: string }

/**
 * OFFICE 전자결재 문서함 — 상단 진행 중 타일(필터) + 좌측 문서함 패널 + 문서 목록.
 * 타일과 문서함은 배타적 관점이다: 타일을 켜면 문서함 선택이 풀리고, 문서함을 고르면
 * 타일이 꺼진다(같은 목록을 두 기준이 동시에 좁히면 지금 무엇을 보고 있는지 흐려진다).
 * 보이는 문서의 범위 자체는 서버 RLS가 가른다.
 */
export function ApprovalWorkspace({
  initialDocumentId,
  initialProgress,
  initialBox,
}: {
  initialDocumentId?: string
  initialProgress?: string
  initialBox?: string
} = {}) {
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: docs, isLoading: docsLoading } = useApprovalDocuments()
  const { data: employees, isLoading: empLoading } = useEmployees()

  const [view, setView] = useState<View>(
    initialDocumentId ? { mode: 'detail', id: initialDocumentId } : { mode: 'list' },
  )
  // 대시보드 전자결재 카드가 한 칸을 눌러 들어오면 그 칸이 이미 켜진 채로 열린다
  // (`?progress=waiting` 또는 `?box=mine-confirm`). 이후 선택은 여느 때처럼 화면이 갖는다.
  // 둘이 함께 오면 진행 상태가 이긴다 — 한 번에 하나만 켜지는 축이라 어느 하나를 골라야 하고,
  // 카드가 두 값을 함께 싣는 경우는 없으므로 여기 오는 것은 손으로 고친 주소뿐이다.
  const [box, setBox] = useState<ApprovalBoxKey>(() => parseBox(initialBox) ?? 'mine-all')
  const [progress, setProgress] = useState<ApprovalProgressKey | null>(() =>
    parseProgress(initialProgress),
  )
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  // 문서함·진행 상태·검색어가 바뀌면 첫 페이지로 되돌린다 — 목록이 통째로 갈리는데 페이지만
  // 남으면 3페이지짜리에서 5페이지를 보던 손이 빈 화면을 받는다(다른 목록 탭과 같은 규약).
  useEffect(() => setPage(0), [box, progress, keyword])

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

  // 진행 중 건수 — 문서함·검색과 무관하게 "지금 나의 처리가 필요한 것"의 전량.
  // 세는 일은 model이 갖는다(대시보드 전자결재 카드가 같은 함수로 같은 숫자를 낸다).
  const progressCounts = useMemo(() => countByProgress(rows, uid), [rows, uid])

  // 좌패널에 서는 문서함 전부를 센다 — 부서 문서함을 빠뜨리면 그 줄만 늘 0이 된다.
  const boxCounts = useMemo(
    () => countByBox(rows, ALL_BOXES, uid, myDeptId),
    [rows, uid, myDeptId],
  )

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

  // 페이지 자르기는 목록을 걸러 낸 이쪽이 갖는다(문서함마다 건수가 다르다). 목록이 줄어
  // 마지막 페이지가 사라지면 safePage가 끝 페이지로 당겨 준다.
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = visibleRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // 기안 작성·상세는 문서함 전체를 대신 차지한다(문서 한 건에 집중하는 화면이라
  // 목록·현황판을 함께 띄우면 어디를 보고 있는지가 흐려진다).
  if (view.mode === 'create') {
    return (
      <ApprovalEditor
        documentId={view.id}
        onSaved={(id) => setView({ mode: 'detail', id })}
        onCancel={() => setView({ mode: 'list' })}
      />
    )
  }
  if (view.mode === 'detail') {
    return (
      <ApprovalDetail
        documentId={view.id}
        onBack={() => setView({ mode: 'list' })}
        onEdit={(id) => setView({ mode: 'create', id })}
        onOpenDocument={(id) => setView({ mode: 'detail', id })}
      />
    )
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
      <div className="flex gap-5">
        {/* 문서함과 진행 상태는 같은 축(목록을 좁히는 기준)이라 한 번에 하나만 켠다. */}
        <ApprovalDocboxNav
          selectedBox={progress ? null : box}
          onSelectBox={(key) => {
            setBox(key)
            setProgress(null)
          }}
          counts={boxCounts}
          selectedProgress={progress}
          onSelectProgress={setProgress}
          progressCounts={progressCounts}
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
            rows={pageRows}
            uid={uid ?? ''}
            myDeptId={myDeptId}
            nameOf={nameOf}
            onRowClick={(row) => setView({ mode: 'detail', id: row.id })}
            emptyText={emptyText}
            pagination={{
              page: safePage,
              pageSize: PAGE_SIZE,
              total: visibleRows.length,
              onChange: setPage,
            }}
          />
        </div>
      </div>
    </div>
  )
}
