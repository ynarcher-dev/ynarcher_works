import { Button, Checkbox, DataTable, Input, PageHeader, Spinner, useToast, type Column } from '@ynarcher/ui'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NewBadge } from '@/features/hub/DashboardPanel'
import { isNewPost, type BoardPost } from '@/features/hub/boardData'
import { pinMark } from '@/features/hub/PostFlagBadges'
import {
  BOARD_POST_ATTACHMENT_TYPE,
  useBoardPostMaterials,
  useBoardPosts,
  useCreateBoardPost,
  useSetBoardPostActive,
  useUpdateBoardPost,
} from '@/features/hub/boardPostsApi'
import {
  downloadMaterial,
  formatBytes,
  uploadMaterialFile,
  type Material,
} from '@/features/networks/materialHooks'

/**
 * 자료실(kind = ARCHIVE) 화면.
 * 게시판과 달리 상세페이지가 없고 목록 1행 = 파일 1건이므로, 행에서 바로 다운로드한다.
 * 자료 메타는 board_posts, 파일은 attachments(BOARD_POST) 실데이터다.
 * 설계: docs/docs_planning/3_1_1_board_archive_notice.md
 */
export interface ArchiveWorkspaceProps {
  /** 자료실 원장 id(board_posts.board_id). */
  boardId: string
  title: string
}

const PAGE_SIZE = 20

function matchesKeyword(p: BoardPost, kw: string): boolean {
  const q = kw.trim().toLowerCase()
  if (!q) return true
  return `${p.title} ${p.summary ?? ''} ${p.author}`.toLowerCase().includes(q)
}

/** 자료 1건 다운로드 버튼(material-download Edge Function 경유). */
function DownloadCell({ material }: { material: Material | undefined }) {
  const [downloading, setDownloading] = useState(false)
  if (!material) return <span className="text-gray-300">파일 없음</span>
  return (
    <button
      type="button"
      disabled={downloading}
      onClick={async (e) => {
        e.stopPropagation()
        setDownloading(true)
        try {
          await downloadMaterial(material)
        } finally {
          setDownloading(false)
        }
      }}
      aria-label={`${material.file_name} 다운로드`}
      title={material.file_name}
      className="inline-grid size-7 place-items-center rounded-radius-sm border border-gray-300 text-gray-600 transition-colors duration-fast hover:border-brand hover:bg-brand/5 hover:text-brand disabled:opacity-50"
    >
      <Download className="size-4" />
    </button>
  )
}

export function ArchiveWorkspace({ boardId, title }: ArchiveWorkspaceProps) {
  const [editing, setEditing] = useState<BoardPost | null | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const toast = useToast()
  const { data: posts = [], isLoading } = useBoardPosts(boardId)
  const setActive = useSetBoardPostActive()

  const rows = posts.filter((p) => matchesKeyword(p, keyword))
  // 파일 메타(용량·다운로드)를 위해 현재 목록 게시글의 첨부를 일괄 조회한다.
  const { data: materials = [] } = useBoardPostMaterials(rows.map((r) => r.id))
  const matByPost = useMemo(() => {
    const m = new Map<string, Material>()
    // created_at desc 정렬이라 각 게시글의 첫 항목이 최신 파일이다.
    for (const mat of materials) if (!m.has(mat.target_id)) m.set(mat.target_id, mat)
    return m
  }, [materials])

  // editing: undefined=목록 / null=신규 등록 / BoardPost=수정
  if (editing !== undefined) {
    return (
      <ArchiveEditor
        key={editing?.id ?? 'new'}
        boardId={boardId}
        title={title}
        initial={editing ?? undefined}
        onDone={() => setEditing(undefined)}
        onCancel={() => setEditing(undefined)}
      />
    )
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const columns: Column<BoardPost>[] = [
    {
      key: 'title',
      header: '자료명',
      render: (p) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-gray-800">{p.title}</span>
          {isNewPost(p.date) && <NewBadge />}
        </span>
      ),
    },
    {
      key: 'summary',
      header: '설명',
      render: (p) =>
        p.summary ? (
          <span className="block truncate font-normal text-gray-600" title={p.summary}>
            {p.summary}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: 'size',
      header: '용량',
      align: 'right',
      numeric: true,
      className: 'w-24',
      render: (p) => (
        <span className="tabular-nums text-gray-600">
          {formatBytes(matByPost.get(p.id)?.byte_size ?? null)}
        </span>
      ),
    },
    {
      key: 'download',
      header: '다운로드',
      align: 'center',
      className: 'w-24',
      render: (p) => <DownloadCell material={matByPost.get(p.id)} />,
    },
  ]

  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        title={title}
        search={
          <Input
            placeholder="자료명·설명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
        actions={<Button onClick={() => setEditing(null)}>자료 등록</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(p) => p.id}
          emptyText={keyword.trim() ? '검색 결과가 없습니다.' : '등록된 자료가 없습니다.'}
          meta={{
            author: (p) => p.author,
            updatedAt: (p) => p.date,
            active: (p) => !p.deletedAt,
            rowMark: (p) => pinMark(p.pinned),
            // 자료실은 상세페이지가 없어 수정·비활성화를 목록의 관리 컬럼에서 수행한다.
            onEdit: (p) => setEditing(p),
            onDeactivate: (p) => {
              setActive.mutate(
                { id: p.id, active: false },
                {
                  onSuccess: () => toast.show('자료를 비활성화했습니다.', 'success'),
                  onError: () => toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger'),
                },
              )
            },
          }}
          pagination={{
            page: safePage,
            pageSize: PAGE_SIZE,
            total: rows.length,
            onChange: setPage,
          }}
        />
      )}
    </div>
  )
}

/**
 * 자료 등록/수정. 자료실은 1행 = 파일 1건이므로 신규 등록 시 파일 1개를 필수로 요구한다.
 * 수정은 메타(자료명·설명·고정)를 바꾸며, 파일을 새로 선택하면 교체(추가 업로드)된다.
 */
function ArchiveEditor({
  boardId,
  title,
  initial,
  onDone,
  onCancel,
}: {
  boardId: string
  title: string
  initial?: BoardPost
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const isEdit = Boolean(initial)
  const create = useCreateBoardPost()
  const update = useUpdateBoardPost()
  const [name, setName] = useState(initial?.title ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [pinned, setPinned] = useState(Boolean(initial?.pinned))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  // 신규는 파일 필수. 수정은 파일 없이 메타만 변경할 수 있다.
  const canSubmit = Boolean(name.trim()) && (isEdit || Boolean(file))

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, title: name.trim(), summary: summary.trim() || null, pinned })
        if (file) await uploadMaterialFile(BOARD_POST_ATTACHMENT_TYPE, initial.id, file)
      } else {
        const id = await create.mutateAsync({
          boardId,
          title: name.trim(),
          summary: summary.trim() || null,
          body: null,
          pinned,
          globalNotice: false,
        })
        if (file) await uploadMaterialFile(BOARD_POST_ATTACHMENT_TYPE, id, file)
      }
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={isEdit ? `${title} 자료 수정` : `${title} 자료 등록`}
        actions={
          <>
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              취소
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
              {busy ? '저장 중…' : isEdit ? '수정 완료' : '등록'}
            </Button>
          </>
        }
      />
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">자료명</label>
        <Input
          autoFocus
          placeholder="예: 투자심의보고서 표준 템플릿 v3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">설명</label>
        <Input
          placeholder="목록에 노출할 한 줄 설명(40자 내외)"
          maxLength={60}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <p className="text-caption text-gray-600">
          자료실은 상세페이지가 없으므로 이 설명이 유일한 안내 문구가 됩니다.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">파일</label>
        <input
          type="file"
          className="block w-full text-body text-gray-700 file:mr-3 file:cursor-pointer file:rounded-radius-sm file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-body file:text-gray-700 hover:file:border-gray-400"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-caption text-gray-600">
          {isEdit
            ? '파일을 새로 선택하면 교체됩니다. 비워 두면 기존 파일이 유지됩니다.'
            : '자료실은 자료 1건당 파일 1개를 등록합니다. 파일을 선택해야 등록할 수 있습니다.'}
        </p>
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-body text-gray-700">
        <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        이 자료를 목록 <span className="font-semibold text-gray-900">최상단에 고정</span>
      </label>
    </div>
  )
}
