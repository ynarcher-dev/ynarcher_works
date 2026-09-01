import {
  Button,
  Card,
  DataTable,
  Field,
  Input,
  ListToolbar,
  Modal,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { Paperclip, Plus } from 'lucide-react'
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
import { useAttachmentCounts } from '@/features/program/detail/attachmentCounts'
import { BoardDetailModal } from '@/features/program/detail/BoardDetailModal'
import { LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/program/detail/listFilter'

/**
 * 공지사항 탭 — 사업 단위 게시판. 목록 표가 전체 폭으로 서고, 행을 누르면 **상세 모달**이
 * 열린다(2026-09-01 사용자 지정). 모달은 QNA와 같은 부품(BoardDetailModal)이라 두 화면이
 * 같은 구조로 글과 첨부를 보여 준다. GUEST 공지사항 화면도 같은 구성이며 편집만 없다.
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
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProgramAnnouncement | 'new' | null>(null)

  const filtered = list.filter((a) => matchesKeyword(keyword, a))
  const { pageRows, safePage } = pageSlice(filtered, page)
  const opened = list.find((a) => a.id === openId) ?? null
  // 클립 표식은 화면에 뜬 행만 센다 — 목록 전체를 세면 안 보이는 행까지 왕복에 싣는다.
  const { data: fileCounts } = useAttachmentCounts(
    ANNOUNCEMENT_ATTACHMENT_TYPE,
    pageRows.map((a) => a.id),
  )

  const onDelete = async (a: ProgramAnnouncement) => {
    if (!window.confirm(`'${a.title}' 공지를 내리시겠습니까?`)) return
    try {
      await remove.mutateAsync(a.id)
      setOpenId(null)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const columns: Column<ProgramAnnouncement>[] = [
    {
      key: 'title',
      header: '제목',
      type: 'name',
      primary: true,
      // 첨부가 있으면 제목 뒤에 클립을 단다 — 열어 보기 전에 "받을 것이 있는가"를 답한다.
      render: (a) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{a.title}</span>
          {(fileCounts?.[a.id] ?? 0) > 0 && (
            <Paperclip
              className="size-3.5 shrink-0 text-gray-500"
              aria-label={`첨부 ${fileCounts?.[a.id]}건`}
            />
          )}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: '게시일',
      type: 'date',
      render: (a) => a.created_at.slice(0, 10),
    },
  ]

  return (
    <>
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
              onRowClick={(a) => setOpenId(a.id)}
              // 페이저는 목록 화면의 기본 양식(번호줄·건수)을 그대로 쓴다 — 한 쪽뿐이어도
              // 노출되어 지금 어디인지·전부 몇 건인지를 항상 답한다(2026-09-01 사용자 지정).
              pagination={{
                page: safePage,
                pageSize: LIST_PAGE_SIZE,
                total: filtered.length,
                onChange: setPage,
              }}
            />
          </div>
        )}
      </Card>

      {editing && (
        <AnnouncementFormModal
          programId={programId}
          announcement={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            // 저장한 공지를 곧바로 상세로 이어 연다 — 방금 쓴 글과 그 첨부가 바로 눈에 든다.
            setEditing(null)
            setOpenId(id)
          }}
        />
      )}

      {opened && !editing && (
        <BoardDetailModal
          open
          onClose={() => setOpenId(null)}
          meta="공지사항"
          title={opened.title}
          date={opened.created_at.slice(0, 10)}
          body={
            opened.body ? (
              // 에디터용 최소 높이(16rem)가 읽기 전용 뷰어에 빈 공간으로 남지 않게 눕힌다.
              <div className="[&_.ProseMirror]:min-h-0">
                <RichTextViewer html={opened.body} />
              </div>
            ) : (
              <p className="text-body text-gray-600">본문이 없는 공지입니다.</p>
            )
          }
          attachmentType={ANNOUNCEMENT_ATTACHMENT_TYPE}
          attachmentId={opened.id}
          destructiveAction={
            <Button variant="outline-danger" onClick={() => void onDelete(opened)}>
              삭제
            </Button>
          }
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpenId(null)
                  setEditing(opened)
                }}
              >
                수정
              </Button>
              <Button onClick={() => setOpenId(null)}>닫기</Button>
            </>
          }
        />
      )}
    </>
  )
}

/**
 * 공지 작성·수정 **모달** — 제목 → 내용 → 첨부 파일의 카드 구성(2026-09-01 사용자 지정).
 * 상세 모달과 같은 자리에서 열리고 닫히므로, 목록은 그 사이에도 화면에 남는다.
 *
 * 파일이 붙는 방식은 신규와 수정이 갈린다. 첨부는 `target_id`(NOT NULL)로 공지에 매이므로
 * **아직 공지가 없는 신규에서는 올릴 대상이 없다** — 그래서 브라우저에 담아 두었다가
 * 저장으로 id가 생긴 직후 일괄 업로드한다(`usePendingMaterials`, 등록 폼 공통 패턴).
 * 미리 올리는 방식은 작성을 취소했을 때 주인 없는 파일이 남아 채택하지 않는다.
 */
function AnnouncementFormModal({
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
    <Modal
      open
      onClose={onClose}
      // 쓰던 글이 바깥 클릭 한 번에 사라지면 안 된다 — 닫는 길은 취소 버튼뿐이다.
      dismissible={false}
      title={announcement ? '공지 수정' : '공지 작성'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {save.isPending ? '저장 중…' : announcement ? '수정 완료' : '등록'}
          </Button>
        </>
      }
    >
      {/* 상세 모달과 같은 바닥·카드 구성 — 쓰는 화면과 읽는 화면이 같은 모양이어야 한다. */}
      <div className="-mx-5 -my-4 space-y-3 bg-gray-100 px-5 py-4">
        <Card title="내용">
          {/* 폼 라벨 규격은 화면이 아니라 `Field`가 소유한다(densityScale.formText). */}
          <div className="space-y-4">
            <Field label="제목" required>
              <Input
                autoFocus
                placeholder="예: 1차 멘토링 일정 안내"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field as="div" label="본문">
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder="참여자에게 알릴 내용을 적어 주세요."
              />
            </Field>
          </div>
        </Card>

        {/* 수정은 대상이 이미 있으므로 즉시 업로드, 신규는 저장 때 함께 올린다. */}
        {announcement ? (
          <MaterialPanel
            targetType={ANNOUNCEMENT_ATTACHMENT_TYPE}
            targetId={announcement.id}
            title="첨부 파일"
          />
        ) : (
          <PendingMaterialPanel
            slot={ANNOUNCEMENT_ATTACHMENT_TYPE}
            pending={pending}
            title="첨부 파일"
          />
        )}
      </div>
    </Modal>
  )
}
