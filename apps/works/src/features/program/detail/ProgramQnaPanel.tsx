import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyValue,
  IconButton,
  ListToolbar,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import { LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/program/detail/listFilter'
import {
  useAnswerQuestion,
  useDeleteQuestion,
  useQuestions,
  type ProgramQuestion,
} from '@/features/program/questionHooks'

/**
 * QNA 탭 — 1:1 문의함의 담당자 쪽. 게스트가 GUEST QNA 메뉴에서 올린 질문 전체를 표로 보고
 * 답변한다(게스트에게는 본인 질문만 보인다). 행을 누르면 표 아래에 질문·답변 상세가 선다 —
 * 표의 행은 훑는 자리고 본문은 읽는 자리라, 행 안에 본문을 펼치면 열 위치가 흔들린다.
 * GUEST QNA 화면과 같은 표·검색 구성이며, 답변·삭제만 이쪽에 있다.
 * 검색 대상에 답변 본문과 질문자 이름을 함께 넣는다 — 담당자가 되짚는 실마리는 대체로
 * "누가 물었더라"이거나 "뭐라고 답했더라"다.
 * 질문은 순수 텍스트(게스트 입력), 답변은 공용 리치텍스트다 — 질문당 답변 하나이며 폼이
 * 아니라 원장이 그렇게 생겼다(answer_* 열).
 */
export function ProgramQnaPanel({ programId }: { programId: string }) {
  const toast = useToast()
  const { data: list = [], isLoading } = useQuestions(programId)
  const remove = useDeleteQuestion(programId)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)

  const filtered = list.filter((q) =>
    matchesKeyword(keyword, q, `${q.answer_body ?? ''} ${q.author?.name ?? ''}`),
  )
  const { pageRows, safePage } = pageSlice(filtered, page)
  const selected = list.find((q) => q.id === selectedId) ?? null

  const onDelete = async (q: ProgramQuestion) => {
    if (!window.confirm(`'${q.title}' 질문을 내리시겠습니까? 게스트 화면에서도 사라집니다.`)) return
    try {
      await remove.mutateAsync(q.id)
      setSelectedId(null)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
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
    { key: 'title', header: '제목', type: 'name', primary: true },
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
            setSelectedId(selectedId === q.id ? null : q.id)
            setAnswering(false)
          }}
          rowClassName={(q) => (q.id === selectedId ? 'bg-brand/5' : undefined)}
          pagination={{
            page: safePage,
            pageSize: LIST_PAGE_SIZE,
            total: filtered.length,
            onChange: setPage,
            compact: true,
          }}
        />
        {selected && (
          <QuestionDetail
            programId={programId}
            question={selected}
            answering={answering}
            onAnswering={setAnswering}
            onDelete={() => void onDelete(selected)}
            deleting={remove.isPending}
          />
        )}
      </div>
    </Card>
  )
}

/** 표 아래에 서는 질문 1건: 머리 한 줄 → 질문 본문 → 답변(뷰어 또는 에디터) → 액션. */
function QuestionDetail({
  programId,
  question,
  answering,
  onAnswering,
  onDelete,
  deleting,
}: {
  programId: string
  question: ProgramQuestion
  answering: boolean
  onAnswering: (on: boolean) => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
        <p className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
          {question.title}
        </p>
        <span className="shrink-0 text-caption text-gray-500">
          {question.author?.name ?? '-'}
          <span className="tabular-nums"> · {question.created_at.slice(0, 10)}</span>
        </span>
      </div>
      {question.body && (
        <p className="whitespace-pre-line text-body text-gray-800">{question.body}</p>
      )}
      {/* 답변은 질문과 같은 축이 아니라 그 아래 응답이므로, 브랜드 선으로 들여 세운다. */}
      <div className="border-l-2 border-brand/40 pl-3">
        {answering ? (
          <AnswerForm
            programId={programId}
            question={question}
            onClose={() => onAnswering(false)}
          />
        ) : question.answer_body ? (
          <div className="[&_.ProseMirror]:min-h-0">
            <RichTextViewer html={question.answer_body} />
          </div>
        ) : (
          <p className="text-body text-gray-600">아직 답변하지 않았습니다.</p>
        )}
      </div>
      {!answering && (
        <div className="flex justify-end gap-1">
          <IconButton
            variant="ghost"
            danger
            label={`'${question.title}' 질문 내리기`}
            disabled={deleting}
            onClick={onDelete}
            icon={<Trash2 className="size-4" />}
          />
          <Button variant="secondary" onClick={() => onAnswering(true)}>
            {question.answer_body ? '답변 수정' : '답변 작성'}
          </Button>
        </div>
      )}
    </div>
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
