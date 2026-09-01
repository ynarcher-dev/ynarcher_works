import { Button, Card, IconButton, Input, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import {
  useDeleteNotice,
  useModuleNotices,
  useSaveNotice,
  type ProgramNotice,
} from '@/features/program/noticeHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/** TipTap이 내는 빈 본문(`<p></p>`)을 걸러낸다 — 이미지 한 장만 있는 본문은 빈 것이 아니다. */
function isEmptyHtml(html: string): boolean {
  return !html.includes('<img') && html.replace(/<[^>]*>/g, '').trim() === ''
}

/**
 * 메뉴별 NOTICE(알림) 패널. GUEST 메뉴 우측의 NOTICE 칸과 **같은 구성**(제목·본문·날짜
 * 목록)이며, 차이는 편집 가능 여부뿐이다 — WORKS에서 세우고 게스트가 같은 자리에서 읽는다.
 * 글쓰기(POST) 화면에는 세우지 않는다(그 자체가 글쓰기 기능이라 알림 글이 중복된다).
 * 본문 에디터·뷰어는 게시판·글쓰기와 같은 공용 리치텍스트(RichTextEditor) 하나를 쓴다 —
 * 에디터가 바뀌면 NOTICE도 함께 바뀐다.
 */
export function NoticePanel({
  programId,
  moduleId,
}: {
  programId: string
  moduleId: string
}) {
  const { data: notices = [], isLoading } = useModuleNotices(moduleId)
  // undefined=목록 / null=신규 작성 / ProgramNotice=수정
  const [editing, setEditing] = useState<ProgramNotice | null | undefined>(undefined)

  return (
    <Card
      title="NOTICE"
      count={notices.length}
      actions={
        editing === undefined ? (
          <Button variant="secondary" onClick={() => setEditing(null)}>
            <Plus className="size-4" />
            알림 추가
          </Button>
        ) : undefined
      }
    >
      {editing !== undefined ? (
        <NoticeForm
          key={editing?.id ?? 'new'}
          programId={programId}
          moduleId={moduleId}
          notice={editing ?? undefined}
          onDone={() => setEditing(undefined)}
          onCancel={() => setEditing(undefined)}
        />
      ) : isLoading ? (
        <Spinner />
      ) : notices.length === 0 ? (
        <p className="py-6 text-center text-body text-gray-600">
          등록된 알림이 없습니다. 게스트 화면 우측에 이 목록이 그대로 보입니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {notices.map((notice) => (
            <NoticeRow
              key={notice.id}
              notice={notice}
              moduleId={moduleId}
              onEdit={() => setEditing(notice)}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

/** 알림 1건: 제목·본문·게시일 + 수정·삭제. */
function NoticeRow({
  notice,
  moduleId,
  onEdit,
}: {
  notice: ProgramNotice
  moduleId: string
  onEdit: () => void
}) {
  const toast = useToast()
  const remove = useDeleteNotice(moduleId)

  const onDelete = async () => {
    if (!window.confirm(`'${notice.title}' 알림을 삭제하시겠습니까?`)) return
    try {
      await remove.mutateAsync(notice.id)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <li className="relative rounded-radius-md border border-gray-300 bg-white py-3 pl-4 pr-20">
      {/* 머리(공지명·게시일)와 콘텐츠(본문)를 헤어라인으로 가른다 — 본문이 제목(h1)으로
          시작해도 어디까지가 알림의 이름인지 선이 답한다. min-h-0은 에디터용 최소 높이
          (16rem)가 읽기 전용 뷰어에 빈 공간으로 남는 것을 이 자리에서만 눕힌다. */}
      <p className="text-body font-semibold text-gray-900">{notice.title}</p>
      <p className="mt-0.5 text-caption tabular-nums text-gray-500">
        {notice.created_at.slice(0, 10)}
      </p>
      {notice.body && (
        <div className="mt-2 border-t border-gray-200 pt-2 [&_.ProseMirror]:min-h-0">
          <RichTextViewer html={notice.body} />
        </div>
      )}
      <span className="absolute right-3 top-3 z-10 flex items-center gap-1">
        <IconButton
          variant="ghost"
          label={`${notice.title} 수정`}
          onClick={onEdit}
          icon={<Pencil className="size-4" />}
        />
        <IconButton
          variant="ghost"
          danger
          label={`${notice.title} 삭제`}
          disabled={remove.isPending}
          onClick={() => void onDelete()}
          icon={<Trash2 className="size-4" />}
        />
      </span>
    </li>
  )
}

/** 알림 작성·수정 폼(카드 안에서 목록과 자리를 바꾼다 — LinkPanel과 같은 방식). */
function NoticeForm({
  programId,
  moduleId,
  notice,
  onDone,
  onCancel,
}: {
  programId: string
  moduleId: string
  notice?: ProgramNotice
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const save = useSaveNotice(programId, moduleId)
  const [title, setTitle] = useState(notice?.title ?? '')
  const [body, setBody] = useState(notice?.body ?? '')

  const canSubmit = Boolean(title.trim()) && !save.isPending

  const submit = async () => {
    if (!canSubmit) return
    try {
      await save.mutateAsync({
        id: notice?.id,
        title: title.trim(),
        body: isEmptyHtml(body) ? null : body,
      })
      onDone()
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
          placeholder="예: 제출 마감 연장 안내"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">내용</label>
        {/* 게시판·글쓰기와 같은 공용 에디터. 저장 값은 HTML이다. */}
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="게스트에게 전할 내용을 적어 주세요."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={save.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {save.isPending ? '저장 중…' : notice ? '수정 완료' : '추가'}
        </Button>
      </div>
    </div>
  )
}

/**
 * 모듈 본문 + NOTICE의 2:1 분할(GUEST 메뉴 화면과 같은 비율). NOTICE 원장이 없는
 * 워크스페이스(M&A·PROJECT)는 분할 없이 본문을 전체 폭 그대로 둔다.
 */
export function ModuleNoticeSplit({
  programId,
  moduleId,
  children,
}: {
  programId: string
  moduleId: string
  children: ReactNode
}) {
  const config = useProgramWorkspace()
  if (!config.tables.notices) return <>{children}</>
  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 lg:space-y-0">
      <div className="min-w-0">{children}</div>
      <div className="min-w-0">
        <NoticePanel programId={programId} moduleId={moduleId} />
      </div>
    </div>
  )
}
