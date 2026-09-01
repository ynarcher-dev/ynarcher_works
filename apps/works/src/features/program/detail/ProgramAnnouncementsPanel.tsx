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
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import {
  ANNOUNCEMENT_ATTACHMENT_TYPE,
  useAnnouncements,
  useDeleteAnnouncement,
  useSaveAnnouncement,
  type ProgramAnnouncement,
} from '@/features/program/announcementHooks'
import { LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/program/detail/listFilter'

/**
 * 공지사항 탭 — 사업 단위 게시판. 목록 표 위, 고른 공지의 본문과 첨부 파일 아래의
 * **상하 배치**다(2026-09-01 사용자 지정) — 사업개요 탭과 같은 이유로, 쓰는 화면인
 * WORKS는 본문 에디터와 업로드 드롭존이 전체 폭을 받는다. 읽기만 하는 GUEST 쪽은 같은
 * 내용을 좌우 2:1로 세운다.
 * 모듈별 NOTICE(메뉴당 한 건)와 축이 다르다 — 이쪽은 사업 전체를 향한 글이 여러 건 쌓인다.
 *
 * 첨부의 귀속은 화면이 아니라 **공지 1건**이다(target_type='program_announcement',
 * target_id=공지 id) — 공지가 여러 건인데 파일함을 화면에 하나 두면 어느 공지의 파일인지
 * 알 수 없다. 사업개요 파일과 축이 갈리는 지점이 여기다(그쪽은 사업당 개요가 하나라
 * target_id가 사업이다). 게스트 쪽 읽기는 RLS(20260901180000)가 연다.
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

  // 작성·수정 중에는 목록을 접고 폼이 전체 폭을 쓴다 — 에디터는 좁은 칸에서 쓸 화면이 아니다.
  if (editing) {
    return (
      <AnnouncementForm
        programId={programId}
        announcement={editing === 'new' ? undefined : editing}
        onClose={() => setEditing(null)}
        onSaved={(id) => {
          // 저장한 공지를 곧바로 펼쳐 둔다 — 방금 쓴 글과 그 첨부가 바로 눈에 든다.
          setSelectedId(id)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
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
      {/* 고른 공지의 본문과 그 공지에 딸린 파일. 아무것도 고르지 않았으면 세우지 않는다 —
          상하 배치에서는 빈 카드가 목록 바로 아래를 차지해 다음 할 일을 가린다. */}
      {selected && (
        <>
          <AnnouncementBody
            announcement={selected}
            onEdit={() => setEditing(selected)}
            onDelete={() => void onDelete(selected)}
            deleting={remove.isPending}
          />
          <MaterialPanel
            targetType={ANNOUNCEMENT_ATTACHMENT_TYPE}
            targetId={selected.id}
            title="파일"
          />
        </>
      )}
    </div>
  )
}

/** 목록 아래에 서는 공지 1건(본문 + 수정·삭제). 고른 공지가 있을 때만 렌더된다. */
function AnnouncementBody({
  announcement,
  onEdit,
  onDelete,
  deleting,
}: {
  announcement: ProgramAnnouncement
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
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

/**
 * 공지 작성·수정 폼(전체 폭) — 제목 → 내용 → 파일 → 버튼의 상하 구성.
 *
 * 파일이 붙는 방식은 신규와 수정이 갈린다. 첨부는 `target_id`(NOT NULL)로 공지에 매이므로
 * **아직 공지가 없는 신규에서는 올릴 대상이 없다** — 그래서 브라우저에 담아 두었다가
 * 저장으로 id가 생긴 직후 일괄 업로드한다(`usePendingMaterials`, 등록 폼 공통 패턴).
 * 미리 올리는 방식은 작성을 취소했을 때 주인 없는 파일이 남아 채택하지 않는다.
 */
function AnnouncementForm({
  programId,
  announcement,
  onClose,
  onSaved,
}: {
  programId: string
  announcement?: ProgramAnnouncement
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const toast = useToast()
  const save = useSaveAnnouncement(programId)
  const pending = usePendingMaterials()
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')

  const canSubmit = Boolean(title.trim()) && !save.isPending

  const submit = async () => {
    if (!canSubmit) return
    let id: string
    try {
      id = await save.mutateAsync({
        id: announcement?.id,
        title: title.trim(),
        body: isEmptyRichText(body) ? null : body,
      })
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
      return
    }
    // 공지는 이미 저장됐다. 첨부 업로드가 일부 실패해도 되돌리지 않고 실패만 알린다.
    if (!announcement && pending.count > 0) {
      const { failed } = await pending.flush(id, () => ANNOUNCEMENT_ATTACHMENT_TYPE)
      if (failed > 0) {
        toast.show(`첨부 ${failed}건을 올리지 못했습니다. 공지 저장 후 다시 올려 주세요.`, 'danger')
      }
    }
    onSaved(id)
  }

  return (
    <div className="space-y-4">
      <Card title={announcement ? '공지 수정' : '공지 작성'}>
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
        </div>
      </Card>

      {/* 수정은 대상이 이미 있으므로 즉시 업로드, 신규는 저장 때 함께 올린다. */}
      {announcement ? (
        <MaterialPanel
          targetType={ANNOUNCEMENT_ATTACHMENT_TYPE}
          targetId={announcement.id}
          title="파일"
        />
      ) : (
        <PendingMaterialPanel
          slot={ANNOUNCEMENT_ATTACHMENT_TYPE}
          pending={pending}
          title="파일"
        />
      )}

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
