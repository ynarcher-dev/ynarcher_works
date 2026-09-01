import { Badge, Button, Card, IconButton, MiniPager, Spinner, usePaged, useToast } from '@ynarcher/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { isEmptyRichText } from '@/lib/richText'
import {
  useAnswerQuestion,
  useDeleteQuestion,
  useQuestions,
  type ProgramQuestion,
} from '@/features/program/questionHooks'

/**
 * QNA 탭 — 1:1 문의함의 담당자 쪽. 게스트가 GUEST QNA 메뉴에서 올린 질문 전체를 보고
 * 답변한다(게스트에게는 본인 질문만 보인다). 질문은 순수 텍스트(게스트 입력), 답변은
 * 공용 리치텍스트다. 질문당 답변 하나 — 폼이 아니라 원장이 그렇게 생겼다(answer_* 열).
 */
export function ProgramQnaPanel({ programId }: { programId: string }) {
  const toast = useToast()
  const { data: list = [], isLoading } = useQuestions(programId)
  const remove = useDeleteQuestion(programId)
  const [openId, setOpenId] = useState<string | null>(null)
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  const onDelete = async (q: ProgramQuestion) => {
    if (!window.confirm(`'${q.title}' 질문을 내리시겠습니까? 게스트 화면에서도 사라집니다.`)) return
    try {
      await remove.mutateAsync(q.id)
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card title="QNA" count={list.length}>
      {isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-body text-gray-600">
          아직 들어온 질문이 없습니다. 게스트가 QNA 메뉴에서 질문하면 여기에 쌓입니다.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-200">
            {pageItems.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-gray-25"
                  aria-expanded={openId === q.id}
                  onClick={() => setOpenId(openId === q.id ? null : q.id)}
                >
                  <Badge tone={q.answer_body ? 'success' : 'warning'}>
                    {q.answer_body ? '답변완료' : '답변대기'}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {q.title}
                  </span>
                  <span className="shrink-0 text-caption text-gray-500">
                    {q.author?.name ?? '-'}
                    <span className="tabular-nums"> · {q.created_at.slice(0, 10)}</span>
                  </span>
                </button>
                {openId === q.id && (
                  <QuestionDetail
                    programId={programId}
                    question={q}
                    answering={answeringId === q.id}
                    onAnswering={(on) => setAnsweringId(on ? q.id : null)}
                    onDelete={() => void onDelete(q)}
                    deleting={remove.isPending}
                  />
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

/** 펼친 질문 1건: 질문 본문 → 답변(뷰어 또는 에디터) → 액션. */
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
    <div className="space-y-3 pb-3">
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
