import { Card, Modal } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { GuestFile } from '@/features/moduleHooks'
import { GuestFileCard } from '@/pages/modules/FileModule'

/**
 * 게시판형 상세 모달(공지사항·QNA 공용) — **WORKS의 같은 이름 모달과 같은 구조**다
 * (2026-09-01 사용자 지정). 구성은 위에서 아래로 [머리(제목·날짜) → 본문 → (딸린 글) →
 * 첨부 파일]이며, 목록에서 행을 눌러 연다. 다른 점은 편집이 없다는 것뿐이다.
 *
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
  extra,
  files,
}: {
  open: boolean
  onClose: () => void
  /** 모달 머리에 세울 화면 이름(공지사항·QNA). */
  meta: string
  title: string
  date: string
  body: ReactNode
  /** 본문에 딸린 글(QNA의 답변). 없으면 그 자리를 세우지 않는다. */
  extra?: ReactNode
  files: GuestFile[]
}) {
  return (
    <Modal open={open} onClose={onClose} title={meta} size="xl">
      <div className="space-y-4">
        {/* 머리 한 줄 — 브랜드 바가 어디까지가 글의 이름인지 답한다(본문이 제목으로 시작해도). */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
          <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-brand" />
          <p className="min-w-0 flex-1 text-title-sm font-semibold text-gray-900">{title}</p>
          <span className="shrink-0 text-caption tabular-nums text-gray-500">{date}</span>
        </div>
        {body}
        {extra}
        {/* 첨부가 없으면 빈 카드 대신 한 줄로 답한다 — 모달은 스스로 닫히는 화면이라
            "없다"는 사실도 그 자리에서 끝나야 한다. */}
        {files.length > 0 ? (
          <GuestFileCard files={files} title="첨부 파일" />
        ) : (
          <Card title="첨부 파일">
            <p className="text-body text-gray-600">첨부된 파일이 없습니다.</p>
          </Card>
        )}
      </div>
    </Modal>
  )
}
