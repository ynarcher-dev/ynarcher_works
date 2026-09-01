import {
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  ListToolbar,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import {
  useAnnouncements,
  useDeleteAnnouncement,
  useSaveAnnouncement,
  type ProgramAnnouncement,
} from '@/features/program/announcementHooks'
import { LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/program/detail/listFilter'

/**
 * 공지사항 탭 — 사업 단위 게시판. GUEST 고정 메뉴 '공지사항'과 **같은 구성**(2:1 분할,
 * 목록 표 + 검색, 행을 누르면 우측에 본문)이며 차이는 작성·수정·삭제뿐이다.
 * 모듈별 NOTICE(메뉴당 한 건)와 축이 다르다 — 이쪽은 사업 전체를 향한 글이 여러 건 쌓인다.
 */
export function ProgramAnnouncementsPanel({ programId }: { programId: string }) {
  const toast = useToast()
  const { data: list = [], isLoading } = useAnnouncements(programId)
  const remove = useDeleteAnnouncement(programId)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProgramAnnouncement | 'new' | null>(null)

  const filtered = list.filter((a) => matchesKeyword(keyword, a))
  const { pageRows, safePage } = pageSlice(filtered, page)
  const selected = list.find((a) => a.id === selectedId) ?? null

  const onDelete = async (a: ProgramAnnouncement) => {
    if (!window.confirm(`'${a.title}' 공지를 내리시겠습니까?`)) return
    try {
      await remove.mutateAsync(a.id)
      setSelectedId(null)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const columns: Column<ProgramAnnouncement>[] = [
    { key: 'title', header: '제목', type: 'name', primary: true },
    {
      key: 'created_at',
      header: '게시일',
      type: 'date',
      render: (a) => a.created_at.slice(0, 10),
    },
  ]

  // 작성·수정 중에는 분할을 접고 폼이 전체 폭을 쓴다 — 에디터는 좁은 칸에서 쓸 화면이 아니다.
  if (editing) {
    return (
      <Card title={editing === 'new' ? '공지 작성' : '공지 수정'}>
        <AnnouncementForm
          programId={programId}
          announcement={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card
          title="공지사항"
          count={filtered.length}
          actions={
            <Button variant="secondary" onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              작성
            </Button>
          }
        >
          {isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-3">
              <ListToolbar
                keyword={keyword}
                onKeywordChange={(v) => {
                  setKeyword(v)
                  setPage(0)
                }}
                searchPlaceholder="제목·내용 검색"
              />
              <DataTable
                columns={columns}
                rows={pageRows}
                rowKey={(a) => a.id}
                numbered={false}
                standardColumns={false}
                emptyText={
                  keyword
                    ? '검색 결과가 없습니다.'
                    : '등록된 공지가 없습니다. 작성하면 게스트 공지사항 메뉴에 보입니다.'
                }
                onRowClick={(a) => setSelectedId(selectedId === a.id ? null : a.id)}
                rowClassName={(a) => (a.id === selectedId ? 'bg-brand/5' : undefined)}
                pagination={{
                  page: safePage,
                  pageSize: LIST_PAGE_SIZE,
                  total: filtered.length,
                  onChange: setPage,
                  compact: true,
                }}
              />
            </div>
          )}
        </Card>
      </div>
      <AnnouncementBody
        announcement={selected}
        onEdit={() => selected && setEditing(selected)}
        onDelete={() => selected && void onDelete(selected)}
        deleting={remove.isPending}
      />
    </div>
  )
}

/** 우측에 서는 공지 1건(본문 + 수정·삭제). 고르기 전에는 무엇을 하라는 화면인지 말한다. */
function AnnouncementBody({
  announcement,
  onEdit,
  onDelete,
  deleting,
}: {
  announcement: ProgramAnnouncement | null
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  if (!announcement) {
    return (
      <Card title="본문">
        <p className="py-6 text-center text-body text-gray-600">
          왼쪽 목록에서 공지를 선택하면 내용이 표시됩니다.
        </p>
      </Card>
    )
  }

  return (
    <Card
      title="본문"
      actions={
        <span className="flex items-center gap-1">
          <IconButton
            variant="ghost"
            label={`'${announcement.title}' 수정`}
            onClick={onEdit}
            icon={<Pencil className="size-4" />}
          />
          <IconButton
            variant="ghost"
            danger
            label={`'${announcement.title}' 내리기`}
            disabled={deleting}
            onClick={onDelete}
            icon={<Trash2 className="size-4" />}
          />
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
          <p className="min-w-0 flex-1 text-body font-semibold text-gray-900">
            {announcement.title}
          </p>
          <span className="shrink-0 text-caption tabular-nums text-gray-500">
            {announcement.created_at.slice(0, 10)}
          </span>
        </div>
        {announcement.body ? (
          // 에디터용 최소 높이(16rem)가 읽기 전용 뷰어에 빈 공간으로 남지 않게 눕힌다.
          <div className="[&_.ProseMirror]:min-h-0">
            <RichTextViewer html={announcement.body} />
          </div>
        ) : (
          <p className="text-body text-gray-600">본문이 없는 공지입니다.</p>
        )}
      </div>
    </Card>
  )
}

/** 공지 작성·수정 폼(전체 폭). NOTICE 폼과 같은 구성이다. */
function AnnouncementForm({
  programId,
  announcement,
  onClose,
}: {
  programId: string
  announcement?: ProgramAnnouncement
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveAnnouncement(programId)
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')

  const canSubmit = Boolean(title.trim()) && !save.isPending

  const submit = async () => {
    if (!canSubmit) return
    try {
      await save.mutateAsync({
        id: announcement?.id,
        title: title.trim(),
        body: isEmptyRichText(body) ? null : body,
      })
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">제목</label>
        <Input
          autoFocus
          placeholder="예: 1차 멘토링 일정 안내"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">내용</label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="참여자에게 알릴 내용을 적어 주세요."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {save.isPending ? '저장 중…' : announcement ? '수정 완료' : '등록'}
        </Button>
      </div>
    </div>
  )
}
