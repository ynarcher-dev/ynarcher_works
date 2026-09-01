import { Card, cardText, Modal } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { GuestFileList } from '@/pages/modules/FileModule'
import type { GuestFile } from '@/features/moduleHooks'

/**
 * 게시판형 상세 모달(공지사항·QNA 공용) — **WORKS의 같은 이름 모달과 같은 구조**다
 * (2026-09-01 사용자 지정). 머리(제목·날짜) 아래로 본문 → (답변) → 첨부 파일이 각각
 * **자기 카드**로 서며, 모달 본문 바닥은 페이지 바탕(gray-100)이라 카드가 면으로 갈린다.
 * 다른 점은 편집이 없다는 것뿐이다.
 *
 * 글자 규격은 화면이 직접 고르지 않고 `cardText`가, 카드 제목은 `Card`가 소유한다.
 * 첨부는 담당자가 WORKS에서 올린 것을 읽고 내려받기만 한다 — 게스트에게 업로드는 열려
 * 있지 않다(그러려면 attachments INSERT와 Storage 정책을 함께 열어야 한다).
 */
export function BoardDetailModal({
  open,
  onClose,
  meta,
  title,
  date,
  body,
  answer,
  files,
}: {
  open: boolean
  onClose: () => void
  /** 모달 머리에 세울 화면 이름(공지사항·QNA). */
  meta: string
  title: string
  date: string
  body: ReactNode
  /** 본문에 딸린 답변(QNA). 없으면 그 카드를 세우지 않는다. */
  answer?: ReactNode
  files: GuestFile[]
}) {
  return (
    <Modal open={open} onClose={onClose} title={meta} size="xl">
      {/* 모달 본문 바닥을 페이지 바탕으로 깐다(음수 여백으로 모달의 안쪽 여백까지 채운다). */}
      <div className="-mx-5 -my-4 space-y-3 bg-gray-100 px-5 py-4">
        {/* 머리 한 줄 — 카드 밖에 서서 이 모달 전체가 무엇에 대한 것인지 먼저 답한다. */}
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-brand" />
          <p className={`min-w-0 flex-1 ${cardText.subhead}`}>{title}</p>
          <span className={`shrink-0 tabular-nums ${cardText.meta}`}>{date}</span>
        </div>

        <Card title="본문">{body}</Card>
        {answer && <Card title="답변">{answer}</Card>}
        <Card title="첨부 파일" count={files.length}>
          <GuestFileList files={files} />
        </Card>
      </div>
    </Modal>
  )
}
