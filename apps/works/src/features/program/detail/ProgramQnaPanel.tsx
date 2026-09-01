import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyValue,
  ListToolbar,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import { useAttachmentCounts } from '@/features/program/detail/attachmentCounts'
import { BoardDetailModal } from '@/features/program/detail/BoardDetailModal'
import { LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/program/detail/listFilter'
import {
  QUESTION_ATTACHMENT_TYPE,
  useAnswerQuestion,
  useDeleteQuestion,
  useQuestions,
  type ProgramQuestion,
} from '@/features/program/questionHooks'

/**
 * QNA 탭 — 1:1 문의함의 담당자 쪽. 게스트가 GUEST QNA 메뉴에서 올린 질문 전체를 표로 보고,
 * 행을 누르면 **상세 모달**에서 답변한다(2026-09-01 사용자 지정). 모달은 공지사항과 같은
 * 부품(BoardDetailModal)이라 두 화면이 같은 구조로 글과 첨부를 보여 준다.
 * 게스트에게는 본인 질문만 보이며, GUEST QNA 화면도 같은 모달로 질문·답변·첨부를 읽는다.
 *
 * 질문은 순수 텍스트(게스트 입력), 답변은 공용 리치텍스트다 — 질문당 답변 하나이며 폼이
 * 아니라 원장이 그렇게 생겼다(answer_* 열). 첨부는 질문 1건에 매이며 담당자만 올린다.
 * 검색 대상에 답변 본문과 질문자 이름을 함께 넣는다 — 담당자가 되짚는 실마리는 대체로
 * "누가 물었더라"이거나 "뭐라고 답했더라"다.
 */
export function ProgramQnaPanel({ programId }: { programId: string }) {
  const toast = useToast()
  const { data: list = [], isLoading } = useQuestions(programId)
  const remove = useDeleteQuestion(programId)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)

  const filtered = list.filter((q) =>
    matchesKeyword(keyword, q, `${q.answer_body ?? ''} ${q.author?.name ?? ''}`),
  )
  const { pageRows, safePage } = pageSlice(filtered, page)
  const opened = list.find((q) => q.id === openId) ?? null
  const { data: fileCounts } = useAttachmentCounts(
    QUESTION_ATTACHMENT_TYPE,
    pageRows.map((q) => q.id),
  )

  const onDelete = async (q: ProgramQuestion) => {
    if (!window.confirm(`'${q.title}' 질문을 내리시겠습니까? 게스트 화면에서도 사라집니다.`)) return
    try {
      await remove.mutateAsync(q.id)
      setOpenId(null)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const closeModal = () => {
    setOpenId(null)
    setAnswering(false)
  }

  const columns: Column<ProgramQuestion>[] = [
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      render: (q) => (
        <Badge tone={q.answer_body ? 'success' : 'warning'}>
          {q.answer_body ? '답변완료' : '답변대기'}
        </Badge>
      ),
    },
    {
      key: 'title',
      header: '제목',
      type: 'name',
      primary: true,
      render: (q) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{q.title}</span>
          {(fileCounts?.[q.id] ?? 0) > 0 && (
            <Paperclip
              className="size-3.5 shrink-0 text-gray-500"
              aria-label={`첨부 ${fileCounts?.[q.id]}건`}
            />
          )}
        </span>
      ),
    },
    {
      key: 'author',
      header: '질문자',
      type: 'person',
      render: (q) => q.author?.name ?? <EmptyValue />,
    },
    {
      key: 'created_at',
      header: '질문일',
      type: 'date',
      render: (q) => q.created_at.slice(0, 10),
    },
    {
      key: 'answered_at',
      header: '답변일',
      type: 'date',
      render: (q) => (q.answered_at ? q.answered_at.slice(0, 10) : <EmptyValue />),
    },
  ]

  if (isLoading) {
    return (
      <Card title="QNA">
        <Spinner />
      </Card>
    )
  }

  return (
    <>
      <Card title="QNA" count={filtered.length}>
        <div className="space-y-3">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={(v) => {
              setKeyword(v)
              setPage(0)
            }}
            searchPlaceholder="제목·내용·답변·질문자 검색"
          />
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(q) => q.id}
            numbered={false}
            standardColumns={false}
            emptyText={
              keyword
                ? '검색 결과가 없습니다.'
                : '아직 들어온 질문이 없습니다. 게스트가 QNA 메뉴에서 질문하면 여기에 쌓입니다.'
            }
            onRowClick={(q) => {
              setOpenId(q.id)
              setAnswering(false)
            }}
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
      </Card>

      {opened && (
        <BoardDetailModal
          open
          onClose={closeModal}
          meta="QNA"
          title={opened.title}
          date={`${opened.author?.name ?? '-'} · ${opened.created_at.slice(0, 10)}`}
          body={
            opened.body ? (
              <p className="whitespace-pre-line text-body text-gray-800">{opened.body}</p>
            ) : (
              <p className="text-body text-gray-600">본문이 없는 질문입니다.</p>
            )
          }
          answer={
            answering ? (
              <AnswerForm
                programId={programId}
                question={opened}
                onClose={() => setAnswering(false)}
              />
            ) : opened.answer_body ? (
              <div className="[&_.ProseMirror]:min-h-0">
                <RichTextViewer html={opened.answer_body} />
              </div>
            ) : (
              <p className="text-body text-gray-600">아직 답변하지 않았습니다.</p>
            )
          }
          attachmentType={QUESTION_ATTACHMENT_TYPE}
          attachmentId={opened.id}
          destructiveAction={
            !answering ? (
              <Button variant="outline-danger" onClick={() => void onDelete(opened)}>
                삭제
              </Button>
            ) : undefined
          }
          actions={
            !answering ? (
              <>
                <Button variant="secondary" onClick={() => setAnswering(true)}>
                  {opened.answer_body ? '답변 수정' : '답변 작성'}
                </Button>
                <Button onClick={closeModal}>닫기</Button>
              </>
            ) : undefined
          }
        />
      )}
    </>
  )
}

/** 답변 작성·수정 폼. 본문을 비워 저장하면 답변을 거둔 것(답변대기 복귀)으로 본다. */
function AnswerForm({
  programId,
  question,
  onClose,
}: {
  programId: string
  question: ProgramQuestion
  onClose: () => void
}) {
  const toast = useToast()
  const answer = useAnswerQuestion(programId)
  const [body, setBody] = useState(question.answer_body ?? '')

  const submit = async () => {
    if (answer.isPending) return
    try {
      await answer.mutateAsync({
        id: question.id,
        answerBody: isEmptyRichText(body) ? null : body,
      })
      onClose()
    } catch {
      toast.show('답변 저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-3">
      <RichTextEditor
        value={body}
        onChange={setBody}
        placeholder="질문한 게스트에게 보일 답변을 적어 주세요."
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={answer.isPending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={answer.isPending}>
          {answer.isPending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}
