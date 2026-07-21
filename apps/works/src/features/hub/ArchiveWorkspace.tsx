import { Button, Checkbox, DataTable, Input, PageHeader, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { AttachmentField, formatBytes } from '@/features/hub/AttachmentField'
import { NewBadge } from '@/features/hub/DashboardPanel'
import { usePostStore } from '@/features/hub/boardPostStore'
import {
  BOARD_PAGE_SIZE,
  isNewPost,
  sortPosts,
  type BoardAttachment,
  type BoardPost,
} from '@/features/hub/boardData'
import { pinMark } from '@/features/hub/PostFlagBadges'

/**
 * 자료실(kind = ARCHIVE) 화면.
 * 게시판과 달리 상세페이지가 없고 목록 1행 = 파일 1건이므로, 행에서 바로 다운로드한다.
 * 설계: docs/docs_planning/3_1_1_board_archive_notice.md
 */
export interface ArchiveWorkspaceProps {
  /** 자료실 slug(게시글 스토어 접근용). */
  boardSlug: string
  title: string
  authorName?: string
}

function filterItems(items: BoardPost[], keyword: string): BoardPost[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return items
  return items.filter((p) =>
    `${p.title} ${p.summary ?? ''} ${p.author}`.toLowerCase().includes(q),
  )
}

export function ArchiveWorkspace({ boardSlug, title, authorName }: ArchiveWorkspaceProps) {
  const [editing, setEditing] = useState<BoardPost | null | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const items = usePostStore((s) => s.postsByBoard[boardSlug] ?? [])
  const addPost = usePostStore((s) => s.addPost)
  const updatePost = usePostStore((s) => s.updatePost)
  const setPostActive = usePostStore((s) => s.setPostActive)

  // editing: undefined=목록 / null=신규 등록 / BoardPost=수정
  if (editing !== undefined) {
    return (
      <ArchiveEditor
        key={editing?.id ?? 'new'}
        heading={editing ? `${title} 자료 수정` : `${title} 자료 등록`}
        authorName={authorName}
        initial={editing ?? undefined}
        onCancel={() => setEditing(undefined)}
        onSubmit={(post) => {
          if (editing) updatePost(boardSlug, post)
          else addPost(boardSlug, post)
          setEditing(undefined)
        }}
      />
    )
  }

  // 검색으로 행이 줄면 현재 페이지가 범위를 벗어날 수 있어 마지막 페이지로 당긴다.
  const rows = sortPosts(filterItems(items, keyword))
  const pageCount = Math.max(1, Math.ceil(rows.length / BOARD_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(safePage * BOARD_PAGE_SIZE, (safePage + 1) * BOARD_PAGE_SIZE)

  const columns: Column<BoardPost>[] = [
    {
      key: 'title',
      header: '자료명',
      // 다른 목록과 동일하게 1행 = 1줄. 설명은 별도 열로 분리한다.
      render: (p) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {/* 자료실은 전체 공지가 불가하고, 고정은 No. 칸 핀 표식으로 알린다. */}
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
      // 수치이므로 우측 정렬 + tabular-nums(5_component_spec_rules §3.1).
      align: 'right',
      numeric: true,
      className: 'w-24',
      render: (p) => {
        const file = p.attachments?.[0]
        return (
          <span className="tabular-nums text-gray-600">
            {file ? formatBytes(file.size) : '—'}
          </span>
        )
      },
    },
    {
      key: 'download',
      header: '다운로드',
      align: 'center',
      className: 'w-24',
      render: (p) => {
        const file = p.attachments?.[0]
        if (!file) return <span className="text-gray-300">파일 없음</span>
        return (
          <a
            href={file.url ?? '#'}
            download={file.name}
            aria-label={`${file.name} 다운로드`}
            title={file.url ? file.name : '데모 데이터에는 실제 파일이 없습니다.'}
            className={`inline-grid size-7 place-items-center rounded-radius-sm border transition-colors duration-fast ${
              file.url
                ? 'border-gray-300 text-gray-600 hover:border-brand hover:bg-brand/5 hover:text-brand'
                : 'pointer-events-none border-gray-200 text-gray-300'
            }`}
          >
            <Download className="size-4" />
          </a>
        )
      },
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
          // 수정은 표준 관리 컬럼(최우측)에서 처리한다.
          onEdit: (p) => setEditing(p),
          onDeactivate: (p) => setPostActive(boardSlug, p.id, false),
        }}
        pagination={{
          page: safePage,
          pageSize: BOARD_PAGE_SIZE,
          total: rows.length,
          onChange: setPage,
        }}
      />
    </div>
  )
}

/** 자료 등록/수정. 자료실은 1행 = 파일 1건이므로 첨부 1개를 필수로 요구한다. */
function ArchiveEditor({
  heading,
  authorName,
  initial,
  onCancel,
  onSubmit,
}: {
  heading: string
  authorName?: string
  initial?: BoardPost
  onCancel: () => void
  onSubmit: (post: BoardPost) => void
}) {
  const [name, setName] = useState(initial?.title ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [attachments, setAttachments] = useState<BoardAttachment[]>(initial?.attachments ?? [])
  const [pinned, setPinned] = useState(Boolean(initial?.pinned))

  const file = attachments[0]
  const canSubmit = Boolean(name.trim()) && Boolean(file)

  const submit = () => {
    if (!canSubmit) return
    const base = {
      title: name.trim(),
      summary: summary.trim() || undefined,
      // 1행 = 1파일. 여러 개를 넣어도 첫 파일만 등록한다.
      attachments: [file!],
      pinned,
    }
    onSubmit(
      initial
        ? { ...initial, ...base }
        : {
            id: `local-${Date.now()}`,
            author: authorName ?? '작성자',
            date: dayjs().format('YYYY.MM.DD'),
            ...base,
          },
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={heading}
        actions={
          <>
            <Button variant="outline" onClick={onCancel}>
              취소
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {initial ? '수정 완료' : '등록'}
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
      <AttachmentField
        value={attachments}
        onChange={(next) => setAttachments(next.slice(-1))}
      />
      <label className="flex w-fit cursor-pointer items-center gap-2 text-body text-gray-700">
        <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        이 자료를 목록 <span className="font-semibold text-gray-900">최상단에 고정</span>
      </label>
      {!file && (
        <p className="text-caption text-gray-600">
          자료실은 자료 1건당 파일 1개를 등록합니다. 파일을 첨부해야 등록할 수 있습니다.
        </p>
      )}
    </div>
  )
}
