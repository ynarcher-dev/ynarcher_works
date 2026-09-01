import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyValue,
  Field,
  Input,
  ListToolbar,
  Modal,
  PageHeader,
  Spinner,
  TextArea,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { MessageCirclePlus, Paperclip } from 'lucide-react'
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
 *
 * 목록이 전체 폭으로 서고, 쓰는 일과 읽는 일이 모두 **모달**에서 일어난다(2026-09-01
 * 사용자 지정) — 질문 작성 폼을 우측에 상시로 세워 두면 대개 비어 있는 폼이 화면 절반을
 * 계속 차지하고, 정작 자주 하는 일(내 질문과 답변을 훑는 것)이 좁은 칸으로 밀린다.
 * 상세 모달은 WORKS QNA 탭과 같은 부품(BoardDetailModal)이라 두 앱이 같은 구조로 보여 준다.
 * 다른 참여자의 질문은 보이지 않는다 — 판정은 화면이 아니라 RLS가 한다(qnaHooks 머리말).
 */
export function QnaPage() {
  const { data, isLoading } = useMyQuestions()
  const list = data ?? []

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      {/* 설명 줄은 두지 않는다(2026-09-01) — 무엇을 하는 화면인지는 '질문하기' 버튼과
          '내 질문' 목록이 이미 말하고, 본인에게만 보인다는 사실도 그 두 이름에 들어 있다. */}
      <PageHeader title="QNA" />
      {/* 본문 폭은 다른 GUEST 화면과 같은 2:1 격자를 따른다(2026-09-01 사용자 지정) —
          목록이 화면 전체를 가로지르면 메뉴마다 콘텐츠의 좌우 끝이 달라진다. 우측 칸은
          비워 두되 자리는 지킨다(상세·작성이 모달로 열려 곁칸에 세울 것이 없다). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <MyQuestionsCard list={list} />
        </div>
      </div>
    </div>
  )
}

/**
 * 내 질문 — 데이터테이블 + 검색. 행을 누르면 상세 모달이, 우측 위 버튼을 누르면 질문 작성
 * 모달이 열린다. 순번·표준 메타 열은 두지 않는다(작성자는 언제나 본인이고, 이 표가 답하는
 * 것은 "무엇을 물었고 답이 왔는가"뿐이다).
 * 검색 대상에 답변 본문도 넣는다 — 찾는 사람이 기억하는 말이 질문이 아니라 답에 있을 수 있다.
 */
function MyQuestionsCard({ list }: { list: GuestQuestion[] }) {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
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
      <Card
        title="내 질문"
        count={filtered.length}
        // 카드 헤더의 진입 버튼은 카드 밀도(32px)를 따른다 — GUEST의 48px 하한은 별점·
        // 확인 버튼·사이드바 항목에 걸리는 규정이고(3_9 §3), 여기서 48px을 쓰면 카드 제목
        // 줄에서 버튼만 홀로 커진다. 실제 확인 버튼인 모달의 '질문 등록'은 GuestButton이다.
        actions={
          <Button variant="secondary" onClick={() => setAsking(true)}>
            <MessageCirclePlus className="size-4" />
            질문하기
          </Button>
        }
      >
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
                : '아직 남긴 질문이 없습니다. 오른쪽 위 ‘질문하기’로 첫 질문을 남겨 보세요.'
            }
            onRowClick={(q) => setOpenId(q.id)}
            // 페이저는 목록 화면의 기본 양식(번호줄·건수)을 쓴다 — 한 쪽뿐이어도 노출되어
            // 지금 어디인지·전부 몇 건인지를 항상 답한다(WORKS 목록과 같은 규칙).
            pagination={{
              page: safePage,
              pageSize: GUEST_LIST_PAGE_SIZE,
              total: filtered.length,
              onChange: setPage,
            }}
          />
        </div>
      </Card>
      {opened && <QuestionModal question={opened} onClose={() => setOpenId(null)} />}
      {asking && <AskModal onClose={() => setAsking(false)} />}
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
      answer={
        question.answer_body ? (
          <div
            className={RICH_BODY_CLASS}
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(question.answer_body) }}
          />
        ) : (
          <p className="text-body text-gray-600">담당자의 답변을 기다리고 있습니다.</p>
        )
      }
      files={files ?? []}
    />
  )
}

/** 질문 작성 모달. 등록되면 목록 맨 위에 답변대기로 선다. */
function AskModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const create = useCreateQuestion()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const canSubmit = Boolean(title.trim() && body.trim()) && !create.isPending

  const submit = async () => {
    if (!canSubmit) return
    try {
      await create.mutateAsync({ title: title.trim(), body: body.trim() })
      toast.show('질문을 등록했습니다. 담당자가 확인 후 답변합니다.', 'success')
      onClose()
    } catch {
      toast.show('질문을 등록하지 못했습니다. 잠시 후 다시 시도해 주십시오.', 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      // 쓰던 글이 바깥 클릭 한 번에 사라지면 안 된다 — 닫는 길은 취소 버튼뿐이다.
      dismissible={false}
      title="질문하기"
      size="lg"
      footer={
        <>
          <GuestButton variant="outline" onClick={onClose} disabled={create.isPending}>
            취소
          </GuestButton>
          <GuestButton disabled={!canSubmit} onClick={() => void submit()}>
            {create.isPending ? '등록 중…' : '질문 등록'}
          </GuestButton>
        </>
      }
    >
      {/* 폼 라벨 규격은 화면이 아니라 `Field`가 소유한다(densityScale.formText). */}
      <div className="space-y-4">
        <Field label="제목" required>
          <Input
            autoFocus
            placeholder="예: 중간보고서 제출 방법 문의"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="내용" required>
          <TextArea
            rows={8}
            placeholder="궁금한 내용을 적어 주세요."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
