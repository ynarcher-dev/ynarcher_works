import {
  Badge,
  Card,
  Input,
  MiniPager,
  PageHeader,
  Spinner,
  TextArea,
  usePaged,
  useToast,
} from '@ynarcher/ui'
import { useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { useCreateQuestion, useMyQuestions, type GuestQuestion } from '@/features/qnaHooks'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * QNA — 고정 메뉴 세 번째 줄이자 **게스트가 처음으로 글을 쓰는 화면**(1:1 문의함).
 * 좌측(2)은 내 질문과 답변, 우측(1)은 질문 작성이다(메뉴 화면과 같은 2:1 비율).
 * 다른 참여자의 질문은 보이지 않는다 — 판정은 화면이 아니라 RLS가 한다(qnaHooks 머리말).
 * 답변은 담당자가 WORKS 에디터로 쓰므로 글쓰기·공지와 같은 정화기·조판으로 그린다.
 */
export function QnaPage() {
  const { data, isLoading } = useMyQuestions()
  const list = data ?? []

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <PageHeader
        title="QNA"
        description="사업에 대해 궁금한 점을 남기면 담당자가 답변합니다. 질문과 답변은 본인에게만 보입니다."
      />
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

/** 내 질문 목록(제목 줄 → 펼쳐 읽기). 답변 여부는 배지가 답한다. */
function MyQuestionsCard({ list }: { list: GuestQuestion[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  return (
    <Card title="내 질문" count={list.length}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-body text-gray-600">
          아직 남긴 질문이 없습니다. 오른쪽에서 첫 질문을 남겨 보세요.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-200">
            {pageItems.map((q) => (
              <li key={q.id}>
                {/* GUEST 터치 하한(48px)을 행에도 얹는다(3_9 §3). */}
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-2 py-2.5 text-left hover:bg-gray-25"
                  aria-expanded={openId === q.id}
                  onClick={() => setOpenId(openId === q.id ? null : q.id)}
                >
                  <Badge tone={q.answer_body ? 'success' : 'warning'}>
                    {q.answer_body ? '답변완료' : '답변대기'}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {q.title}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-gray-500">
                    {q.created_at.slice(0, 10)}
                  </span>
                </button>
                {openId === q.id && (
                  <div className="space-y-3 pb-3">
                    {q.body && (
                      <p className="whitespace-pre-line text-body text-gray-800">{q.body}</p>
                    )}
                    {/* 답변은 질문 아래 응답이므로 브랜드 선으로 들여 세운다(WORKS와 같은 자리). */}
                    <div className="border-l-2 border-brand/40 pl-3">
                      {q.answer_body ? (
                        <div
                          className={RICH_BODY_CLASS}
                          dangerouslySetInnerHTML={{
                            __html: sanitizeRichText(q.answer_body),
                          }}
                        />
                      ) : (
                        <p className="text-body text-gray-600">
                          담당자의 답변을 기다리고 있습니다.
                        </p>
                      )}
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
