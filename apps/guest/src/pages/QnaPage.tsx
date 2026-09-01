import {
  Badge,
  Card,
  DataTable,
  EmptyValue,
  Input,
  ListToolbar,
  PageHeader,
  Spinner,
  TextArea,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { BoardDetailModal } from '@/components/BoardDetailModal'
import { GuestButton } from '@/components/GuestButton'
import { useAttachmentCounts } from '@/features/attachmentCounts'
import { GUEST_LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/listFilter'
import {
  useCreateQuestion,
  useMyQuestions,
  useQuestionFiles,
  type GuestQuestion,
} from '@/features/qnaHooks'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

const QUESTION_ATTACHMENT_TYPE = 'program_question'

/**
 * QNA — 고정 메뉴 세 번째 줄이자 **게스트가 처음으로 글을 쓰는 화면**(1:1 문의함).
 * 좌측(2)은 내 질문 표, 우측(1)은 질문 작성이다(메뉴 화면과 같은 2:1 비율).
 * 행을 누르면 **상세 모달**에서 질문·답변·첨부를 읽는다 — WORKS QNA 탭과 같은 부품
 * (BoardDetailModal)이라 두 앱이 같은 구조로 글과 첨부를 보여 준다(2026-09-01 지정).
 * 다른 참여자의 질문은 보이지 않는다 — 판정은 화면이 아니라 RLS가 한다(qnaHooks 머리말).
 */
export function QnaPage() {
  const { data, isLoading } = useMyQuestions()
  const list = data ?? []

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      {/* 설명 줄은 두지 않는다(2026-09-01) — 무엇을 하는 화면인지는 '질문하기' 카드와
          '내 질문' 목록이 이미 말하고, 본인에게만 보인다는 사실도 그 두 이름에 들어 있다. */}
      <PageHeader title="QNA" />
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <MyQuestionsCard list={list} />
        </div>
        <div className="mt-5 min-w-0 lg:mt-0">
          <AskCard />
        </div>
      </div>
    </div>
  )
}

/**
 * 내 질문 — 데이터테이블 + 검색. 행을 누르면 상세 모달이 열린다. 순번·표준 메타 열은
 * 두지 않는다(작성자는 언제나 본인이고, 이 표가 답하는 것은 "무엇을 물었고 답이 왔는가"뿐).
 * 검색 대상에 답변 본문도 넣는다 — 찾는 사람이 기억하는 말이 질문이 아니라 답에 있을 수 있다.
 */
function MyQuestionsCard({ list }: { list: GuestQuestion[] }) {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const filtered = list.filter((q) => matchesKeyword(keyword, q, q.answer_body))
  const { pageRows, safePage } = pageSlice(filtered, page)
  const opened = list.find((q) => q.id === openId) ?? null
  const { data: fileCounts } = useAttachmentCounts(
    QUESTION_ATTACHMENT_TYPE,
    pageRows.map((q) => q.id),
  )

  const columns: Column<GuestQuestion>[] = [
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

  return (
    <>
      <Card title="내 질문" count={filtered.length}>
        <div className="space-y-3">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={(v) => {
              setKeyword(v)
              setPage(0)
            }}
            searchPlaceholder="제목·내용·답변 검색"
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
                : '아직 남긴 질문이 없습니다. 오른쪽에서 첫 질문을 남겨 보세요.'
            }
            onRowClick={(q) => setOpenId(q.id)}
            pagination={{
              page: safePage,
              pageSize: GUEST_LIST_PAGE_SIZE,
              total: filtered.length,
              onChange: setPage,
              compact: true,
            }}
          />
        </div>
      </Card>
      {opened && <QuestionModal question={opened} onClose={() => setOpenId(null)} />}
    </>
  )
}

/** 질문 1건의 상세 모달(질문 본문 → 답변 → 첨부). 첨부는 열린 질문의 것만 조회한다. */
function QuestionModal({
  question,
  onClose,
}: {
  question: GuestQuestion
  onClose: () => void
}) {
  const { data: files } = useQuestionFiles(question.id)

  return (
    <BoardDetailModal
      open
      onClose={onClose}
      meta="QNA"
      title={question.title}
      date={question.created_at.slice(0, 10)}
      body={
        question.body ? (
          <p className="whitespace-pre-line text-body text-gray-800">{question.body}</p>
        ) : (
          <p className="text-body text-gray-600">본문이 없는 질문입니다.</p>
        )
      }
      extra={
        // 답변은 질문 아래 응답이므로 브랜드 선으로 들여 세운다(WORKS와 같은 자리).
        <div className="border-l-2 border-brand/40 pl-3">
          {question.answer_body ? (
            <div
              className={RICH_BODY_CLASS}
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(question.answer_body) }}
            />
          ) : (
            <p className="text-body text-gray-600">담당자의 답변을 기다리고 있습니다.</p>
          )}
        </div>
      }
      files={files ?? []}
    />
  )
}

/** 질문 작성 카드. 등록되면 목록 맨 위에 답변대기로 선다. */
function AskCard() {
  const toast = useToast()
  const create = useCreateQuestion()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const canSubmit = Boolean(title.trim() && body.trim()) && !create.isPending

  const submit = async () => {
    if (!canSubmit) return
    try {
      await create.mutateAsync({ title: title.trim(), body: body.trim() })
      setTitle('')
      setBody('')
      toast.show('질문을 등록했습니다. 담당자가 확인 후 답변합니다.', 'success')
    } catch {
      toast.show('질문을 등록하지 못했습니다. 잠시 후 다시 시도해 주십시오.', 'danger')
    }
  }

  return (
    <Card title="질문하기">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-gray-600">제목</label>
          <Input
            placeholder="예: 중간보고서 제출 방법 문의"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-gray-600">내용</label>
          <TextArea
            rows={6}
            placeholder="궁금한 내용을 적어 주세요."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <GuestButton className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
          {create.isPending ? '등록 중…' : '질문 등록'}
        </GuestButton>
      </div>
    </Card>
  )
}
