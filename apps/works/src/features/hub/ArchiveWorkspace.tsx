import { Banner, Button, Checkbox, DataTable, EmptyValue, Field, IconButton, Input, PageHeader, Spinner, pinMark, useToast, type Column } from '@ynarcher/ui'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ArchiveDetailModal } from '@/features/hub/ArchiveDetailModal'
import { NewBadge } from '@/features/hub/PostFlagBadges'
import { isNewPost, type BoardPost } from '@/features/hub/boardData'
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
 *
 * 표에 남는 조작은 다운로드 하나다. 수정·비활성화는 행을 눌러 여는 자료 모달
 * (`ArchiveDetailModal`)이 갖는다 — 되돌리기 어려운 일은 무엇에 대고 하는 일인지 적힌
 * 뒤에 놓여야 하고, 행마다 반복되는 버튼은 정작 자료명보다 먼저 읽힌다.
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
  if (!material) return <EmptyValue />
  return (
    <IconButton
      disabled={downloading}
      onClick={(e) => {
        e.stopPropagation()
        setDownloading(true)
        void downloadMaterial(material).finally(() => setDownloading(false))
      }}
      icon={<Download className="size-3.5" />}
      label={`${material.file_name} 다운로드`}
      title={material.file_name}
      className="mx-auto"
    />
  )
}

export function ArchiveWorkspace({ boardId, title }: ArchiveWorkspaceProps) {
  const [editing, setEditing] = useState<BoardPost | null | undefined>(undefined)
  const [opened, setOpened] = useState<BoardPost | null>(null)
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
        onDeactivate={() => {
          if (!editing) return
          setActive.mutate(
            { id: editing.id, active: false },
            {
              onSuccess: () => {
                toast.show('자료를 비활성화했습니다.', 'success')
                setEditing(undefined)
              },
              onError: () => toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger'),
            },
          )
        }}
        deactivating={setActive.isPending}
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
      type: 'name',
      render: (p) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{p.title}</span>
          {isNewPost(p.date) && <NewBadge />}
        </span>
      ),
    },
    {
      key: 'summary',
      header: '설명',
      type: 'long',
      render: (p) =>
        p.summary ? (
          <span className="block truncate" title={p.summary}>
            {p.summary}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      key: 'size',
      header: '용량',
      type: 'money',
      render: (p) => (
        <span className="tabular-nums">
          {formatBytes(matByPost.get(p.id)?.byte_size ?? null)}
        </span>
      ),
    },
    {
      key: 'download',
      header: '다운로드',
      type: 'badge',
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
          onRowClick={setOpened}
          // 수정·비활성화를 표에서 걷어내고 자료 모달로 옮겼다(2026-08-25) — 두 버튼이 행마다
          // 반복되면서 자료명·설명보다 먼저 읽혔고, 되돌리기 어려운 비활성화가 목록을 훑는
          // 손이 지나는 자리에 서 있었다. 관리 액션이 하나도 없으므로 열 자체를 내린다.
          showManageColumn={false}
          meta={{
            author: (p) => p.author,
            updatedAt: (p) => p.date,
            active: (p) => !p.deletedAt,
            rowMark: (p) => pinMark(p.pinned),
          }}
          pagination={{
            page: safePage,
            pageSize: PAGE_SIZE,
            total: rows.length,
            onChange: setPage,
          }}
        />
      )}

      <ArchiveDetailModal
        open={opened !== null}
        post={opened}
        material={opened ? matByPost.get(opened.id) : undefined}
        busy={setActive.isPending}
        onEdit={() => {
          if (!opened) return
          setEditing(opened)
          setOpened(null)
        }}
        onClose={() => setOpened(null)}
      />
    </div>
  )
}

/**
 * 자료 등록/수정. 자료실은 1행 = 파일 1건이므로 신규 등록 시 파일 1개를 필수로 요구한다.
 * 수정은 메타(자료명·설명·고정)를 바꾸며, 파일을 새로 선택하면 교체(추가 업로드)된다.
 *
 * **비활성화(자료 내리기)도 이 화면이 갖는다.** 자료를 내리는 판단은 그 내용을 펼쳐 놓고
 * 하는 일이지 목록의 요약을 훑다가 하는 일이 아니다. 확인은 새 창을 띄우지 않고 같은 화면에서
 * 배너로 한 번 받는다 — 되돌리기 어려운 일이라 확인은 필요하지만, 그 확인 때문에 지금 보고
 * 있는 자료가 창 뒤로 가려지면 무엇을 내리는 중인지가 흐려진다.
 */
function ArchiveEditor({
  boardId,
  title,
  initial,
  onDone,
  onCancel,
  onDeactivate,
  deactivating,
}: {
  boardId: string
  title: string
  initial?: BoardPost
  onDone: () => void
  onCancel: () => void
  /** 수정일 때만 쓰는 비활성화(soft delete). */
  onDeactivate: () => void
  deactivating: boolean
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
  const [confirming, setConfirming] = useState(false)
  const alive = isEdit && !initial?.deletedAt

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
            {/*
              비활성화는 저장과 성격이 다른 일(이 자료를 목록에 둘지)이라 확인/저장과 같은
              무리로 읽히지 않아야 한다. 자리를 나란히 쓰는 대신 색으로 가른다.
            */}
            {alive && (
              <Button
                variant="outline-danger"
                onClick={() => setConfirming(true)}
                disabled={busy || deactivating || confirming}
              >
                비활성화
              </Button>
            )}
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              취소
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
              {busy ? '저장 중…' : isEdit ? '수정 완료' : '등록'}
            </Button>
          </>
        }
      />
      {confirming && (
        <Banner tone="danger">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              <b>{initial?.title}</b> 자료를 목록에서 내립니다. 파일이 지워지지는 않지만 목록에서
              비활성으로 흐려지며, 되돌리려면 관리자가 필요합니다.
            </span>
            <span className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={deactivating}>
                취소
              </Button>
              <Button variant="danger" onClick={onDeactivate} disabled={deactivating}>
                {deactivating ? '처리 중…' : '비활성화'}
              </Button>
            </span>
          </div>
        </Banner>
      )}
      <Field label="자료명">
        <Input
          autoFocus
          placeholder="예: 투자심의보고서 표준 템플릿 v3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="설명"
        hint="자료실은 상세페이지가 없으므로 이 설명이 유일한 안내 문구가 됩니다."
      >
        <Input
          placeholder="목록에 노출할 한 줄 설명(40자 내외)"
          maxLength={60}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </Field>
      <Field
        label="파일"
        hint={
          isEdit
            ? '파일을 새로 선택하면 교체됩니다. 비워 두면 기존 파일이 유지됩니다.'
            : '자료실은 자료 1건당 파일 1개를 등록합니다. 파일을 선택해야 등록할 수 있습니다.'
        }
      >
        <input
          type="file"
          className="block w-full text-body text-gray-700 file:mr-3 file:cursor-pointer file:rounded-radius-sm file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-body file:text-gray-700 hover:file:border-gray-400"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      <Checkbox
        checked={pinned}
        onChange={(e) => setPinned(e.target.checked)}
        wrapperClassName="w-fit"
        label={
          <>
            이 자료를 목록 <span className="font-semibold text-gray-900">최상단에 고정</span>
          </>
        }
      />
    </div>
  )
}
