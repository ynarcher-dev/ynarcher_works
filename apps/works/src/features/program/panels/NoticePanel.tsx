import { Button, Card, Field, IconButton, Input, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import {
  useDeleteNotice,
  useModuleNotices,
  useSaveNotice,
  type ProgramNotice,
} from '@/features/program/noticeHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 메뉴별 NOTICE(알림) 패널. GUEST 메뉴 우측의 NOTICE 칸과 **같은 구성**이며, 차이는 편집
 * 가능 여부뿐이다 — WORKS에서 세우고 게스트가 같은 자리에서 읽는다.
 *
 * **메뉴 하나 = 알림 하나**다(글쓰기 모듈의 "모듈 하나 = 글 하나"와 같은 판정) — 목록을
 * 두지 않고 최신 미삭제 한 건을 알림으로 본다. 여러 소식을 알리고 싶으면 본문을 고쳐 쓰는
 * 것이지 글을 쌓는 것이 아니다. 글쓰기(POST) 화면에는 세우지 않는다(그 자체가 글이다).
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
  const toast = useToast()
  const { data: notices = [], isLoading } = useModuleNotices(moduleId)
  const remove = useDeleteNotice(moduleId)
  const [editing, setEditing] = useState(false)

  // 이 메뉴의 알림 한 건. 과거에 여러 건이 쌓였다면 최신 글을 알림으로 본다.
  const notice = notices[0]

  const onDelete = async () => {
    if (!notice) return
    if (!window.confirm(`'${notice.title}' 알림을 내리시겠습니까?`)) return
    try {
      await remove.mutateAsync(notice.id)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title="NOTICE"
      actions={
        !editing ? (
          <span className="flex items-center gap-1">
            {notice && (
              <IconButton
                variant="ghost"
                danger
                label="알림 내리기"
                disabled={remove.isPending}
                onClick={() => void onDelete()}
                icon={<Trash2 className="size-4" />}
              />
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {notice ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {notice ? '수정' : '작성'}
            </Button>
          </span>
        ) : undefined
      }
    >
      {editing ? (
        <NoticeForm
          programId={programId}
          moduleId={moduleId}
          notice={notice}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : isLoading ? (
        <Spinner />
      ) : !notice ? (
        <p className="py-6 text-center text-body text-gray-600">
          등록된 알림이 없습니다. 작성하면 게스트 메뉴 우측 같은 자리에 보입니다.
        </p>
      ) : (
        <NoticeView notice={notice} />
      )}
    </Card>
  )
}

/**
 * 알림 한 건의 표시. 머리는 [브랜드 바 | 공지명 | 게시일] 한 줄 — 바가 어디까지가 알림의
 * 이름인지 답하고(본문이 h1로 시작해도), 화면의 포인트 색 역할을 겸한다. 본문은 바 폭만큼
 * 들여 머리와 같은 축에 선다. min-h-0은 에디터용 최소 높이(16rem)가 읽기 전용 뷰어에
 * 빈 공간으로 남는 것을 이 자리에서만 눕힌다.
 */
function NoticeView({ notice }: { notice: ProgramNotice }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
        <p className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
          {notice.title}
        </p>
        <span className="shrink-0 text-caption tabular-nums text-gray-500">
          {notice.created_at.slice(0, 10)}
        </span>
      </div>
      {notice.body && (
        <div className="mt-1.5 pl-2.5 [&_.ProseMirror]:min-h-0">
          <RichTextViewer html={notice.body} />
        </div>
      )}
    </div>
  )
}

/** 알림 작성·수정 폼(카드 안에서 표시와 자리를 바꾼다). */
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
        body: isEmptyRichText(body) ? null : body,
      })
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  // 폼 라벨 규격은 화면이 아니라 `Field`가 소유한다(densityScale.formText).
  return (
    <div className="space-y-4">
      <Field label="공지명" required>
        <Input
          autoFocus
          placeholder="예: 제출 마감 연장 안내"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field as="div" label="내용">
        {/* 게시판·글쓰기와 같은 공용 에디터. 저장 값은 HTML이다. */}
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="게스트에게 전할 내용을 적어 주세요."
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={save.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {save.isPending ? '저장 중…' : notice ? '수정 완료' : '등록'}
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
