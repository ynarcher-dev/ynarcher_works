import { Button, Card, IconButton, Input, MiniPager, Spinner, usePaged, useToast } from '@ynarcher/ui'
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

/**
 * 공지사항 탭 — 사업 단위 게시판. GUEST 고정 메뉴 '공지사항'과 **같은 구성**(제목 줄 →
 * 펼쳐 읽기)이며, 차이는 작성·수정·삭제뿐이다. 모듈별 NOTICE(메뉴당 한 건)와 축이 다르다 —
 * 이쪽은 사업 전체를 향한 글이 여러 건 쌓인다. 머리 한 줄 규격([브랜드 바 | 제목 | 게시일])은
 * NOTICE와 같다.
 */
export function ProgramAnnouncementsPanel({ programId }: { programId: string }) {
  const toast = useToast()
  const { data: list = [], isLoading } = useAnnouncements(programId)
  const remove = useDeleteAnnouncement(programId)
  const [editing, setEditing] = useState<ProgramAnnouncement | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  const onDelete = async (a: ProgramAnnouncement) => {
    if (!window.confirm(`'${a.title}' 공지를 내리시겠습니까?`)) return
    try {
      await remove.mutateAsync(a.id)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title="공지사항"
      count={list.length}
      actions={
        !editing ? (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            작성
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <AnnouncementForm
          programId={programId}
          announcement={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-body text-gray-600">
          등록된 공지가 없습니다. 작성하면 게스트 공지사항 메뉴에 보입니다.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-200">
            {pageItems.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-gray-25"
                  aria-expanded={openId === a.id}
                  onClick={() => setOpenId(openId === a.id ? null : a.id)}
                >
                  <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {a.title}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-gray-500">
                    {a.created_at.slice(0, 10)}
                  </span>
                </button>
                {openId === a.id && (
                  <div className="pb-3 pl-2.5">
                    {a.body && (
                      <div className="[&_.ProseMirror]:min-h-0">
                        <RichTextViewer html={a.body} />
                      </div>
                    )}
                    <div className="mt-2 flex justify-end gap-1">
                      <IconButton
                        variant="ghost"
                        label={`'${a.title}' 수정`}
                        onClick={() => setEditing(a)}
                        icon={<Pencil className="size-4" />}
                      />
                      <IconButton
                        variant="ghost"
                        danger
                        label={`'${a.title}' 내리기`}
                        disabled={remove.isPending}
                        onClick={() => void onDelete(a)}
                        icon={<Trash2 className="size-4" />}
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </Card>
  )
}

/** 공지 작성·수정 폼(카드 안에서 목록과 자리를 바꾼다 — NOTICE 폼과 같은 패턴). */
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
